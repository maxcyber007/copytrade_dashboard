import Redis from "ioredis";
import { getEnv } from "./env";
import { logErrorEvent } from "./logger";

/**
 * Server-to-browser events, carried over Redis pub/sub.
 *
 * The copy worker is a separate process from the web tier, so it cannot push to
 * a browser directly. It publishes here; whichever web instance holds that
 * member's SSE connection relays it.
 */
export type LiveEvent =
  | { type: "COPY_TRADE"; status: string; symbol: string; volume: number; strategy: string; at: string }
  | { type: "ACCOUNT_UPDATED"; accountId: string; at: string }
  | { type: "COPY_STATUS"; subscriptionId: string; status: string; at: string }
  | { type: "RISK_BREACH"; reason: string; at: string }
  | { type: "PING"; at: string };

const channelFor = (userId: string) => `live:user:${userId}`;

const globalForPublisher = globalThis as unknown as { livePublisher?: Redis };

function publisher(): Redis {
  if (globalForPublisher.livePublisher) return globalForPublisher.livePublisher;
  const client = new Redis(getEnv().REDIS_URL, { maxRetriesPerRequest: null });
  globalForPublisher.livePublisher = client;
  return client;
}

/** Publishing is best-effort: a live update must never fail a trade. */
export async function publishUserEvent(userId: string, event: LiveEvent): Promise<void> {
  try {
    await publisher().publish(channelFor(userId), JSON.stringify(event));
  } catch (error) {
    logErrorEvent({
      event: "LIVE_PUBLISH_FAILED",
      userId,
      reason: error instanceof Error ? error.message : "unknown",
    });
  }
}

/**
 * Subscribes one connection to one member's channel. Each SSE connection gets
 * its own Redis client, because a subscribed client cannot issue other commands.
 */
export function subscribeUserEvents(userId: string, onEvent: (event: LiveEvent) => void) {
  const subscriber = new Redis(getEnv().REDIS_URL, { maxRetriesPerRequest: null });

  subscriber.subscribe(channelFor(userId)).catch((error) => {
    logErrorEvent({ event: "LIVE_SUBSCRIBE_FAILED", userId, reason: error.message });
  });

  subscriber.on("message", (_channel, payload) => {
    try {
      onEvent(JSON.parse(payload) as LiveEvent);
    } catch {
      // Ignore anything that is not a well-formed event.
    }
  });

  return async () => {
    try {
      await subscriber.unsubscribe(channelFor(userId));
    } finally {
      subscriber.disconnect();
    }
  };
}
