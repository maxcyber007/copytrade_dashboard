# Database

PostgreSQL 16 via Prisma. Schema: `prisma/schema.prisma`.

## Model groups

**Identity** — `User`, `Session`
Passwords are Argon2id hashes. Sessions store `sha256(token)`; the raw token exists
only inside the httpOnly cookie, so a database dump cannot be replayed as a login.

**Trading accounts** — `MT5Account`
Holds broker, login, server, account type, currency and provider account id, plus
cached balance/equity/floating P&L refreshed by the sync worker. Credentials, when a
provider requires them, live in `encryptedPassword` as an AES-256-GCM payload.
Unique on `(userId, login, server)`.

**Strategies** — `Strategy`, `StrategySubscription`, `CopySettings`, `RiskProfile`, `RiskState`
A subscription links one member account to one strategy and is unique on
`(accountId, strategyId)`. Copy settings and the risk profile hang off the
subscription; `RiskState` holds per-account rolling daily counters.

**Master flow** — `MasterTrade`, `TradeEvent`
`MasterTrade` is the position on the master account, unique on `(strategyId, ticket)`.
`TradeEvent` is the append-only log of what the EA reported, keyed by the EA's
`eventId` (unique) and keeping the raw payload for audit.

**Copy results** — `CopyTrade`, `PositionMapping`
`CopyTrade` records every attempt with request, provider response, latency, attempts
and error code — unique on `(eventId, accountId)`. `PositionMapping` maps
master ticket → member account → member ticket, unique on `(accountId, masterTicket)`,
so a later MODIFY or CLOSE resolves to the right member position.

**Symbols** — `SymbolMapping`
Scoped global → strategy → account; the most specific enabled mapping wins, which
handles broker suffixes such as `XAUUSD`, `XAUUSD.a`, `XAUUSDm`, `GOLD`.

**Billing** — `SubscriptionPlan`, `Subscription`, `PaymentTransaction`
Plans are seeded (FREE/BASIC/PRO/PREMIUM). No gateway is wired; payments go through
a `PaymentProvider` interface.

**Operations** — `Notification`, `AuditLog`, `SystemError`

## Indexes

Every foreign key used for filtering is indexed, plus the fields the dashboards sort
and filter on: `userId`, `strategyId`, `accountId`, `subscriptionId`, `masterTicket`,
`memberTicket`, `eventId`, `status`, `createdAt`.

## Money and volume types

All monetary columns are `Decimal(18,2)`, prices `Decimal(18,5)` and lot sizes
`Decimal(10,2)`. Floating point is never used for balances or volumes; `toNumber()`
in `src/lib/utils.ts` exists for display only.

## Commands

```bash
npm run db:migrate   # dev migration
npm run db:deploy    # apply migrations in production
npm run db:seed      # subscription plans (+ optional dev admin)
npm run db:studio
```
