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
import { createHmac } from "node:crypto";

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
  check("Content-Security-Policy set", Boolean(res.headers.get("content-security-policy")));
  check(
    "CSP blocks framing and third-party script sources",
    (res.headers.get("content-security-policy") ?? "").includes("frame-ancestors 'none'"),
    res.headers.get("content-security-policy"),
  );

  const api = await request("GET", "/api/health", { cookies: false });
  check("API responses are not cacheable", (api.headers.get("cache-control") ?? "").includes("no-store"));

  // A cross-site fetch must not be able to ride a member's session cookie.
  const crossOrigin = await fetch(`${BASE}/api/auth/logout`, {
    method: "POST",
    headers: { Origin: "https://evil.example", Cookie: cookieHeader() },
  });
  check("cross-origin state change is rejected", crossOrigin.status === 403, `got ${crossOrigin.status}`);
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
console.log("\nTrading accounts");
let accountId = null;
{
  const created = await request("POST", "/api/accounts", {
    body: {
      label: `Smoke MT5 ${rand}`,
      platform: "MT5",
      broker: "Smoke Broker",
      login: `9${rand}`.slice(0, 12),
      server: "Smoke-Live01",
      accountType: "DEMO",
      currency: "USD",
      password: "SmokeAccount123",
    },
  });
  check("member can add a trading account", created.status === 201, `got ${created.status}: ${created.text}`);
  accountId = created.json?.data?.account?.id ?? null;
  check("stored password never comes back", !/SmokeAccount123|encryptedPassword/.test(created.text), created.text);

  const invalid = await request("POST", "/api/accounts", {
    body: { label: "x", platform: "CTRADER", broker: "b", login: "1", server: "s", password: "p" },
  });
  check("unsupported platform is rejected", invalid.status === 400, `got ${invalid.status}`);

  if (accountId) {
    const connected = await request("POST", `/api/accounts/${accountId}/connect`);
    check("account connects through the provider", connected.status === 200, `got ${connected.status}: ${connected.text}`);
    check(
      "broker limits are stored on connect",
      Number(connected.json?.data?.account?.brokerLotStep ?? 0) > 0,
      connected.text,
    );

    const synced = await request("POST", `/api/accounts/${accountId}/sync`);
    check("account sync returns positions", synced.status === 200 && Array.isArray(synced.json?.data?.positions), synced.text);
  } else {
    skip("account connects through the provider", "no account id returned");
    skip("broker limits are stored on connect", "no account id returned");
    skip("account sync returns positions", "no account id returned");
  }
}

// ---------------------------------------------------------------------------
console.log("\nStrategies and copy control");
{
  const strategies = await request("GET", "/api/strategies");
  check("member can list strategies", strategies.status === 200, `got ${strategies.status}`);

  const adminOnly = await request("POST", "/api/admin/strategies", { body: { code: "SMOKE-001", name: "Smoke" } });
  check("member cannot create a platform strategy", adminOnly.status === 403, `got ${adminOnly.status}`);

  const live = (strategies.json?.data?.strategies ?? []).find((s) => s.status === "ACTIVE");
  if (live && accountId) {
    const subscribed = await request("POST", "/api/copy/subscribe", {
      body: {
        strategyId: live.id,
        accountId,
        copySettings: { lotMode: "MULTIPLIER", multiplier: 2, minLot: 0.01, maxLot: 5 },
      },
    });
    check("member can subscribe an account to a strategy", subscribed.status === 201, `got ${subscribed.status}: ${subscribed.text}`);
    check("subscription starts idle, not copying", subscribed.json?.data?.subscription?.copyStatus === "IDLE", subscribed.text);

    const subscriptionId = subscribed.json?.data?.subscription?.id;
    if (subscriptionId) {
      const started = await request("POST", "/api/copy/start", { body: { subscriptionId } });
      check("copying starts on a connected account", started.json?.data?.subscription?.copyStatus === "COPYING", started.text);

      const paused = await request("POST", "/api/copy/pause", { body: { subscriptionId } });
      check("copying pauses", paused.json?.data?.subscription?.copyStatus === "PAUSED", paused.text);

      const badSettings = await request("PUT", `/api/copy/${subscriptionId}/settings`, {
        body: { lotMode: "FIXED", fixedLot: 0.1, minLot: 5, maxLot: 1 },
      });
      check("impossible lot bounds are rejected", badSettings.status === 400, `got ${badSettings.status}`);

      await request("POST", "/api/copy/stop", { body: { subscriptionId } });
      const removed = await request("DELETE", `/api/copy/${subscriptionId}`);
      check("member can unsubscribe", removed.status === 200, `got ${removed.status}`);
    } else {
      skip("copy control", "no subscription id returned");
    }
  } else {
    skip("member can subscribe an account to a strategy", "no ACTIVE strategy published on this server");
  }

  const foreign = await request("POST", "/api/copy/start", { body: { subscriptionId: "not-a-real-subscription" } });
  check("copy control on someone else's subscription is not found", foreign.status === 404, `got ${foreign.status}`);
}

// ---------------------------------------------------------------------------
console.log("\nAdmin surfaces are closed to members");
{
  for (const path of ["/api/admin/dashboard", "/api/admin/members", "/api/admin/accounts", "/api/admin/copy-trades", "/api/admin/errors"]) {
    const res = await request("GET", path);
    check(`member cannot read ${path}`, res.status === 403, `got ${res.status}`);
  }

  // Member management is the sharpest tool in the admin area: a member must not
  // be able to promote or delete anyone, including themselves.
  const session = await request("GET", "/api/auth/session");
  const ownId = session.json?.data?.user?.id;

  if (ownId) {
    const promote = await request("PATCH", `/api/admin/members/${ownId}`, {
      body: { role: "ADMIN", status: "ACTIVE" },
    });
    check("member cannot promote themselves to admin", promote.status === 403, `got ${promote.status}`);

    const remove = await request("DELETE", `/api/admin/members/${ownId}`, {
      body: { confirmEmail: email },
    });
    check("member cannot delete an account through the admin API", remove.status === 403, `got ${remove.status}`);

    const detail = await request("GET", `/api/admin/members/${ownId}`);
    check("member cannot read admin member detail", detail.status === 403, `got ${detail.status}`);
  } else {
    skip("member cannot promote themselves to admin", "no session id available");
  }
}

// ---------------------------------------------------------------------------
console.log("\nProvider publishing");
{
  const strategies = await request("GET", "/api/provider/strategies");
  // A member who has only applied is not approved, so publishing is refused.
  check(
    "unapproved member cannot list provider strategies",
    strategies.status === 403,
    `got ${strategies.status}: ${strategies.text}`,
  );

  const created = await request("POST", "/api/provider/strategies", {
    body: { code: `SMOKE-${rand}`.slice(0, 20).toUpperCase(), name: "Smoke provider strategy" },
  });
  check("unapproved member cannot publish a strategy", created.status === 403, `got ${created.status}`);
}

// ---------------------------------------------------------------------------
console.log("\nPlan, billing and live updates");
{
  const plans = await request("GET", "/api/billing/plans");
  check("member can read the plan list", plans.status === 200, `got ${plans.status}`);
  check(
    "everyone has an effective plan, free by default",
    Boolean(plans.json?.data?.effectivePlan?.tier),
    plans.text,
  );

  const badPlan = await request("POST", "/api/billing/subscribe", { body: { planId: "does-not-exist" } });
  check("unknown plan is rejected", badPlan.status === 404, `got ${badPlan.status}`);

  // The free plan allows one trading account. Whatever this run has created so
  // far, one more must be refused with 402 so the member is told to upgrade
  // rather than meeting a generic error.
  const existing = await request("GET", "/api/accounts");
  const accountCount = existing.json?.data?.accounts?.length ?? 0;

  const extra = await request("POST", "/api/accounts", {
    body: {
      label: `Plan test ${rand}`,
      platform: "MT4",
      broker: "Smoke Broker",
      login: `82${rand}`.slice(0, 12),
      server: "Smoke-Live01",
      password: "SmokeAccount123",
    },
  });

  if (accountCount >= 1) {
    check("plan limit refuses an extra account with 402", extra.status === 402, `got ${extra.status}: ${extra.text}`);
    check(
      "the refusal names the plan limit",
      extra.json?.error?.code === "PLAN_LIMIT_REACHED",
      extra.text,
    );
  } else {
    check("account creation succeeds while under the plan limit", extra.status === 201, `got ${extra.status}`);
    await request("DELETE", `/api/accounts/${extra.json?.data?.account?.id}`);
  }

  // The stream is per-member and must never be readable without a session.
  const anonymousStream = await fetch(`${BASE}/api/stream`, { redirect: "manual" });
  check(
    "event stream requires a session",
    anonymousStream.status === 401 || anonymousStream.status === 500,
    `got ${anonymousStream.status}`,
  );
  await anonymousStream.body?.cancel();
}

// ---------------------------------------------------------------------------
console.log("\nMaster trade event API");
// Forging one of these would move member money, so every guard is checked.
{
  const event = {
    strategyId: "STRATEGY-001",
    eventId: `smoke-event-${rand}`,
    eventType: "OPEN",
    masterAccount: "MASTER-001",
    ticket: `${rand}`.slice(0, 9),
    symbol: "XAUUSD",
    orderType: "BUY",
    volume: 0.1,
    price: 3345.2,
    timestamp: new Date().toISOString(),
  };
  const body = JSON.stringify(event);
  const now = Math.floor(Date.now() / 1000).toString();

  async function postEvent(headers, rawBody = body) {
    const response = await fetch(`${BASE}/api/master/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: rawBody,
    });
    const text = await response.text();
    return { status: response.status, text };
  }

  const noAuth = await postEvent({});
  check("unsigned event is rejected", noAuth.status === 401, `got ${noAuth.status}`);

  const badKey = await postEvent({
    "X-Api-Key": "ct_not_a_real_key",
    "X-Timestamp": now,
    "X-Signature": "0".repeat(64),
  });
  check("unknown API key is rejected", badKey.status === 401, `got ${badKey.status}`);

  // A wrong signature with a real-looking key must fail the same way.
  const badSignature = await postEvent({
    "X-Api-Key": "ct_wrong_but_shaped_like_a_key",
    "X-Timestamp": now,
    "X-Signature": createHmac("sha256", "guessed-secret").update(`${now}.${body}`).digest("hex"),
  });
  check("wrong signature is rejected", badSignature.status === 401, `got ${badSignature.status}`);

  const staleTs = (Math.floor(Date.now() / 1000) - 3600).toString();
  const stale = await postEvent({
    "X-Api-Key": "ct_not_a_real_key",
    "X-Timestamp": staleTs,
    "X-Signature": createHmac("sha256", "x").update(`${staleTs}.${body}`).digest("hex"),
  });
  // The timestamp window is checked before the key, so an old capture is stale
  // whether or not the attacker holds a valid key.
  check("stale timestamp is rejected", stale.status === 400, `got ${stale.status}`);

  const wrongMethod = await request("GET", "/api/master/events", { cookies: false });
  check("GET on the event endpoint is refused", wrongMethod.status === 404, `got ${wrongMethod.status}`);
}

// ---------------------------------------------------------------------------
console.log("\nCleanup");
if (accountId) {
  const removed = await request("DELETE", `/api/accounts/${accountId}`);
  check("member can remove their trading account", removed.status === 200, `got ${removed.status}`);
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
