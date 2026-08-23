# Signal provider marketplace

Members are copiers by default. Any member can apply to become a **signal
provider**: someone who publishes strategies that other members copy, on their own
commercial terms.

## Application lifecycle

```
member applies ──► PENDING ──► APPROVED ──► (may be) SUSPENDED
                      │
                      └──────► REJECTED ──► may apply again
```

- `POST /api/provider/apply` creates the profile. It is **always** created as
  `PENDING`; nothing a member submits can approve their own listing.
- An admin reviews it through `POST /api/admin/providers/:id/review` with
  `APPROVE`, `REJECT` or `SUSPEND`. Rejection and suspension **require** a
  `publicReason`, which the applicant sees.
- `reviewNote` is internal. It is stored for admins and never included in the
  applicant's own view or in any public response.
- A `REJECTED` applicant may submit a new application. The previous decision
  (`reviewedAt`, `reviewedById`, `reviewNote`, `publicReason`) is cleared so an old
  rejection cannot linger on the new submission.
- `requireApprovedProvider()` guards every provider action. A `PENDING` or
  `SUSPENDED` provider can still sign in and see their own status, but cannot
  publish.

## Commercial terms

A provider sets both, either, or neither:

| Field | Meaning | Limits |
|---|---|---|
| `performanceFeePct` | Share of profit taken from each subscriber | 0–50% |
| `subscriptionPriceMonthly` | Flat monthly price per subscriber | 0–10,000 |

Zero on both means the strategy is published for free. Terms are shown to members
before they subscribe. `ProviderPayout` records what a provider earned per period
(`grossAmount`, `feeAmount`, `netAmount`, status), unique per
`(providerId, periodStart, periodEnd)`.

Payout destinations are stored in `encryptedPayoutDetails`, encrypted with
AES-256-GCM exactly like trading credentials.

## Strategy ownership

`Strategy.ownerType` distinguishes the two cases:

- `PLATFORM` — run by the operator, as before. `providerId` is null.
- `PROVIDER` — owned by an approved member, pushed from **their** master account.

Deleting a provider cascades to their strategies. A provider's master account is an
ordinary `TradingAccount` with `accountRole = MASTER`, so a provider on MT4 and a
provider on MT5 work identically.

## Per-strategy master credentials

With many providers publishing, a single platform-wide master key would let any
provider publish into anyone's strategy. Each strategy therefore has its own
credentials in `StrategyApiKey`:

| Field | Purpose |
|---|---|
| `keyId` | Public identifier sent in `X-Api-Key` |
| `encryptedSecret` | HMAC secret, AES-256-GCM encrypted (shown to the provider once) |
| `lastUsedAt`, `lastUsedIp` | Detect a key being used from somewhere unexpected |
| `revokedAt` | Revoke a leaked key without touching any other provider |

The secret must be recoverable to verify an HMAC, so it is **encrypted**, not
hashed — unlike passwords and session tokens, which are hashed because they never
need to be read back.

Event verification is otherwise unchanged: API key, HMAC signature over the raw
body, timestamp window and unique `eventId` (see [api.md](api.md) and
[security.md](security.md)). The key resolves to exactly one strategy, so an event
can only ever be written to that strategy.

## Public exposure

`GET /api/providers` lists **approved providers only**, through an explicit field
allowlist (`publicProviderSelect`): display name, slug, headline, bio, website,
country, years trading, terms and aggregate counts. Emails, review notes, payout
details and the owning user id are never in a public response.

## Audit

`PROVIDER_APPLIED`, `PROVIDER_APPROVED`, `PROVIDER_REJECTED`, `PROVIDER_SUSPENDED`,
`PROVIDER_KEY_ISSUED` and `PROVIDER_KEY_REVOKED` are written to `AuditLog` with the
actor, the applicant and the decision.

## Publishing without an EA

A strategy can publish straight from a trading account the platform is already
connected to. The provider picks one of their own accounts as the strategy's
**publishing source**, and the worker polls it every `MASTER_WATCH_SECONDS`
(default 15), turning what changed into exactly the trade events a master EA
would have sent. Everything downstream is unchanged — same `ingestMasterEvent`,
same idempotency, same copy engine — so there is one copy path, not two.

| What the poll sees | What it publishes |
| --- | --- |
| A ticket that was not there before | `OPEN` |
| Stop loss or take profit changed | `MODIFY` |
| Volume decreased | `PARTIAL_CLOSE`, carrying the volume that was closed |
| Ticket gone | `CLOSE`, with the broker's own close price and realised profit |
| Volume increased | nothing — logged as unsupported (see below) |

Three properties decide whether this is safe to run against real money:

- **Event ids are derived, not random.** Each id is a hash of the strategy, the
  ticket, the kind of change and what makes it distinct, so a poll that runs
  twice — a retry, a restart mid-sweep, two workers — produces the same id, and
  the second is rejected by the same unique index that protects the EA path. A
  copy platform that double-sends an `OPEN` doubles every follower's position.
- **Positions already open when watching starts are never copied.** The first
  poll after linking an account records them as a baseline and publishes
  nothing. A follower cannot enter a trade that began before they were
  following it, at a price that has already moved. Relinking an account starts
  a fresh baseline for the same reason.
- **An unreachable account publishes nothing.** Positions that cannot be seen
  are unknown, not closed — publishing `CLOSE` for all of them because the
  broker is briefly unreachable would close every follower's position for
  nothing.

Two limits worth stating plainly:

- **Adding to an open position is not copied.** The copy engine has no event for
  an increase, so it is counted and logged
  (`MASTER_WATCH_VOLUME_INCREASE_UNSUPPORTED`) rather than silently ignored — a
  follower whose position stops tracking the master's size is being misled.
- **Latency is the poll interval.** A trade reaches followers up to
  `MASTER_WATCH_SECONDS` after the master opens it. MetaApi also offers a
  streaming connection, which would cut this to near real time; polling is the
  simpler first implementation and the interval is the honest cost of it.
