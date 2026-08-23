#!/usr/bin/env node
/**
 * End-to-end smoke test. Runs on Windows, macOS and Linux with Node alone.
 *
 *   npm run smoke                        against http://localhost:3000
 *   node scripts/smoke-test.mjs <url>    against any deployment
 *
 * Exercises health, registration, validation, sessions, login, access control,
 * security headers, rate limiting, the provider application flow and logout
 * against a live server. Accounts use random emails, so it is safe to re-run
 * against a development database.
 */
const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");

const useColour = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const paint = (code, text) => (useColour ? `\u001b[${code}m${text}\u001b[0m` : text);

let passed = 0;
let failed = 0;
let skipped = 0;

function check(description, condition, detail) {
  if (condition) {
    console.log(`  ${paint("32", "PASS")} ${description}`);
    passed += 1;
  } else {
    console.log(`  ${paint("31", "FAIL")} ${description}`);
    if (detail) console.log(`        ${String(detail).slice(0, 300)}`);
    failed += 1;
  }
}

function skip(description, reason) {
  console.log(`  ${paint("33", "SKIP")} ${description}`);
  console.log(`        ${reason}`);
  skipped += 1;
}

/** Minimal cookie jar — enough for one session cookie across requests. */
const jar = new Map();
let lastSetCookie = [];

function applyCookies(setCookies) {
  lastSetCookie = setCookies;
  for (const raw of setCookies) {
    const [pair] = raw.split(";");
    const index = pair.indexOf("=");
    if (index === -1) continue;
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (value === "" || /expires=Thu, 01 Jan 1970/i.test(raw)) jar.delete(name);
    else jar.set(name, value);
  }
}

const cookieHeader = () =>
  [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");

async function request(method, path, { body, cookies = true, redirect = "manual" } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookies && jar.size > 0) headers.Cookie = cookieHeader();

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect,
  });

  if (cookies) applyCookies(response.headers.getSetCookie());

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }

  return { status: response.status, text, json, headers: response.headers };
}

const rand = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
const email = `smoke-${rand}@example.com`;
const password = "SmokeTest123";

console.log(`\nSmoke test against ${BASE}\n`);

// ---------------------------------------------------------------------------
console.log("Health");
{
  const res = await request("GET", "/api/health", { cookies: false });
  check("GET /api/health returns 200", res.status === 200, `got ${res.status}`);
  check("database reports up", res.json?.checks?.database?.status === "up", res.text);
  check("redis reports up", res.json?.checks?.redis?.status === "up", res.text);
  check("trading provider reported", Boolean(res.json?.checks?.tradingProvider), res.text);
}

// ---------------------------------------------------------------------------
console.log("\nRegistration");
// Registration is rate limited to 5 per hour per IP and the limiter runs before
// validation, so every call here spends budget. Calls that run out are skipped
// rather than failed — the test never weakens the control it is checking.
//   Reset:  redis-cli --scan --pattern "ratelimit:register:*" | xargs -r redis-cli del
async function registerCheck(description, expectedStatus, body) {
  const res = await request("POST", "/api/auth/register", { body });
  if (res.status === 429) {
    skip(description, "register rate limit reached for this IP");
    return null;
  }
  check(description, res.status === expectedStatus, `got ${res.status}: ${res.text}`);
  return res;
}

{
  const weak = await registerCheck("weak password returns 400", 400, {
    email: `weak-${rand}@example.com`,
    password: "short",
  });
  if (weak) {
    check("weak password lists field errors", weak.json?.error?.code === "VALIDATION_ERROR", weak.text);
  }

  await registerCheck("malformed email returns 400", 400, { email: "not-an-email", password });

  const created = await registerCheck("valid registration returns 201", 201, {
    email,
    password,
    name: "Smoke",
  });

  if (!created) {
    console.log(`
  The remaining checks need an account created by this run.
  Wait for the rate limit window to expire, or clear it:
    redis-cli --scan --pattern "ratelimit:register:*" | xargs -r redis-cli del
`);
    process.exit(1);
  }

  check("response carries a role", Boolean(created.json?.data?.user?.role), created.text);
  check("response never returns a password field", !/password/i.test(created.text), created.text);
  check(
    "session cookie is HttpOnly",
    lastSetCookie.some((c) => c.startsWith("ct_session=") && /HttpOnly/i.test(c)),
    lastSetCookie.join(" | "),
  );

  await registerCheck("duplicate email returns 409", 409, { email, password });
}

// ---------------------------------------------------------------------------
console.log("\nSession");
{
  const withCookie = await request("GET", "/api/auth/session");
  check("session with cookie returns the user", withCookie.json?.data?.user?.email === email, withCookie.text);

  const withoutCookie = await request("GET", "/api/auth/session", { cookies: false });
  check("session without cookie returns null user", withoutCookie.json?.data?.user === null, withoutCookie.text);
}

// ---------------------------------------------------------------------------
console.log("\nLogin");
{
  const wrong = await request("POST", "/api/auth/login", { body: { email, password: "WrongPass123" } });
  check("wrong password returns 401", wrong.status === 401, `got ${wrong.status}`);
  check("wrong password gives a generic message", wrong.json?.error?.code === "INVALID_CREDENTIALS", wrong.text);

  const unknown = await request("POST", "/api/auth/login", {
    body: { email: `nobody-${rand}@example.com`, password },
  });
  check("unknown email returns the same 401", unknown.status === 401, `got ${unknown.status}`);

  const normalised = await request("POST", "/api/auth/login", {
    body: { email: `  ${email.toUpperCase()}  `, password },
  });
  check("login normalises case and whitespace", normalised.status === 200, `got ${normalised.status}: ${normalised.text}`);
}

// ---------------------------------------------------------------------------
console.log("\nAccess control");
{
  const anonymous = await request("GET", "/dashboard", { cookies: false });
  check("/dashboard unauthenticated redirects (307)", anonymous.status === 307, `got ${anonymous.status}`);
  check(
    "redirect target is /login",
    (anonymous.headers.get("location") ?? "").includes("/login"),
    anonymous.headers.get("location"),
  );

  const authenticated = await request("GET", "/dashboard");
  check("/dashboard authenticated returns 200", authenticated.status === 200, `got ${authenticated.status}`);

  // The first user in an empty database is ADMIN, so only assert the member
  // boundary when this account really is a MEMBER.
  const session = await request("GET", "/api/auth/session");
  if (session.json?.data?.user?.role === "MEMBER") {
    const admin = await request("GET", "/admin/dashboard");
    check(
      "member is redirected away from /admin",
      (admin.headers.get("location") ?? "").includes("/dashboard"),
      admin.headers.get("location"),
    );
  } else {
    skip("member is redirected away from /admin", "this account is ADMIN (first user in an empty database)");
  }
}

// ---------------------------------------------------------------------------
console.log("\nSecurity headers");
{
  const res = await request("GET", "/login", { cookies: false });
  check("X-Frame-Options: DENY", res.headers.get("x-frame-options") === "DENY");
  check("X-Content-Type-Options: nosniff", res.headers.get("x-content-type-options") === "nosniff");
  check("Referrer-Policy set", Boolean(res.headers.get("referrer-policy")));
  check("X-Powered-By hidden", res.headers.get("x-powered-by") === null);
}

// ---------------------------------------------------------------------------
console.log("\nRate limiting (burst against an unknown email so no real account is locked)");
{
  const codes = [];
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const res = await request("POST", "/api/auth/login", {
      body: { email: `burst-${rand}@example.com`, password: "WrongPass123" },
      cookies: false,
    });
    codes.push(res.status);
  }
  check("repeated failed logins end in 429", codes.includes(429), `codes: ${codes.join(" ")}`);
}

// ---------------------------------------------------------------------------
console.log("\nSignal provider application");
{
  const application = {
    displayName: `Smoke Provider ${rand}`,
    headline: "Automated smoke test strategy",
    bio: "A description long enough to satisfy the minimum length requirement for a provider application submitted by the smoke test.",
    performanceFeePct: 15,
    subscriptionPriceMonthly: 29,
  };

  const applied = await request("POST", "/api/provider/apply", { body: application });
  check("member can apply as a provider", applied.status === 201, `got ${applied.status}: ${applied.text}`);
  check("application starts as PENDING", applied.json?.data?.provider?.status === "PENDING", applied.text);
  const providerId = applied.json?.data?.provider?.id;

  const invalid = await request("POST", "/api/provider/apply", {
    body: { displayName: "X", headline: "short", bio: "short" },
  });
  check("incomplete application returns 400", invalid.status === 400, `got ${invalid.status}`);

  if (providerId) {
    const selfApprove = await request("POST", `/api/admin/providers/${providerId}/review`, {
      body: { decision: "APPROVE" },
    });
    check("member cannot approve their own application", selfApprove.status === 403, `got ${selfApprove.status}`);
  } else {
    skip("member cannot approve their own application", "no application id returned");
  }

  const adminList = await request("GET", "/api/admin/providers");
  check("member cannot list applications", adminList.status === 403, `got ${adminList.status}`);

  const own = await request("GET", "/api/provider/apply");
  check("applicant never sees the internal review note", !/reviewNote/.test(own.text), own.text);

  const marketplace = await request("GET", "/api/providers", { cookies: false });
  check("public marketplace listing is reachable", marketplace.status === 200, `got ${marketplace.status}`);
  check(
    "pending provider is not listed publicly",
    !marketplace.text.includes(application.displayName),
    marketplace.text,
  );
}

// ---------------------------------------------------------------------------
console.log("\nLogout");
{
  const loggedOut = await request("POST", "/api/auth/logout");
  check("logout returns 200", loggedOut.status === 200, `got ${loggedOut.status}`);

  const session = await request("GET", "/api/auth/session");
  check("session is revoked server-side", session.json?.data?.user === null, session.text);
}

// ---------------------------------------------------------------------------
console.log("\n-----------------------------------------");
console.log(
  `Passed: ${paint("32", passed)}   Failed: ${failed > 0 ? paint("31", failed) : failed}   Skipped: ${skipped}`,
);
console.log("-----------------------------------------\n");

process.exit(failed === 0 ? 0 : 1);
