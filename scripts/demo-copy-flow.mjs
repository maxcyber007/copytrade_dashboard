#!/usr/bin/env node
/**
 * Demo mode: drives one master trade all the way to member accounts.
 *
 *   npm run demo
 *
 * Signs a trade event exactly as a master EA would, posts it to the platform,
 * waits for the copy worker to fan it out, then prints what each member's
 * account received. Requires the app and the worker to be running.
 *
 * Pass an API key and secret to publish into a specific strategy:
 *   node scripts/demo-copy-flow.mjs <keyId> <secret> [baseUrl]
 * With no arguments it uses MASTER_API_KEY / MASTER_API_SECRET from .env, which
 * publish into a platform-owned strategy.
 */
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const [argKey, argSecret, argBase] = process.argv.slice(2);
const BASE = (argBase ?? "http://localhost:3000").replace(/\/$/, "");

function fromEnvFile(name) {
  try {
    const match = readFileSync(new URL("../.env", import.meta.url), "utf8").match(
      new RegExp(`^${name}=(.*)$`, "m"),
    );
    return match?.[1]?.trim();
  } catch {
    return undefined;
  }
}

const API_KEY = argKey ?? process.env.MASTER_API_KEY ?? fromEnvFile("MASTER_API_KEY");
const API_SECRET = argSecret ?? process.env.MASTER_API_SECRET ?? fromEnvFile("MASTER_API_SECRET");
const STRATEGY_CODE = process.env.DEMO_STRATEGY_CODE ?? "STRATEGY-001";

if (!API_KEY || !API_SECRET) {
  console.error("No API key/secret. Pass them as arguments or set them in .env");
  process.exit(1);
}

/** Signs and posts one event exactly the way a master EA has to. */
async function publish(event) {
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", API_SECRET).update(`${timestamp}.${body}`).digest("hex");

  const response = await fetch(`${BASE}/api/master/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": API_KEY,
      "X-Timestamp": timestamp,
      "X-Signature": signature,
    },
    body,
  });

  const json = await response.json().catch(() => ({}));
  return { status: response.status, json };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ticket = String(900_000 + Math.floor(Math.random() * 90_000));
const baseEvent = {
  strategyId: STRATEGY_CODE,
  masterAccount: "MASTER-001",
  ticket,
  symbol: "XAUUSD",
  orderType: "BUY",
  masterBalance: 10_000,
  masterEquity: 10_000,
};

console.log(`\nDemo copy flow against ${BASE}`);
console.log(`  strategy: ${STRATEGY_CODE}   master ticket: ${ticket}\n`);

// 1. The master opens a position -------------------------------------------
const openEventId = `demo-open-${randomUUID()}`;
const opened = await publish({
  ...baseEvent,
  eventId: openEventId,
  eventType: "OPEN",
  volume: 0.1,
  price: 3345.2,
  sl: 3338.2,
  tp: 3360.2,
  timestamp: new Date().toISOString(),
});
console.log(`1. OPEN  0.10 XAUUSD  ->  HTTP ${opened.status}  ${JSON.stringify(opened.json.data ?? opened.json)}`);

// 2. The same event arrives twice (EA retry, network retry, at-least-once) ---
const duplicate = await publish({
  ...baseEvent,
  eventId: openEventId,
  eventType: "OPEN",
  volume: 0.1,
  price: 3345.2,
  timestamp: new Date().toISOString(),
});
console.log(
  `2. Same eventId again  ->  HTTP ${duplicate.status}  status=${duplicate.json.data?.status} (must be DUPLICATE)`,
);

// 3. A forged signature ------------------------------------------------------
const forgedBody = JSON.stringify({ ...baseEvent, eventId: `forged-${randomUUID()}`, eventType: "OPEN", volume: 50, price: 3345.2, timestamp: new Date().toISOString() });
const forged = await fetch(`${BASE}/api/master/events`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Api-Key": API_KEY,
    "X-Timestamp": Math.floor(Date.now() / 1000).toString(),
    "X-Signature": "0".repeat(64),
  },
  body: forgedBody,
});
console.log(`3. Forged signature   ->  HTTP ${forged.status} (must be 401)`);

// 4. A replayed old timestamp ------------------------------------------------
const staleBody = JSON.stringify({ ...baseEvent, eventId: `stale-${randomUUID()}`, eventType: "OPEN", volume: 0.1, price: 3345.2, timestamp: new Date().toISOString() });
const staleTs = (Math.floor(Date.now() / 1000) - 3600).toString();
const stale = await fetch(`${BASE}/api/master/events`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Api-Key": API_KEY,
    "X-Timestamp": staleTs,
    "X-Signature": createHmac("sha256", API_SECRET).update(`${staleTs}.${staleBody}`).digest("hex"),
  },
  body: staleBody,
});
console.log(`4. Hour-old timestamp ->  HTTP ${stale.status} (must be 400 STALE_REQUEST)`);

console.log("\n   waiting for the copy worker...");
await wait(4000);

// 5. The master moves the stop ----------------------------------------------
const modified = await publish({
  ...baseEvent,
  eventId: `demo-modify-${randomUUID()}`,
  eventType: "MODIFY",
  volume: 0.1,
  price: 3345.2,
  sl: 3342.0,
  tp: 3360.2,
  timestamp: new Date().toISOString(),
});
console.log(`5. MODIFY stop loss   ->  HTTP ${modified.status}`);
await wait(3000);

// 6. The master closes half --------------------------------------------------
const partial = await publish({
  ...baseEvent,
  eventId: `demo-partial-${randomUUID()}`,
  eventType: "PARTIAL_CLOSE",
  volume: 0.05,
  price: 3351.4,
  timestamp: new Date().toISOString(),
});
console.log(`6. PARTIAL_CLOSE 0.05 ->  HTTP ${partial.status}`);
await wait(3000);

// 7. And closes the rest -----------------------------------------------------
const closed = await publish({
  ...baseEvent,
  eventId: `demo-close-${randomUUID()}`,
  eventType: "CLOSE",
  volume: 0.05,
  price: 3352.0,
  timestamp: new Date().toISOString(),
});
console.log(`7. CLOSE remainder    ->  HTTP ${closed.status}`);
await wait(3000);

console.log(`
Done. Check the result:
  - member dashboard and /history in the app
  - /admin/copy-trades for every attempt with its status and latency
  - the worker's log for COPY_EVENT_PROCESSED lines
`);
