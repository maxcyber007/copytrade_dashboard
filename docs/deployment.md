# Deployment

## Docker Compose

```bash
cp .env.example .env       # fill in every secret
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
docker compose exec app npx prisma db seed   # optional: plans
```

Services:

| Service | Image / target | Role |
|---|---|---|
| `app` | Dockerfile target `web` | Next.js standalone server on :3000 |
| `worker` | Dockerfile target `worker` | BullMQ copy worker, separate process |
| `postgres` | postgres:16-alpine | Database, volume `postgres_data` |
| `redis` | redis:7-alpine | Queue and rate limiting, AOF persistence |
| `nginx` | nginx:1.27-alpine | Reverse proxy, rate limit, TLS termination |

`app` and `worker` wait for healthy `postgres` and `redis` before starting. The web
container runs as a non-root user.

## HTTPS

Place `fullchain.pem` and `privkey.pem` in `docker/certs/`, then uncomment the `443`
server block and the HTTP→HTTPS redirect in `docker/nginx.conf`. TLS 1.2/1.3 only,
with HSTS enabled.

Nginx passes `X-Forwarded-For`, which is what rate limiting and audit logging use as
the client IP, and disables buffering on `/api/` so server-sent events stream.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request:

1. `npm run check:secrets` — before anything else, so a leak fails fast
2. `prisma migrate deploy` against a real PostgreSQL service
3. typecheck, unit and integration tests, production build
4. a build of both Docker targets (`web` and `worker`), so a broken Dockerfile
   is caught by CI rather than by a deploy

The workflow's environment values are CI-only dummies. Production secrets belong
in the deployment environment and never in a workflow file.

## Backups

```bash
./scripts/backup-db.sh /var/backups/copytrade
```

Writes a compressed, timestamped dump from the `postgres` container, verifies the
archive can be read back (a dump that cannot be restored is not a backup), and
prunes anything older than `RETENTION_DAYS` (default 14). For cron:

```
0 3 * * *  /opt/copytrade/scripts/backup-db.sh /var/backups/copytrade
```

The restore command is printed after every run. **Test a restore before you need
one** — and keep `ENCRYPTION_KEY` backed up separately: without it the stored
trading credentials in a restored dump cannot be decrypted.

## Production checklist

- [ ] `NODE_ENV=production` and `APP_URL` set to the public HTTPS origin
- [ ] Fresh `AUTH_SECRET`, `ENCRYPTION_KEY`, `MASTER_API_KEY`, `MASTER_API_SECRET` — not the dev values
- [ ] `ENCRYPTION_KEY` backed up securely; losing it makes stored credentials unrecoverable
- [ ] Postgres and Redis not published to the host network
- [ ] `docker compose exec app npx prisma migrate deploy` run on every release
- [ ] Database backups scheduled and a restore tested
- [ ] `/api/health` wired to the uptime monitor (503 = degraded)
- [ ] Log shipping configured; confirm no secret appears in the stream
- [ ] Master EA points at the HTTPS endpoint with the production API key
- [ ] `ENCRYPTION_KEY` backed up separately from the database
- [ ] Backups scheduled via `scripts/backup-db.sh`, and a restore rehearsed
- [ ] `TRADING_PROVIDER` left on `mock` until the MetaApi adapter has been run
      against a **demo** account end to end; switching it to `metaapi` also needs
      `npm install metaapi.cloud-sdk` and `METAAPI_TOKEN`

## Scaling

The worker is stateless and horizontally scalable — `docker compose up -d --scale
worker=3`. BullMQ distributes jobs, and the `(eventId, accountId)` unique constraint
keeps concurrent workers from double-copying an event.

## Health

`GET /api/health` returns 200 when database and Redis both answer, 503 otherwise,
with per-dependency latency and the active trading provider.
