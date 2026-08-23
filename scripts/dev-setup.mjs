#!/usr/bin/env node
/**
 * One-command development setup. Runs on Windows (PowerShell or cmd), macOS and
 * Linux with no shell dependencies beyond Node itself.
 *
 *   npm run setup
 *
 * Creates .env with freshly generated secrets (never overwriting an existing
 * one), starts PostgreSQL and Redis via Docker when available, applies the
 * migrations and seeds the subscription plans. Safe to run more than once.
 */
import { spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

// Colour is skipped when the output is redirected or the terminal opts out.
const useColour = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const paint = (code, text) => (useColour ? `\u001b[${code}m${text}\u001b[0m` : text);

const step = (text) => console.log(`\n${paint("1", text)}`);
const good = (text) => console.log(`  ${paint("32", "✓")} ${text}`);
const info = (text) => console.log(`    ${text}`);
const warn = (text) => console.log(`  ${paint("33", "!")} ${text}`);

function die(message) {
  console.error(`  ${paint("31", "✗")} ${message}`);
  process.exit(1);
}

/** Runs a command inheriting stdio. shell:true so npm/npx resolve on Windows. */
function run(command, { quiet = false } = {}) {
  const result = spawnSync(command, { stdio: quiet ? "pipe" : "inherit", shell: true, encoding: "utf8" });
  if (result.status !== 0) {
    if (quiet && result.stderr) console.error(result.stderr);
    die(`Command failed: ${command}`);
  }
  return result;
}

const canRun = (command) => spawnSync(command, { shell: true, stdio: "ignore" }).status === 0;

function reachable(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

// ---------------------------------------------------------------------------
step("1. Checking prerequisites");

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 20) {
  die(`Node ${process.versions.node} found; this project needs Node 20 or newer (22 recommended).`);
}
good(`Node v${process.versions.node}`);

if (!canRun("npm --version")) die("npm is not available on PATH.");
good(`npm ${spawnSync("npm --version", { shell: true, encoding: "utf8" }).stdout.trim()}`);

// ---------------------------------------------------------------------------
step("2. Installing dependencies");

if (existsSync(join(ROOT, "node_modules"))) {
  good("node_modules already present (run 'npm install' yourself to refresh)");
} else {
  run("npm install");
  good("dependencies installed");
}

// ---------------------------------------------------------------------------
step("3. Creating .env");

const ENV_PATH = join(ROOT, ".env");

if (existsSync(ENV_PATH)) {
  good(".env already exists — leaving it untouched");
} else {
  const b64 = (bytes) => randomBytes(bytes).toString("base64");
  const hex = (bytes) => randomBytes(bytes).toString("hex");

  writeFileSync(
    ENV_PATH,
    `NODE_ENV=development
APP_URL=http://localhost:3000
PORT=3000

DATABASE_URL=postgresql://copytrade:copytrade@localhost:5432/copytrade?schema=public
REDIS_URL=redis://localhost:6379

AUTH_SECRET=${b64(48)}
SESSION_TTL_SECONDS=604800

ENCRYPTION_KEY=${b64(32)}

TRADING_PROVIDER=mock
METAAPI_TOKEN=
METAAPI_REGION=new-york

MASTER_API_KEY=${hex(16)}
MASTER_API_SECRET=${hex(32)}
MASTER_EVENT_MAX_SKEW_SECONDS=60

PAYMENT_PROVIDER=mock
LOG_LEVEL=info
RATE_LIMIT_ENABLED=true
`,
  );
  good(".env created with freshly generated secrets");
  info("These are development secrets. Generate new ones for production.");
}

// ---------------------------------------------------------------------------
step("4. Starting PostgreSQL and Redis");

const dockerRunning = canRun("docker info");

if (dockerRunning) {
  run("docker compose -f docker-compose.dev.yml up -d");
  good("containers started");
} else {
  warn("Docker is not running — skipping container startup");
  info("Make sure PostgreSQL and Redis are reachable at the URLs in .env,");
  info("or start Docker Desktop and re-run this script.");
}

// ---------------------------------------------------------------------------
step("5. Applying database migrations");

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const match = readFileSync(ENV_PATH, "utf8").match(/^DATABASE_URL=(.*)$/m);
  if (!match) die("DATABASE_URL is missing from .env");
  return match[1].trim();
}

const dbUrl = new URL(readDatabaseUrl());
const dbPort = Number(dbUrl.port || 5432);

// A container that has just started needs a moment before it accepts connections.
process.stdout.write("  waiting for PostgreSQL");
let dbUp = false;
for (let attempt = 0; attempt < (dockerRunning ? 60 : 3); attempt += 1) {
  dbUp = await reachable(dbUrl.hostname, dbPort);
  if (dbUp) break;
  process.stdout.write(".");
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
process.stdout.write("\n");

if (!dbUp) {
  die(`Cannot reach PostgreSQL at ${dbUrl.hostname}:${dbPort}.
     Start it with one of:
       npm run dev:infra                      (needs Docker running)
       brew services start postgresql@16      (macOS)
       sudo service postgresql start          (Linux)
     Then re-run this script.`);
}
good(`PostgreSQL reachable at ${dbUrl.hostname}:${dbPort}`);

run("npx prisma generate", { quiet: true });
good("Prisma client generated");

run("npx prisma migrate deploy");
good("migrations applied");

// ---------------------------------------------------------------------------
step("6. Seeding subscription plans");

run("npm run db:seed --silent");
good("plans seeded");

// ---------------------------------------------------------------------------
console.log(`
${paint("1", "Setup complete")}

  Start the app:            npm run dev          -> http://localhost:3000
  Start the copy worker:    npm run worker:dev   (separate terminal)
  Verify everything works:  npm run smoke

  The first account you register becomes ADMIN; every later one is a MEMBER.

  Useful:
    npm run db:studio        browse the database
    npm run dev:infra        start the dev containers
    npm run dev:infra:down   stop them
`);
