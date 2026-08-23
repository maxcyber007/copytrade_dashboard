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

## Browser-facing hardening

- A Content Security Policy restricts every source to the origin:
  `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`,
  `base-uri 'self'`, and no third-party script, font, image or connection.
  Next injects inline bootstrap scripts and styles, so those remain permitted;
  `unsafe-eval` is development-only.
- HSTS with preload, `Cross-Origin-Opener-Policy: same-origin`, and a
  `Permissions-Policy` that turns off camera, microphone, geolocation and
  payment.
- Every `/api/*` response is `no-store`, so account data is never held by a
  proxy or the browser cache.
- **CSRF has two layers.** Session cookies are `SameSite=Lax`, which blocks
  cross-site form posts; on top of that, any POST/PUT/PATCH/DELETE whose
  `Origin` does not match the host is rejected with 403. `/api/master/events`
  is exempt because a master EA is a machine client with no browser origin —
  it is protected by its HMAC signature instead.

## Secret scanning

`npm run check:secrets` fails the build if a tracked file contains a private key
block, a cloud or gateway token, a JWT, or a secret-shaped assignment with a real
value — and if a file that must never be tracked (`.env`, `*.pem`, keys) is.
It runs in CI before anything else. Values that are clearly not secrets (code
reading a variable, `${{ }}` interpolation, `ci-`/`test-`/`example-` prefixes)
are excluded by value shape rather than by allowlisting whole files, so a real
secret in one of those files is still caught.

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
- Trading account credentials (MT4 and MT5 alike) are encrypted with AES-256-GCM
  before storage; the key lives only
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

## Administrative privilege boundaries

- An administrator cannot change their own role or status, delete their own
  account, or leave the platform with no active administrator. These are checked
  in the service, not the screen, so the API enforces them too.
- Suspending a member revokes their sessions in the same transaction that pauses
  their subscriptions: an open session cannot outlive the suspension.
- A role change revokes that member's sessions, so a stale cookie cannot keep
  the privileges it was issued with.
- Deletion requires the admin to type the member's email, and is refused while
  the member is still copying or still connected to a broker.
- Every change and deletion is written to `AuditLog` with the acting admin, the
  target and what changed — and the deletion entry is written before the row it
  describes is removed.

## Provider privilege boundaries

- A provider application is always created as `PENDING`; the status field is not
  accepted from the client, so a member cannot self-approve.
- Only an admin can review an application, and the review route calls
  `requireAdmin()` before anything else.
- `requireApprovedProvider()` gates every provider action, so a `PENDING` or
  `SUSPENDED` provider cannot publish.
- The public listing uses an explicit field allowlist and filters to `APPROVED`,
  so emails, review notes and payout details cannot leak through it.
- Internal review notes are excluded from the applicant's own view; only the
  member-facing `publicReason` is returned to them.
- Each strategy has its own master API key, so a compromised provider key cannot
  publish trade events into another provider's strategy and can be revoked alone.

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
