# Deployment

One codebase, three arrangements. Which is in effect is decided by `APP_ROLE`
and a handful of URLs; no code differs between them.

| | Frontend | Backend | Browser reaches the API |
| --- | --- | --- | --- |
| **A. Single host** | same process | same process | directly, same origin |
| **B. Split, Vercel's domain** | `*.vercel.app` | `itdev.cmtc.ac.th` | through the frontend (proxied) |
| **C. Split, own subdomains** | `app.cmtc.ac.th` | `api.cmtc.ac.th` | directly, same site |

Arrangement **B** is what to deploy now. Moving to **C** later is three
environment variables and no code change.

---

## A. Single host (the default)

Set nothing. `APP_ROLE` defaults to `all`, `API_BASE_URL` falls back to
`APP_URL`, and the frontend calls itself over loopback. This is what
`docker compose up` gives you and what local development uses.

---

## B. Split, on Vercel's own domain

```
   Vercel                                 49.229.108.173  (itdev.cmtc.ac.th)
   ──────                                 ──────────────────────────────────
   copytrade-dashboard.vercel.app         nginx-proxy-manager :443
     landing + dashboard                    │   / → the existing site
     │                                      │
     ├─ page render ──── HTTPS ────────────►├─ /api → copytrade_app:3000
     │                                      │            ├─► copytrade_worker
     └─ /api/* ───────── proxied ──────────►┘            ├─► copytrade_postgres
        (browser only ever                               └─► copytrade_redis
         talks to Vercel)                              no published ports
```

### What was checked on the host, and what it means

```
https://itdev.cmtc.ac.th  →  49.229.108.173,  TLS certificate valid
GET /                     →  200, Server: openresty
GET /api/health           →  404
```

The `openresty` banner is nginx-proxy-manager — that is what it is built on.

Three things follow from that:

- **The certificate is already valid**, so nothing needs issuing. Vercel's proxy
  refuses a self-signed or expired certificate, and this one passes.
- **nginx-proxy-manager already owns ports 80 and 443.** The bundled `nginx` and
  `certbot` services cannot bind them and are not used. This holds for any
  hostname on this IP, a new subdomain included, because every one of them
  arrives at the same proxy.
- **`/api/` is unclaimed** — it returns 404 today, so the API can take it
  without disturbing the site already served at `/`.

### Why the browser does not call the backend directly

`*.vercel.app` and `cmtc.ac.th` are different sites, so a session cookie set by
the backend would be a *third-party* cookie in the browser's eyes. Safari
refuses those outright and Firefox partitions them — sign-in would fail on
iPhone. Forwarding `/api/*` through the frontend makes every browser request
same-origin, and the session a first-party cookie that works everywhere.

Server-side page rendering does **not** go through the proxy: it calls
`API_BASE_URL` directly, which is one hop instead of two.

### 1. Push the code first

Portainer and Vercel both deploy *from GitHub*, so nothing reaches either of
them until this is pushed.

```bash
git add -A
git commit -m "Split frontend from backend for separate deployment"
git push origin claude/mt5-copy-trading-platform-18th6m
```

`.env` is in `.gitignore`, so no secret leaves the host.

### 2. Deploy the backend from Portainer

**Stacks → Add stack → Repository**

| Field | Value |
| --- | --- |
| Repository URL | `https://github.com/maxcyber007/copytrade_dashboard` |
| Reference | `refs/heads/claude/mt5-copy-trading-platform-18th6m` |
| Compose path | `docker-compose.portainer.yml` |
| Authentication | on, if the repository is private — username + a GitHub token |

`docker-compose.portainer.yml` is written for this host specifically. It leaves
out `nginx` and `certbot`, because nginx-proxy-manager already owns 80 and 443
and already holds a valid certificate; and it publishes **no ports at all**, so
nothing can collide with the containers already using 3000, 3333, 5432 and the
rest. The app is reached over nginx-proxy-manager's own Docker network instead.

It also adds a one-shot `migrate` service. The Dockerfile runs no migration of
its own, so without it the app would start against a database with no tables.
`app` and `worker` wait for it to succeed, which means a failed migration stops
the release rather than leaving a half-migrated database serving traffic.

### 3. Stack environment variables

`.env` is gitignored and never reaches the repository, so every value is set
here — which is also where secrets belong, in Portainer rather than in Git.

Find the network name first: **Networks** in Portainer, the one
nginx-proxy-manager is attached to. For a stack of that name it is usually
`nginx-proxy-manager_default`.

| Name | Value |
| --- | --- |
| `PROXY_NETWORK` | `nginx-proxy-manager_default` |
| `APP_URL` | `https://itdev.cmtc.ac.th` |
| `ALLOWED_ORIGINS` | `https://copytrade-dashboard.vercel.app` |
| `POSTGRES_PASSWORD` | a strong password |
| `AUTH_SECRET` | `openssl rand -base64 48` |
| `ENCRYPTION_KEY` | `openssl rand -base64 32` |
| `MASTER_API_KEY` | `openssl rand -hex 16` |
| `MASTER_API_SECRET` | `openssl rand -hex 32` |
| `TRADING_PROVIDER` | `metaapi` |
| `METAAPI_TOKEN` | your MetaApi token |

Everything else has a default. `SESSION_COOKIE_DOMAIN` is left unset on purpose:
the cookie is set on Vercel's domain, and there is no shared parent domain to
scope it to.

**`ENCRYPTION_KEY` is not regenerable.** It decrypts every member's stored
MT4/MT5 credentials; a new one makes all of them unreadable. If this stack is
replacing an existing deployment, carry the current value across rather than
generating a fresh one.

Deploy the stack. The first build compiles the Next.js app on the host and takes
a few minutes.

### 4. Point nginx-proxy-manager at it

Open nginx-proxy-manager (port 81), **Hosts → Proxy Hosts**, edit the entry for
`itdev.cmtc.ac.th`, and on the **Custom locations** tab add:

| Field | Value |
| --- | --- |
| location | `/api` |
| Forward Hostname / IP | `copytrade_app` |
| Forward Port | `3000` |

Container name rather than an IP address: Docker reassigns addresses on restart,
the name does not change. It resolves because the stack joins
nginx-proxy-manager's network.

Expand that location's gear icon and add:

```nginx
proxy_buffering off;
proxy_read_timeout 3600s;
client_max_body_size 2m;
```

The first two are for server-sent events — buffering would hold the stream until
it filled, and the default read timeout would cut an idle connection between
heartbeats. The third is for avatar uploads.

Do **not** add CORS headers. The application answers them, because it holds the
allowlist; setting them in both places sends two values for one header, and a
browser rejects that outright — the request fails rather than being allowed
twice. nginx-proxy-manager already sets `X-Forwarded-For`, which matters because
rate limits and the audit log are keyed on the client address.

Save, then:

```bash
curl -sS https://itdev.cmtc.ac.th/api/health     # expect {"ok":true,...}
curl -sS https://itdev.cmtc.ac.th/               # the existing site, unchanged
```

### 5. Vercel

**vercel.com/new** → import `maxcyber007/copytrade_dashboard`.

- **Project Name**: `copytrade-dashboard` → gives `copytrade-dashboard.vercel.app`
- Framework: Next.js (detected)
- Root Directory: `./`

Set these under **Environment Variables → Production** *before* pressing Deploy.
`API_PROXY_TARGET` is compiled into the route manifest and `NEXT_PUBLIC_*`
values are inlined into the client bundle, so neither takes effect if added
after the first build.

```dotenv
APP_ROLE=frontend
APP_URL=https://copytrade-dashboard.vercel.app
API_BASE_URL=https://itdev.cmtc.ac.th
API_PROXY_TARGET=https://itdev.cmtc.ac.th

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

Then **Settings → Git → Production Branch**: Vercel defaults to `main`, but the
work is on `claude/mt5-copy-trading-platform-18th6m`. Set it and redeploy, or
merge to `main` first.

### 6. Verify

```bash
V=https://copytrade-dashboard.vercel.app

curl -sS -o /dev/null -w "landing      %{http_code}\n" $V/
curl -sS -o /dev/null -w "api proxied  %{http_code}\n" $V/api/health
curl -sS -o /dev/null -w "login page   %{http_code}\n" $V/login
```

All three should be 200. A 502 on `/api/health` means Vercel could not reach the
backend — check that openresty is forwarding `/api/` and that the app container
is up.

Then sign in through a browser and look at **DevTools → Application → Cookies**.
`ct_session` must appear under `copytrade-dashboard.vercel.app` — *not* under
`itdev.cmtc.ac.th`. If it appears under the latter, the proxy is being bypassed
and Safari will not be able to sign in.

### Known limitation of this arrangement

Live updates use server-sent events, and here that stream is held open through
Vercel's proxy. Streaming works — it was tested through an equivalent proxy and
was not buffered — but a long-lived connection may be cut by the platform's own
timeouts. `EventSource` reconnects on its own, so the effect is a reconnection
rather than a failure. It is the main reason to move to arrangement C.

---

## C. Split, on your own subdomains

The tidier arrangement, once two subdomains under `cmtc.ac.th` can be pointed
where they are needed:

- `app.cmtc.ac.th` → CNAME to Vercel
- `api.cmtc.ac.th` → the host, forwarded by openresty as in step 3

`.ac.th` is a public suffix, so `cmtc.ac.th` is the registrable domain and both
subdomains are **same-site**. The cookie is first-party, `SameSite=lax` is
correct, and no proxy is needed: the browser talks to the API directly, which
removes the extra hop and the SSE limitation above.

**Backend `.env`**

```dotenv
APP_URL=https://api.cmtc.ac.th
ALLOWED_ORIGINS=https://app.cmtc.ac.th
SESSION_COOKIE_DOMAIN=.cmtc.ac.th
```

**Vercel** — add the domain to the project, then:

```dotenv
APP_URL=https://app.cmtc.ac.th
API_BASE_URL=https://api.cmtc.ac.th
NEXT_PUBLIC_API_BASE_URL=https://api.cmtc.ac.th

# Removed: the browser now calls the API directly.
API_PROXY_TARGET=
```

If the marketing site gets its own domain too, set `NEXT_PUBLIC_LANDING_HOST`
and `NEXT_PUBLIC_DASHBOARD_HOST` to the two hostnames; each will then redirect
the other's paths, so no page is reachable at two addresses.

---

## Notes for any split arrangement

- **The master EA must be repointed** at `https://itdev.cmtc.ac.th/api/master/events`.
  It authenticates with `MASTER_API_SECRET`, not a browser session, which is why
  that endpoint is exempt from the origin check.
- **`regions` in `vercel.json` is `sin1`** (Singapore), the closest Vercel region
  to a host in Thailand. Every page render makes one call to the backend, so
  that hop dominates time-to-first-byte.
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
- `docker-compose.portainer.yml` publishes no ports whatsoever. The app is
  reachable only over nginx-proxy-manager's Docker network; Postgres and Redis
  only over the stack's own. Nothing new is exposed on the host.
