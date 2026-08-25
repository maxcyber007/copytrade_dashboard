# Deployment

One codebase, three arrangements. Which is in effect is decided by `APP_ROLE`
and a handful of URLs; no code differs between them.

| | Frontend | Backend | Browser reaches the API |
| --- | --- | --- | --- |
| **A. Single host** | same process | same process | directly, same origin |
| **B. Split, no domain yet** | Vercel's own domain | your host, free hostname | through the frontend (proxied) |
| **C. Split, own domain** | `app.example.com` | `api.example.com` | directly, same site |

Arrangement **B** is the one to use before a domain is registered. Moving from
B to C later is three environment variables and no code change.

---

## A. Single host (the default)

Set nothing. `APP_ROLE` defaults to `all`, `API_BASE_URL` falls back to
`APP_URL`, and the frontend calls itself over loopback. This is what
`docker compose up` gives you and what local development uses.

---

## B. Split, before you own a domain

```
   Vercel                                   Your host  49.229.108.173
   ──────                                   ────────────────────────
   trendxsynex.vercel.app                   trendxsynex.duckdns.org
     landing + dashboard                      │
     │                                        │
     ├─ page render ──── HTTPS ──────────────►│  nginx :443
     │                                        │    ├─► app  (APP_ROLE=api)
     └─ /api/* ───────── proxied ────────────►│    ├─► worker
        (browser only ever                    │    ├─► postgres  internal
         talks to Vercel)                     │    └─► redis     internal
```

### Why it is arranged this way

**A raw IP cannot be used.** A page served over HTTPS cannot call
`http://49.229.108.173` — browsers block mixed content outright — and Let's
Encrypt does not issue certificates for IP addresses, so the backend cannot
simply be given HTTPS as it stands. It needs a hostname, and a free one is
enough.

**The browser must not call the backend directly.** `*.vercel.app` and any free
hostname are different sites, so a session cookie set by the backend would be a
*third-party* cookie in that context. Safari refuses those outright and Firefox
partitions them — sign-in would fail on iPhone. Forwarding `/api/*` through the
frontend makes every browser request same-origin, and the session a first-party
cookie that works everywhere.

Server-side page rendering does **not** go through the proxy: it calls
`API_BASE_URL` directly, which is one hop instead of two.

### 1. A hostname for the backend

Any free DNS name works. [DuckDNS](https://www.duckdns.org) is the simplest:
register `something.duckdns.org` and point it at `49.229.108.173`. It is on the
Public Suffix List, so Let's Encrypt treats it as your own domain for rate
limits rather than sharing one bucket with every other user.

```bash
# Verify it resolves before going further.
nslookup trendxsynex.duckdns.org
```

Port 80 must be reachable from the internet for the certificate to be issued.

### 2. Backend `.env`

```dotenv
NODE_ENV=production
APP_URL=https://trendxsynex.duckdns.org
APP_ROLE=api

# The Vercel origin, which is what arrives in the Origin header once Vercel
# forwards a request. Without it every write is refused as cross-origin.
ALLOWED_ORIGINS=https://trendxsynex.vercel.app

# Both stay EMPTY in this arrangement. The cookie is set on Vercel's domain,
# because that is the host the browser believes served the response, and there
# is no shared parent domain to scope it to.
SESSION_COOKIE_DOMAIN=
SESSION_COOKIE_SAMESITE=lax
```

Everything else — `DATABASE_URL`, `AUTH_SECRET`, `ENCRYPTION_KEY`,
`METAAPI_TOKEN`, `MASTER_API_SECRET` — stays exactly as it is. None of it is
copied to Vercel.

### 3. Certificate

`docker/nginx.conf` ships with the HTTPS block commented out, because nginx
refuses to start pointing at a certificate that does not exist yet.

```bash
# 1. Replace api.trendxsynex.com in docker/nginx.conf with your hostname
#    (two places, both marked).

# 2. Start with HTTP only — enough to answer the ACME challenge.
docker compose up -d nginx

# 3. Issue the certificate.
docker compose run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d trendxsynex.duckdns.org \
  --email you@example.com --agree-tos --no-eff-email

# 4. Uncomment the `listen 443` server block, then bring everything up.
docker compose up -d
```

Renewal is automatic: `certbot` checks twice a day and nginx reloads on the
same cadence to pick up a renewed certificate.

### 4. Vercel

Deploy the repository. Set these for Production **before the first build** —
`API_PROXY_TARGET` is compiled into the route manifest and
`NEXT_PUBLIC_*` values are inlined into the client bundle, so neither takes
effect if added afterwards.

```dotenv
APP_ROLE=frontend
APP_URL=https://trendxsynex.vercel.app
API_BASE_URL=https://trendxsynex.duckdns.org
API_PROXY_TARGET=https://trendxsynex.duckdns.org

# Empty on purpose: the browser uses relative paths, which the proxy forwards.
NEXT_PUBLIC_API_BASE_URL=
NEXT_PUBLIC_LANDING_HOST=
NEXT_PUBLIC_DASHBOARD_HOST=
```

That is the complete list. **No `DATABASE_URL`, no `AUTH_SECRET`, no
`ENCRYPTION_KEY`, no `METAAPI_TOKEN`.** The frontend build has been verified to
succeed with none of them present; if one is ever demanded, something on a
page's import path is reaching for the backend, and the import is the thing to
fix.

### 5. Verify

```bash
# The backend answers on its own hostname.
curl -sS https://trendxsynex.duckdns.org/api/health

# The same endpoint through the frontend proxy.
curl -sS https://trendxsynex.vercel.app/api/health

# Sign in through the frontend and confirm the cookie lands on Vercel's domain.
curl -sS -i -X POST https://trendxsynex.vercel.app/api/auth/login \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://trendxsynex.vercel.app' \
  -d '{"email":"you@example.com","password":"..."}' | grep -i set-cookie
```

### Known limitation of this arrangement

Live updates use server-sent events, and in arrangement B that stream is held
open through Vercel's proxy. Streaming works, but a long-lived connection may
be cut by the platform's own timeouts. `EventSource` reconnects on its own, so
the effect is a reconnection rather than a failure — but it is a reason to move
to arrangement C once a domain exists, where the browser holds the stream
straight to nginx, which is configured for it (`proxy_read_timeout 3600s`).

---

## C. Split, with your own domain

The tidier arrangement, once `example.com` is registered.

```
   trendxsynex.com       ─┐                  api.trendxsynex.com
     landing              │                    │
                          ├─── HTTPS ────────► nginx :443
   app.trendxsynex.com   ─┘   session cookie    └─► app, worker, postgres, redis
     dashboard
```

`app.` and `api.` are subdomains of one registrable domain, so browsers treat
them as **same-site**: the cookie is first-party, `SameSite=lax` is correct, and
no proxy is needed. The browser talks to the API directly, which removes the
extra hop and the SSE limitation above.

Changes from arrangement B:

**Backend `.env`**

```dotenv
APP_URL=https://api.trendxsynex.com
ALLOWED_ORIGINS=https://trendxsynex.com,https://app.trendxsynex.com
SESSION_COOKIE_DOMAIN=.trendxsynex.com
```

**Vercel** — add both domains to the project, then:

```dotenv
APP_URL=https://app.trendxsynex.com
API_BASE_URL=https://api.trendxsynex.com
NEXT_PUBLIC_API_BASE_URL=https://api.trendxsynex.com
NEXT_PUBLIC_LANDING_HOST=trendxsynex.com
NEXT_PUBLIC_DASHBOARD_HOST=app.trendxsynex.com

# Removed: the browser now calls the API directly.
API_PROXY_TARGET=
```

Setting the two host variables makes each domain redirect the other's paths, so
no page is reachable at two addresses.

---

## Notes that apply to every split arrangement

- **The master EA must be repointed** at the backend's public URL:
  `https://<backend-host>/api/master/events`. It authenticates with
  `MASTER_API_SECRET`, not a browser session, which is why that endpoint is
  exempt from the origin check.
- **`regions` in `vercel.json` is `sin1`** (Singapore), the closest Vercel
  region to a host in Thailand. Every page render makes one call to the backend,
  so that hop dominates time-to-first-byte.
- **Vercel's free tier is licensed for non-commercial use.** A platform that
  charges subscriptions is commercial use, which puts it on Pro. Cloudflare
  Pages permits commercial use on its free tier and runs this codebase
  unchanged — only `vercel.json` is Vercel-specific.

## Security notes for the self-host

- **Portainer is published on `http://49.229.108.173:9001`.** That is plain HTTP
  on a public address: the login travels in clear, and Portainer is full control
  of the Docker daemon, which is root on the host. The same host holds
  `ENCRYPTION_KEY`, and the database holds every member's MT4/MT5 credentials
  encrypted with it. Reach it over an SSH tunnel, or move it to 9443 with TLS
  and firewall it to your own address.
- **`docker-compose.dev.yml` publishes Postgres (5432) and Redis (6379).** It is
  for local development only. Redis has no password. Never bring it up on the
  public host.
- The production `docker-compose.yml` publishes only 80 and 443, both on nginx.
  Postgres and Redis are reachable only on the internal Docker network.
- nginx drops any request arriving on an unrecognised hostname with `444` — no
  response at all — so a scanner walking the IP range learns nothing.
