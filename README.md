# CopyTrade Cloud — MT4 / MT5 Cloud Copy Trading Platform

Cloud copy trading for MetaTrader. One master EA runs on the operator's VPS and
publishes trade events to this backend; members connect their **MetaTrader 4 or
MetaTrader 5** accounts through the web dashboard and copy strategies **without
renting a VPS, installing an EA, or keeping a terminal open**.

A member's platform is a property of their account, not a separate product: an MT5
master can be copied to MT4 members and vice versa, with symbol mapping and lot
rounding bridging the brokers.

> **Status: Phase 1–2 complete** (project setup, database schema, authentication,
> Docker). See [Roadmap](#roadmap) for what each later phase adds.

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

Requirements: Node.js 22+, PostgreSQL 16, Redis 7 (or just Docker).

```bash
npm install
cp .env.example .env       # then fill in the secrets below
npm run db:migrate         # create the schema
npm run db:seed            # subscription plans (+ optional dev admin)
npm run dev                # http://localhost:3000
npm run worker:dev         # copy worker, separate process
```

Generate the required secrets:

```bash
openssl rand -base64 48   # AUTH_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY  (must decode to exactly 32 bytes)
openssl rand -hex 16      # MASTER_API_KEY
openssl rand -hex 32      # MASTER_API_SECRET
```

**The first registered user automatically becomes `ADMIN`.** Every later
registration is a `MEMBER`. Alternatively seed an admin with
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` set in the environment (never committed).

## Environment

All variables are documented in [`.env.example`](.env.example) and validated at
startup by `src/lib/env.ts` — the app refuses to boot with a missing or malformed
value rather than failing later at runtime. `.env` is git-ignored; no real secret
belongs in the repository.

## Database

18 models covering identity, trading accounts (MT4/MT5), strategies, copy settings, risk,
master trades, trade events, copy results, position/symbol mapping, billing,
notifications, audit and system errors.

Two constraints carry the idempotency guarantee:

- `TradeEvent.eventId` is `UNIQUE` — a master event is recorded once.
- `CopyTrade` is `UNIQUE (eventId, accountId)` — a member gets at most one copy per event.

Schema and index rationale: [docs/database.md](docs/database.md)

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
| POST | `/api/auth/register` | Create account, start session |
| POST | `/api/auth/login` | Authenticate, start session |
| POST | `/api/auth/logout` | Revoke session |
| GET | `/api/auth/session` | Current user or `null` |
| GET | `/api/health` | Database / Redis / provider health |

The full surface (accounts, strategies, copy control, trades, master events, admin)
is specified in [docs/api.md](docs/api.md).

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
→ risk engine → provider → recorded result. Retries use exponential backoff and
always re-check live position state first, so a retry can never double-open an order.
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
npm run test
```

Planned coverage (Phase 14): authentication, authorization, trade event signature
verification, duplicate events, lot calculation for all four copy modes, risk
limits, position and symbol mapping (including MT4 ticket remapping and MT5
netting), retry behaviour, provider contract, and an
integration test of the full master-trade → member-copy path.

## Roadmap

| Phase | Scope | State |
|---|---|---|
| 1 | Project setup, Tailwind, Docker, authentication | done |
| 2 | Prisma schema + migration | done |
| 3 | Member dashboard | next |
| 4 | Admin dashboard | planned |
| 5 | Strategy management | planned |
| 6 | Mock MT4/MT5 providers | planned |
| 7 | Master trade event API (HMAC) | planned |
| 8 | Copy engine + worker | planned |
| 9 | Risk engine | planned |
| 10 | Real-time dashboard (SSE) | planned |
| 11 | MetaApi provider (MT4 + MT5) | planned |
| 12 | Subscription | planned |
| 13 | Security hardening | planned |
| 14 | Testing | planned |
| 15 | Production deployment | planned |

## Risk notice

This software routes orders to real trading accounts. An API returning HTTP 200 is
never treated as a successful fill: every order records its request, the provider
response, the provider ticket and an execution status before it counts as copied.
