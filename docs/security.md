# Security

This platform routes orders to real money accounts. Security decisions favour
safety over convenience.

## Authentication

- Argon2id (`m=19456, t=2, p=1`) password hashing.
- Sessions are database rows keyed by `sha256(token)`; the raw token exists only in
  an httpOnly, SameSite=Lax cookie (Secure in production). A stolen database dump
  yields no usable session token.
- Failed logins increment a counter; 8 failures lock the account for 15 minutes.
- Login responses are identical for unknown email and wrong password, and an unknown
  email still performs a verify pass, limiting user enumeration.
- Logout revokes the session row — it does not merely drop the cookie.

## Authorization

- `requireUser()` / `requireAdmin()` run server-side on every protected page and
  route handler.
- Middleware only redirects on a missing cookie; it is an optimisation, never the
  access control itself.
- IDOR protection: every account/subscription query filters by the session user's id.
  Ownership is a `WHERE` clause, not a client-supplied flag.

## Input handling

- Every request body is parsed with Zod before reaching a service.
- Prisma parameterises all queries; no SQL is built from strings.
- React escapes rendered output; no user content is injected as HTML.
- Security headers are set globally: `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `Permissions-Policy`.
- Cookies are `SameSite=Lax` and all state changes are `POST`, so a cross-site form
  cannot drive an authenticated action.

## Secrets

- All configuration is validated at boot by `src/lib/env.ts`; a missing
  `ENCRYPTION_KEY` or a short `AUTH_SECRET` stops startup.
- MT5 credentials are encrypted with AES-256-GCM before storage; the key lives only
  in the environment.
- Passwords, tokens, API secrets and encryption keys are in the logger's redaction
  list and can never reach a log line.
- No credential is ever returned to the frontend, rendered in the dashboard, or
  stored in `localStorage`.
- `.env` is git-ignored; only `.env.example`, with empty values, is committed.

## Rate limiting and abuse

- Redis fixed-window limiters: login 5/5min per IP and per email, registration
  5/hour per IP, general API 120/min, master events 600/min.
- Nginx applies an additional `20r/s` limit in front of `/api/`.
- The limiter fails open on a Redis outage so a cache incident cannot halt trading,
  while the database constraints still prevent duplicate orders.

## Master trade event integrity

Forging a trade event would move member money, so the endpoint requires all of:

1. `X-Api-Key` matching `MASTER_API_KEY` (constant-time comparison).
2. `X-Signature` = `HMAC_SHA256(MASTER_API_SECRET, timestamp + "." + rawBody)`, verified
   against the raw body before parsing.
3. `X-Timestamp` within `MASTER_EVENT_MAX_SKEW_SECONDS` — an old capture is stale.
4. A unique `eventId`, held as a Redis nonce and enforced by a unique database
   constraint — a replayed request is rejected, never re-executed.

## Auditing

`AuditLog` records login, logout, registration, account add/connect/disconnect,
strategy subscription, copy start/pause/stop, copied and failed trades, risk
triggers and admin actions, with actor, IP, user agent and resource id.

## Error disclosure

Members see a mapped, non-technical message. Provider errors, stack traces and
payloads go to structured logs and `SystemError`, exposed only through admin routes.
