# CopyTrade Cloud — MT4 / MT5 Cloud Copy Trading Platform

Cloud copy trading for MetaTrader, with a marketplace on both sides. Members
connect their **MetaTrader 4 or MetaTrader 5** accounts through the web dashboard
and copy strategies **without renting a VPS, installing an EA, or keeping a
terminal open** — and any member can apply to become a **signal provider** and
publish strategies of their own, on their own terms.

A member's platform is a property of their account, not a separate product: an MT5
master can be copied to MT4 members and vice versa, with symbol mapping and lot
rounding bridging the brokers.

> **Status: Phases 1–15 complete except the MetaApi adapter (Phase 11).**
> Everything runs on the mock trading provider: dashboards, strategy management,
> the provider marketplace, signed master trade events, the copy and risk
> engines, live updates, plans and billing, security hardening, tests and
> deployment. `npm run demo` drives a master trade to member accounts end to end.
>
> **Phase 11 is deliberately unfinished**: `MetaApiProvider` throws on every
> method rather than shipping guessed request shapes against live accounts.
> See [docs/trading-provider.md](docs/trading-provider.md) for exactly what must
> be verified before writing it.

## Architecture

```
Browser (Next.js App Router)
   |  httpOnly session cookie
   v
API Route Handlers  -- Zod validation -- RBAC guard -- rate limit
   |
   v
Service Layer  (business rules only)
   |
   +-- Repository Layer  (the only code that touches Prisma)
   |
   +-- Copy Engine -> Redis / BullMQ -> Copy Worker (separate process)
   |                                        |
   |                                   Risk Engine
   |                                        |
   +------------------ ITradeProvider <-----+
                              |          (MT4 + MT5 behind one interface)
                              +-- Mock providers    (default, no live money)
                              +-- MetaApiProvider   (Phase 11)
```

Layer rules, enforced by review:

- Components never import Prisma, and never contain trading logic.
- Route handlers validate + authorize, then delegate to a service.
- Services never call a provider SDK directly — only through `ITradeProvider`.
- Only repositories talk to the database.

Details: [docs/architecture.md](docs/architecture.md)

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, dark/light mode |
| Backend | Next.js Route Handlers (REST), Zod validation |
| Database | PostgreSQL 16 + Prisma ORM |
| Cache / Queue | Redis 7 + BullMQ (worker runs as its own process) |
| Auth | Custom DB-backed sessions, Argon2id password hashing, `ADMIN` / `MEMBER` roles |
| MT4 / MT5 | `ITradeProvider` abstraction — mock providers today, MetaApi later |
| Deployment | Docker, Docker Compose, Nginx, HTTPS |

## Installation

Requirements: Node.js 22+ and Docker (or your own PostgreSQL 16 and Redis 7).

```bash
npm run setup        # .env with generated secrets, containers, migrations, seed
npm run dev          # http://localhost:3000
npm run worker:dev   # copy worker, separate terminal
```

`npm run setup` never overwrites an existing `.env`, and is safe to re-run. It is a
Node script, so Windows needs no WSL, Git Bash or `make` — PowerShell is enough.
Setting up by hand, or not using Docker? See
**[docs/getting-started.md](docs/getting-started.md)** for the step-by-step path,
the first-run walkthrough and troubleshooting.

**The first registered user automatically becomes `ADMIN`.** Every later
registration is a `MEMBER`. Alternatively seed an admin with
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` set in the environment (never committed).

## Environment

All variables are documented in [`.env.example`](.env.example) and validated at
startup by `src/lib/env.ts` — the app refuses to boot with a missing or malformed
value rather than failing later at runtime. `.env` is git-ignored; no real secret
belongs in the repository.

## Database

22 models covering identity, trading accounts (MT4/MT5), signal providers and
payouts, strategies and their master API keys, copy settings, risk,
master trades, trade events, copy results, position/symbol mapping, billing,
notifications, audit and system errors.

Two constraints carry the idempotency guarantee:

- `TradeEvent.eventId` is `UNIQUE` — a master event is recorded once.
- `CopyTrade` is `UNIQUE (eventId, accountId)` — a member gets at most one copy per event.

Schema and index rationale: [docs/database.md](docs/database.md)

## Trying it out

With the app running (`npm run dev` or `docker compose up -d`):

```bash
npm run smoke                                   # 75 checks against http://localhost:3000
node scripts/smoke-test.mjs https://your-host   # or any deployment
npm run demo                                    # drive a master trade to member accounts
```

The script exercises health, registration, validation, session handling, login,
access control, security headers, rate limiting and logout against a live server,
using throwaway accounts with random emails so it is safe to re-run on a
development database. It prints a pass/fail line per check.

Registration is rate limited to 5 requests per hour per IP, so re-running the
script several times in one hour will skip the registration checks. Reset the
counter with:

```bash
redis-cli --scan --pattern 'ratelimit:register:*' | xargs -r redis-cli del
```

By hand, the same path is: open `http://localhost:3000`, create an account (the
first one becomes ADMIN), and you land on the dashboard. Sign out, register a
second account, and it becomes a MEMBER that is redirected away from `/admin`.

## Development

```bash
npm run dev          # Next.js dev server
npm run worker:dev   # BullMQ worker with reload
npm run typecheck    # tsc --noEmit
npm run test         # vitest
npm run db:studio    # Prisma Studio
```

## Docker

```bash
cp .env.example .env      # fill in secrets
docker compose up -d      # app + worker + postgres + redis + nginx
docker compose exec app npx prisma migrate deploy
```

Services: `app` (Next.js standalone), `worker` (copy engine), `postgres`, `redis`,
`nginx` (reverse proxy, rate limiting, TLS termination — certificates mount at
`docker/certs`). See [docs/deployment.md](docs/deployment.md).

## API

REST, JSON, `{ ok: true, data }` / `{ ok: false, error: { code, message } }`.

Implemented today:

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/accounts` | List / add MT4 and MT5 accounts |
| GET/DELETE | `/api/accounts/:id` | Account detail with live positions / remove |
| POST | `/api/accounts/:id/connect` `…/disconnect` `…/sync` | Provider session and metric refresh |
| GET | `/api/strategies`, `/api/strategies/:id` | Strategies a member may subscribe to |
| POST | `/api/copy/subscribe`, `/start`, `/pause`, `/stop` | Subscription and copy control |
| PUT/DELETE | `/api/copy/:id/settings`, `/api/copy/:id` | Change lot and risk settings / unsubscribe |
| GET | `/api/trades` | Copy history |
| POST | `/api/master/events` | Master EA trade events (API key + HMAC + timestamp + eventId) |
| GET/POST | `/api/provider/strategies` | A provider's own strategies |
| POST/DELETE | `/api/provider/strategies/:id/keys`, `/api/provider/keys/:id` | Issue / revoke master EA credentials |
| GET/POST/PUT/DELETE | `/api/admin/strategies[/:id][/status]` | Admin strategy management |
| GET | `/api/admin/dashboard`, `/members`, `/accounts`, `/copy-trades`, `/errors` | Admin surfaces |
| GET/PATCH/DELETE | `/api/admin/members/:id` | Member detail, edit, and guarded deletion |
| POST | `/api/auth/register` | Create account, start session |
| POST | `/api/auth/login` | Authenticate, start session |
| POST | `/api/auth/logout` | Revoke session |
| GET | `/api/auth/session` | Current user or `null` |
| GET | `/api/health` | Database / Redis / provider health |
| GET/POST | `/api/provider/apply` | Own provider application: read state, or apply |
| GET | `/api/providers` | Public marketplace listing (approved providers only) |
| GET | `/api/admin/providers` | Admin: applications with status counts |
| POST | `/api/admin/providers/:id/review` | Admin: approve, reject or suspend |

The full surface (accounts, strategies, copy control, trades, master events, admin)
is specified in [docs/api.md](docs/api.md).

## Signal providers

Any member can apply to publish strategies. Applications are always created as
`PENDING` and reviewed by an admin; rejection and suspension require a reason the
applicant can read, while the internal review note stays admin-only. Approved
providers publish from their own MT4/MT5 master account, and **each strategy gets
its own signed API key**, so one provider can never publish events into another's
strategy and a leaked key is revoked in isolation. Providers set a performance fee,
a monthly price, both, or neither.

See [docs/provider-marketplace.md](docs/provider-marketplace.md).

## Trading provider (MT4 + MT5)

Business logic depends only on the `ITradeProvider` interface, never on a vendor SDK.
One interface serves both platforms; the implementation absorbs the differences —
MT4 is hedging-only and issues a new ticket on partial close, while MT5 may be
netting, where the broker keeps one net position per symbol. Mock providers
(Phase 6) make the whole system testable without a live account or real money;
`MetaApiProvider` (Phase 11), which serves both platforms, will be written against
the current official MetaApi documentation at that time.
See [docs/trading-provider.md](docs/trading-provider.md).

## Copy engine

Master EA → signed `POST /api/master/events` → duplicate check → queue → copy worker
→ symbol mapping → lot calculation → risk engine → provider → recorded result.

Three properties carry the safety:

- **Idempotency is structural.** The `CopyTrade` row is created before any order is
  sent, inside the unique `(eventId, accountId)` constraint, so a replayed event,
  a retry or a second worker cannot open a duplicate order.
- **A retry re-checks reality.** Before opening, the worker reads live positions and
  looks for one carrying this copy's id; if the previous attempt did land, it is
  recorded as a success rather than sent again.
- **HTTP 200 is not a fill.** A copy counts as `SUCCESS` only when the provider
  returns an execution with a broker ticket.

See [docs/copy-engine.md](docs/copy-engine.md).

## Security

- Argon2id password hashing; sessions stored as SHA-256 hashes, raw token only in an
  httpOnly/SameSite cookie.
- Account lockout after repeated failures, plus per-IP and per-email rate limiting.
- Account credentials encrypted with AES-256-GCM; never logged, never returned to the
  frontend, never placed in `localStorage`.
- Master trade events require API key + HMAC-SHA256 signature + timestamp window +
  unique event id (replay protection).
- Parameterised queries via Prisma (no string-built SQL), strict security headers,
  audit logging of every sensitive action.

See [docs/security.md](docs/security.md).

## Testing

```bash
npm run test     # unit + integration (vitest)
npm run smoke    # 75 end-to-end checks against a running server
npm run verify   # everything CI runs
```

Unit tests cover credential encryption and HMAC, password hashing and auth
validation, provider application rules, the mock provider's MT4 and MT5
behaviour, lot calculation in all four modes with clamping and rounding, and
every risk limit.

The integration suite runs the real path against a real database — master trade
event → copy engine → member accounts → copy trade rows — and asserts that one
master trade produces different volumes for two members, that reprocessing an
event opens nothing new, that the `(eventId, accountId)` constraint rejects a
duplicate copy, that a partial close is proportional, that a disconnected member
is not attempted, and that sub-minimum and disallowed-symbol trades are skipped
rather than silently resized. It skips itself when no database is reachable.

CI (`.github/workflows/ci.yml`) runs the secret scan, migrations, typecheck,
both test suites and the build against PostgreSQL and Redis services, plus a
build of both Docker targets.

## Roadmap

| Phase | Scope | State |
|---|---|---|
| 1 | Project setup, Tailwind, Docker, authentication | done |
| 2 | Prisma schema + migration | done |
| 3 | Member dashboard, trading accounts | done |
| 4 | Admin dashboard, members, accounts, errors | done |
| 5 | Strategy management (admin + provider) | done |
| 6 | Mock MT4/MT5 provider | done |
| 7 | Master trade event API (HMAC) | done |
| 8 | Copy engine + worker | done |
| 9 | Risk engine | done |
| 10 | Real-time dashboard (SSE) | done |
| 11 | MetaApi provider (MT4 + MT5) | **not implemented** — adapter throws until verified against the official API |
| 12 | Subscription and billing | done |
| 13 | Security hardening | done |
| 14 | Testing (unit + integration) | done |
| 15 | Production deployment (CI, backups) | done |

## Risk notice

This software routes orders to real trading accounts. An API returning HTTP 200 is
never treated as a successful fill: every order records its request, the provider
response, the provider ticket and an execution status before it counts as copied.
