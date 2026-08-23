#!/usr/bin/env bash
# One-command development setup.
#
#   ./scripts/dev-setup.sh
#
# Creates .env with freshly generated secrets (never overwriting an existing
# one), starts PostgreSQL and Redis via Docker when available, applies the
# migrations and seeds the subscription plans. Safe to run more than once.

set -euo pipefail

cd "$(dirname "$0")/.."

bold()  { printf '\033[1m%s\033[0m\n' "$1"; }
info()  { printf '  %s\n' "$1"; }
good()  { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn()  { printf '  \033[33m!\033[0m %s\n' "$1"; }
die()   { printf '  \033[31m✗\033[0m %s\n' "$1" >&2; exit 1; }

# --------------------------------------------------------------------------
bold "1. Checking prerequisites"

command -v node >/dev/null || die "Node.js is not installed. Install Node 22 or newer."
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 20 ] || die "Node $NODE_MAJOR found; this project needs Node 20 or newer (22 recommended)."
good "Node $(node -v)"

command -v npm >/dev/null || die "npm is not installed."
good "npm $(npm -v)"

if command -v openssl >/dev/null; then
  SECRET_SOURCE="openssl"
else
  SECRET_SOURCE="node"
  warn "openssl not found — generating secrets with Node instead"
fi

# --------------------------------------------------------------------------
bold "2. Installing dependencies"

if [ -d node_modules ]; then
  good "node_modules already present (run 'npm install' yourself to refresh)"
else
  npm install
  good "dependencies installed"
fi

# --------------------------------------------------------------------------
bold "3. Creating .env"

rand() { # rand <base64|hex> <bytes>
  if [ "$SECRET_SOURCE" = "openssl" ]; then
    case "$1" in
      base64) openssl rand -base64 "$2" | tr -d '\n' ;;
      hex)    openssl rand -hex "$2" ;;
    esac
  else
    node -e "process.stdout.write(require('crypto').randomBytes($2).toString('$1'))"
  fi
}

if [ -f .env ]; then
  good ".env already exists — leaving it untouched"
else
  cat > .env <<EOF
NODE_ENV=development
APP_URL=http://localhost:3000
PORT=3000

DATABASE_URL=postgresql://copytrade:copytrade@localhost:5432/copytrade?schema=public
REDIS_URL=redis://localhost:6379

AUTH_SECRET=$(rand base64 48)
SESSION_TTL_SECONDS=604800

ENCRYPTION_KEY=$(rand base64 32)

TRADING_PROVIDER=mock
METAAPI_TOKEN=
METAAPI_REGION=new-york

MASTER_API_KEY=$(rand hex 16)
MASTER_API_SECRET=$(rand hex 32)
MASTER_EVENT_MAX_SKEW_SECONDS=60

PAYMENT_PROVIDER=mock
LOG_LEVEL=info
RATE_LIMIT_ENABLED=true
EOF
  good ".env created with freshly generated secrets"
  info "These are development secrets. Generate new ones for production."
fi

# --------------------------------------------------------------------------
bold "4. Starting PostgreSQL and Redis"

if docker info >/dev/null 2>&1; then
  docker compose -f docker-compose.dev.yml up -d
  good "containers started"

  printf '  waiting for PostgreSQL'
  for _ in $(seq 1 60); do
    if docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U copytrade >/dev/null 2>&1; then
      printf '\n'; good "PostgreSQL is accepting connections"; break
    fi
    printf '.'; sleep 1
  done
else
  warn "Docker is not running — skipping container startup"
  info "Make sure PostgreSQL and Redis are reachable at the URLs in .env,"
  info "or start Docker Desktop and re-run this script."
fi

# --------------------------------------------------------------------------
bold "5. Applying database migrations"

# Fail with an actionable message rather than a raw Prisma connection error.
DB_HOST=$(node -e "const u=new URL(process.env.DATABASE_URL ?? require('fs').readFileSync('.env','utf8').match(/^DATABASE_URL=(.*)$/m)[1]); process.stdout.write(u.hostname + ':' + (u.port || 5432))")
if ! node -e "
const [host, port] = process.argv[1].split(':');
const socket = require('net').createConnection({ host, port: Number(port) });
socket.setTimeout(3000);
socket.on('connect', () => { socket.end(); process.exit(0); });
socket.on('error', () => process.exit(1));
socket.on('timeout', () => process.exit(1));
" "$DB_HOST"; then
  printf '\n'
  die "Cannot reach PostgreSQL at $DB_HOST.
     Start it with one of:
       docker compose -f docker-compose.dev.yml up -d      (needs Docker running)
       brew services start postgresql@16                    (macOS)
       sudo service postgresql start                        (Linux)
     Then re-run this script."
fi
good "PostgreSQL reachable at $DB_HOST"

npx prisma generate >/dev/null
good "Prisma client generated"

npx prisma migrate deploy
good "migrations applied"

# --------------------------------------------------------------------------
bold "6. Seeding subscription plans"

npm run db:seed --silent
good "plans seeded"

# --------------------------------------------------------------------------
printf '\n'
bold "Setup complete"
cat <<'EOF'

  Start the app:            npm run dev          → http://localhost:3000
  Start the copy worker:    npm run worker:dev   (separate terminal)
  Verify everything works:  ./scripts/smoke-test.sh

  The first account you register becomes ADMIN; every later one is a MEMBER.

  Useful:
    npm run db:studio                              browse the database
    docker compose -f docker-compose.dev.yml logs  container logs
    docker compose -f docker-compose.dev.yml down  stop the containers

EOF
