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
