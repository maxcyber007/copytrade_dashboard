#!/usr/bin/env node
/**
 * Fails if a secret looks committed, or if a file that should never be tracked
 * is. Runs in CI and can be run locally:
 *
 *   npm run check:secrets
 *
 * It scans tracked files only — what is in the repository is what can leak.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const useColour = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const paint = (code, text) => (useColour ? `\u001b[${code}m${text}\u001b[0m` : text);

/** Files that must never be tracked, whatever they contain. */
const FORBIDDEN_PATHS = [/^\.env$/, /^\.env\.(local|development|production)$/, /\.pem$/, /\.p12$/, /id_rsa/];

/**
 * Patterns for a real secret value. `.env.example` keys with empty values and
 * placeholder text are expected, so the patterns require value-shaped content.
 */
const PATTERNS = [
  { name: "AWS access key id", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "private key block", regex: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { name: "Stripe secret key", regex: /\bsk_(live|test)_[0-9a-zA-Z]{16,}/ },
  { name: "Slack token", regex: /\bxox[baprs]-[0-9a-zA-Z-]{10,}/ },
  { name: "GitHub token", regex: /\bgh[pousr]_[0-9A-Za-z]{20,}/ },
  { name: "JWT", regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  {
    name: "assigned secret env value",
    // AUTH_SECRET=<value> or AUTH_SECRET: <value> — an assignment carrying an
    // actual value, in a .env file, a compose file or a workflow alike.
    regex: /\b(AUTH_SECRET|ENCRYPTION_KEY|MASTER_API_SECRET|MASTER_API_KEY|METAAPI_TOKEN|DATABASE_URL|POSTGRES_PASSWORD)\s*[:=]\s*["']?([^\s"'\n]{12,})/,
  },
];

/**
 * Values that are not secrets even though they sit in a secret-shaped
 * assignment: code reading the variable, a CI or compose placeholder, and
 * template interpolation.
 */
const NON_SECRET_VALUE = [
  /\$\{/, // ${...} and ${{ ... }} interpolation
  /process\.env/,
  /[(`]/, // an expression rather than a literal, e.g. dotenv.match(...)
  /^["']?(ci|test|dummy|example|changeme|placeholder|your)[-_]/i,
  // A connection string pointing at a local or compose-internal host is a
  // development default, not a credential that unlocks anything remote.
  /@(localhost|127\.0\.0\.1|postgres|redis|db):/,
];

function isRealSecret(line, regex) {
  const match = line.match(regex);
  const value = match?.[2] ?? match?.[0] ?? "";
  return !NON_SECRET_VALUE.some((pattern) => pattern.test(value));
}

/** Files where a match is a documented example rather than a secret. */
const ALLOWLIST = [
  /^\.env\.example$/,
  /^docs\//,
  /^README\.md$/,
  /^scripts\/check-secrets\.mjs$/,
  /^scripts\/dev-setup\.mjs$/,
  /^prisma\/migrations\//,
];

const tracked = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean);
const findings = [];

for (const file of tracked) {
  if (FORBIDDEN_PATHS.some((pattern) => pattern.test(file))) {
    findings.push({ file, line: 0, name: "file must never be committed", excerpt: file });
    continue;
  }

  if (ALLOWLIST.some((pattern) => pattern.test(file))) continue;

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue; // binary or unreadable
  }

  content.split("\n").forEach((line, index) => {
    for (const { name, regex } of PATTERNS) {
      if (regex.test(line) && isRealSecret(line, regex)) {
        findings.push({ file, line: index + 1, name, excerpt: line.trim().slice(0, 80) });
      }
    }
  });
}

if (findings.length === 0) {
  console.log(`${paint("32", "✓")} No secrets found in ${tracked.length} tracked files`);
  process.exit(0);
}

console.error(`${paint("31", "✗")} Possible secrets in tracked files:\n`);
for (const finding of findings) {
  console.error(`  ${finding.file}:${finding.line}  ${paint("33", finding.name)}`);
  console.error(`    ${finding.excerpt}`);
}
console.error(`
If a match is a documented example rather than a secret, add its path to the
allowlist in scripts/check-secrets.mjs. If it is real: rotate it, then remove it
from the history — deleting it in a new commit is not enough.
`);
process.exit(1);
