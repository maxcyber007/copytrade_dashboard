# Member, provider and admin surfaces

## Member

| Page | What it shows |
|---|---|
| `/dashboard` | Balance, equity, floating P/L, today's P/L, drawdown, open trades, connected accounts, active subscriptions, plus per-account and per-subscription state |
| `/account` | Add, connect, sync and remove MT4/MT5 accounts |
| `/strategies` | Browse published strategies, subscribe with lot and risk settings, start/pause/stop copying |
| `/history` | Every copy attempt with both lots, both prices, status, latency |
| `/performance` | Win rate, profit factor, average win and loss, daily profit chart |

**Figures are computed, never sampled.** Balance and equity come from cached account
metrics refreshed by the provider; today's and total P/L come from recorded
`CopyTrade` rows. A member with no connected account sees an empty state, not
placeholder numbers.

Drawdown compares summed equity against the **sum of each account's own high-water
mark**. Comparing against a single account's peak reports a negative drawdown the
moment a second account is added.

## Copy control

A subscription is created `IDLE`. Starting requires a **connected** account and an
**ACTIVE** strategy — copying into an account the platform cannot reach would fail
on the first trade, so it is refused up front.

An account is `COPYING` only while at least one of its subscriptions is. Pausing a
subscription, stopping it, unsubscribing, or an admin pausing the whole strategy all
re-evaluate that, so the account state can never disagree with its subscriptions.

## Provider

| Page | What it does |
|---|---|
| `/provider/apply` | Application and its review state |
| `/provider/strategies` | Create strategies, issue and revoke master EA keys |

A provider's strategy is created as `DRAFT` and **an administrator decides when it
goes live** — a provider cannot activate their own draft. Issuing a key returns the
secret exactly once; it is stored encrypted and is never returned again, so a lost
secret is replaced rather than recovered.

## Admin

| Page | What it shows |
|---|---|
| `/admin/dashboard` | Members, accounts, connection state, strategies, pending applications, copy attempts and failures, unresolved errors |
| `/admin/members` | Every member with account and subscription counts, plus edit and delete |
| `/admin/accounts` | Every trading account, its connection state and last error |
| `/admin/providers` | Applications with approve / reject / suspend |
| `/admin/strategies` | Create platform strategies; activate, pause, stop or delete any strategy |
| `/admin/copy-trades` | Every attempt including the technical error codes |
| `/admin/errors` | `SystemError` rows raised by the API, workers and providers |

Pausing or stopping a strategy pauses every subscriber immediately, and asks whether
to keep or close existing member positions. Deleting a strategy is refused while
members are still subscribed to it.

## Member management

An administrator can change a member's name, role and status, clear a login
lockout, and delete the account.

**Suspending stops activity immediately, not at next sign-in.** It revokes the
member's sessions, pauses every subscription and clears the copy status on their
accounts, so a suspended member cannot keep receiving trades on an open session.

**Deletion is guarded on four sides:**

| Guard | Why |
|---|---|
| Nobody may change their own role or status | An admin cannot lock the platform out of itself by mistake |
| Nobody may delete their own account | Same, and it keeps an actor for the audit trail |
| The last active administrator cannot be demoted, suspended or deleted | Otherwise nobody can administer anything |
| The admin must type the member's email | Deletion cascades to accounts, subscriptions and copy history |

Deletion is also **blocked while the member is still copying or still has a
connected account**. The API reports each blocker so the screen can list them,
because deleting removes the stored credentials — anything still running at a
broker would be left with no way to reach it.

**Positions already open at a broker are not closed by deletion.** They remain
under the member's own control; the platform only loses its ability to act on
them. The screen says so before the confirmation is accepted.

The audit entry is written *before* the delete, so the record of who removed
whom survives the member it describes.

**Technical detail stops here.** Members see a mapped, non-technical message; the
provider response, error code and stack stay on the admin surfaces and in the logs.
