# Architecture

## Layers

| Layer | Directory | Responsibility | Must not |
|---|---|---|---|
| UI | `src/app`, `src/components` | Rendering, client state | Import Prisma; contain trading rules |
| API | `src/app/api` | Auth check, validation, HTTP shape | Contain business logic |
| Service | `src/services` | Business rules, orchestration | Talk to Prisma or a vendor SDK directly |
| Repository | `src/repositories` | All database access | Contain business rules |
| Engine | `src/services/copy`, `src/services/risk` | Copy decisions, risk decisions | Perform HTTP calls itself |
| Provider | `src/providers` | Vendor adapters behind one platform-neutral interface (MT4 + MT5) | Leak vendor types or platform branches upward |
| Worker | `src/workers` | Queue consumers, background jobs | Run inside a request lifecycle |

## Request path

1. Route handler receives the request, resolves the session from the cookie and
   enforces the role.
2. Input is parsed with a Zod schema — unparsed input never reaches a service.
3. The service applies business rules and calls repositories/providers.
4. Errors become `AppError` with a stable code; `src/lib/api.ts` maps them to a
   safe response. Technical detail is logged, not returned.

## Why the worker is a separate process

Copy execution must survive a web deploy. `docker-compose` runs `worker` as its own
service so restarting the Next.js tier never interrupts an in-flight copy, and the
worker can be scaled independently of web traffic.

## Idempotency model

- The master EA supplies `eventId` on every event.
- `TradeEvent.eventId` is unique → the same event is stored once even under concurrent delivery.
- `CopyTrade` is unique on `(eventId, accountId)` → a member can only ever have one copy row per event.
- Redis holds a short-lived nonce for fast rejection; the database constraint is
  the authority, so a Redis outage cannot cause a duplicate order.

## Directory map

```
src/
  app/            routes (member, admin, auth groups) and API handlers
  components/     UI primitives and feature components
  lib/            env, prisma, redis, crypto, errors, logger, rate limit, auth, validation
  services/       business logic
  repositories/   database access
  providers/      trading/ (MT4 + MT5), payment/ adapters behind interfaces
  workers/        queue definitions and worker entrypoint
  types/          shared domain types
prisma/           schema, migrations, seed
docker/           nginx config, TLS certificates mount point
docs/             this documentation
```
