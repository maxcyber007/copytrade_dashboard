# Running the project on a development machine

Two paths. **Path A** is the fast one and works on macOS, Linux and Windows.
Everything runs through Node, so Windows needs **no WSL, no Git Bash and no
`make`** — plain PowerShell or Command Prompt is enough.

---

## Path A — one command (recommended)

Requirements: [Node.js 22+](https://nodejs.org) and [Docker Desktop](https://www.docker.com/products/docker-desktop/) running.

```bash
git clone -b claude/mt5-copy-trading-platform-18th6m https://github.com/maxcyber007/copytrade_dashboard
cd copytrade_dashboard
npm run setup
```

`npm run setup` does all of this, and is safe to run again:

1. checks your Node version
2. installs dependencies
3. writes `.env` with freshly generated secrets — **an existing `.env` is never overwritten**
4. starts PostgreSQL and Redis containers (`docker-compose.dev.yml`)
5. applies the database migrations
6. seeds the subscription plans

Then, in two terminals:

```bash
npm run dev          # http://localhost:3000
npm run worker:dev   # the copy worker (Phase 8 onward; it idles for now)
```

Verify it:

```bash
npm run smoke        # 85 automated checks against the running server
```

Both `npm run setup` and `npm run smoke` are Node scripts
(`scripts/dev-setup.mjs`, `scripts/smoke-test.mjs`), so they behave identically on
every platform.

---

## Path B — your own PostgreSQL and Redis

If you already run PostgreSQL and Redis, or cannot use Docker:

```bash
git clone -b claude/mt5-copy-trading-platform-18th6m https://github.com/maxcyber007/copytrade_dashboard
cd copytrade_dashboard
npm install
cp .env.example .env
```

Create the database:

```bash
createdb copytrade
psql -c "CREATE ROLE copytrade LOGIN PASSWORD 'copytrade';"
psql -c "GRANT ALL PRIVILEGES ON DATABASE copytrade TO copytrade;"
```

Fill in the four secrets in `.env`:

```bash
openssl rand -base64 48   # AUTH_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY   (must decode to exactly 32 bytes)
openssl rand -hex 16      # MASTER_API_KEY
openssl rand -hex 32      # MASTER_API_SECRET
```

No `openssl` (typical on Windows)? Use Node:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Point `DATABASE_URL` and `REDIS_URL` at your instances, then:

```bash
npm run db:migrate
npm run db:seed
npm run dev
```

---

## First run

1. Open `http://localhost:3000` — the landing page.
2. **Register. The first account becomes `ADMIN`**; every later registration is a `MEMBER`.
3. Register a second account to see the member view, then try `/admin/dashboard` with it — you are redirected away.
4. Apply as a signal provider at `/provider/apply`, then approve it from the admin account at `/admin/providers`.

Prefer a seeded admin instead? Set the variables before seeding — they are read
from the environment so no credential is committed:

```bash
SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD='ChangeMe123' npm run db:seed
```

---

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server on :3000 |
| `npm run worker:dev` | Copy worker, separate process, reloads on change |
| `npm run smoke` | 85 end-to-end checks against the running server |
| `npm run demo` | Drives a master trade through the copy engine to member accounts (needs the worker running) |
| `npm run test` | Unit tests (vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:studio` | Browse the database in Prisma Studio |
| `npm run db:migrate` | Create and apply a migration after a schema change |
| `npm run dev:infra` / `dev:infra:down` | Start / stop the dev containers |

---

## Troubleshooting

**`Can't reach database server at localhost:5432`**
PostgreSQL is not running. `npm run dev:infra` (Docker), `brew services start postgresql@16` (macOS)
or `sudo service postgresql start` (Linux). The setup script checks this before
migrating and tells you the same thing.

**`Invalid environment configuration: ENCRYPTION_KEY ...`**
The app validates configuration at boot and refuses to start on a bad value.
`ENCRYPTION_KEY` must be base64 that decodes to exactly 32 bytes, and `AUTH_SECRET`
must be at least 32 characters. Regenerate with the commands above.

**Registration returns 429**
Registration is rate limited to 5 per hour per IP, on purpose. Clear the counter:

```bash
redis-cli --scan --pattern 'ratelimit:register:*' | xargs -r redis-cli del
```

**Redis connection errors**
`npm run dev:infra`, or point `REDIS_URL` at your own instance. Rate limiting fails
open if Redis is down, so the app still runs — but the smoke test's rate-limit
check will fail.

**Port 3000 or 5432 already in use**
Change `PORT` in `.env` for the app; for PostgreSQL, edit the port mapping in
`docker-compose.dev.yml` and the port in `DATABASE_URL`.

**Windows: `WSL ... execvpe(/bin/bash) failed: No such file or directory`**
This is WSL itself, not the project: `wsl` is installed but there is no Linux
distribution with a shell in it — commonly the case when only Docker Desktop's
own WSL images are present. **You do not need WSL for this project.** Run
everything in PowerShell:

```powershell
npm run setup
npm run dev
npm run smoke
```

If you do want WSL for other reasons, check what is installed and add a real
distribution:

```powershell
wsl --list --verbose      # docker-desktop entries alone cannot run a shell
wsl --install -d Ubuntu   # installs a usable distribution, then reboot
```

**Windows: `redis-cli` is not available**
It ships with the Redis container: `docker exec -it copytrade-redis-dev redis-cli`.

---

## Full containerised stack

To run everything (app, worker, nginx) in containers instead — closer to production:

```bash
cp .env.example .env    # fill in the secrets
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
```

See [deployment.md](deployment.md).
