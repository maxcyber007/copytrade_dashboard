# API

REST over JSON. Every response is either

```json
{ "ok": true, "data": { } }
```

or

```json
{ "ok": false, "error": { "code": "INVALID_SYMBOL", "message": "human readable" } }
```

`message` is always member-safe. Technical detail and stack traces stay in the logs
and in `SystemError`, visible to admins only.

## Implemented

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | public | Rate limited per IP. First user becomes ADMIN |
| POST | `/api/auth/login` | public | Rate limited per IP and per email; lockout after 8 failures |
| POST | `/api/auth/logout` | session | Revokes the session row and clears the cookie |
| GET | `/api/auth/session` | public | Returns the current user or `null` |
| GET | `/api/health` | public | 200 healthy / 503 degraded, with per-dependency checks |

## Planned surface

**Accounts** — `GET/POST /api/accounts`, `GET/DELETE /api/accounts/:id`,
`POST /api/accounts/:id/connect`, `POST /api/accounts/:id/disconnect`.
Creating an account requires `platform` (`MT4` | `MT5`) alongside broker, login and
server; connecting reads back the broker's position mode and volume constraints.

**Providers** — implemented: `GET/POST /api/provider/apply` (own application),
`GET /api/providers` (public listing, approved only),
`GET /api/admin/providers`, `POST /api/admin/providers/:id/review`.
Review takes `{ decision: "APPROVE" | "REJECT" | "SUSPEND", publicReason?, reviewNote? }`;
`publicReason` is required unless the decision is `APPROVE`. See
[provider-marketplace.md](provider-marketplace.md).

**Strategies** — `GET /api/strategies`, `GET /api/strategies/:id`,
`POST/PUT/DELETE /api/admin/strategies[/:id]`

**Copy control** — `POST /api/copy/start`, `/pause`, `/stop`, `GET /api/copy/status`

**Trades** — `GET /api/trades`, `GET /api/trades/:id`

**Master events** — `POST /api/master/events` (API key + HMAC, see below)

**Admin** — `GET /api/admin/dashboard`, `/members`, `/accounts`, `/copy-trades`, `/errors`

## Master trade event contract

Headers (the key identifies exactly one strategy — a provider cannot publish into
another provider's strategy):

```
X-Api-Key: <StrategyApiKey.keyId>
X-Timestamp: <unix seconds>
X-Signature: hex(HMAC_SHA256(<strategy secret>, timestamp + "." + rawBody))
```

Body:

```json
{
  "strategyId": "STRATEGY-001",
  "eventId": "unique-event-id",
  "eventType": "OPEN",
  "platform": "MT5",
  "masterAccount": "MASTER-001",
  "ticket": "123456789",
  "symbol": "XAUUSD",
  "orderType": "BUY",
  "volume": 0.10,
  "price": 3345.20,
  "sl": 3338.20,
  "tp": 3360.20,
  "timestamp": "2026-08-22T10:00:00Z"
}
```

Rejected with `INVALID_SIGNATURE` (bad HMAC), `STALE_REQUEST` (timestamp outside
`MASTER_EVENT_MAX_SKEW_SECONDS`), `DUPLICATE_EVENT` (`eventId` already stored) or
`RATE_LIMITED`. Accepted events are persisted and queued; the response never waits
for member execution.

Event types: `OPEN`, `MODIFY`, `CLOSE`, `PARTIAL_CLOSE`, `PENDING_ORDER`, `DELETE_PENDING`.

`platform` is optional and defaults to `MT5`; it records which terminal the master EA
runs on. It does not restrict who may copy the event — MT4 and MT5 members subscribe
to the same strategy.

## Error codes

`UNAUTHORIZED`, `FORBIDDEN`, `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `RATE_LIMITED`,
`VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `INVALID_SIGNATURE`, `STALE_REQUEST`,
`DUPLICATE_EVENT`, `PLATFORM_CONNECTION_ERROR`, `PLATFORM_NOT_SUPPORTED`,
`INVALID_SYMBOL`, `INSUFFICIENT_MARGIN`,
`MARKET_CLOSED`, `INVALID_VOLUME`, `INVALID_STOPS`, `TIMEOUT`, `PROVIDER_ERROR`,
`POSITION_NOT_FOUND`, `RISK_LIMIT_REACHED`, `INTERNAL_ERROR`.
