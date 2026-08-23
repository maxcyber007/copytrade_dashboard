import type { Strategy } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { decryptSecret, hmacSha256Hex, safeEqual } from "@/lib/crypto";
import { AppError, ErrorCode } from "@/lib/errors";
import { claimNonce } from "@/lib/rate-limit";
import { logEvent, logErrorEvent } from "@/lib/logger";
import type { MasterEventInput } from "@/lib/validation/master-event";
import { masterEventSchema } from "@/lib/validation/master-event";
import { enqueueCopyJob } from "@/workers/queues";

export type SignedRequest = {
  apiKey: string;
  signature: string;
  timestamp: string;
  rawBody: string;
  ipAddress?: string;
};

/**
 * Verifies that a request really came from the master EA that owns the
 * strategy. All four of these must hold, because a forged event moves member
 * money:
 *
 *   1. the API key resolves to a live, unrevoked key
 *   2. the HMAC over `timestamp.rawBody` matches, checked in constant time
 *   3. the timestamp is inside the accepted window (an old capture is stale)
 *   4. the event id has not been seen (replay guard, backed by a unique index)
 *
 * The key decides which strategy the event lands on, so a provider can never
 * publish into someone else's strategy no matter what the payload claims.
 */
export async function authenticateMasterRequest(request: SignedRequest): Promise<{
  strategy: Strategy;
  keyRecordId: string | null;
}> {
  const env = getEnv();

  const skewSeconds = Math.abs(Date.now() / 1000 - Number(request.timestamp));
  if (!Number.isFinite(skewSeconds) || skewSeconds > env.MASTER_EVENT_MAX_SKEW_SECONDS) {
    throw new AppError(ErrorCode.STALE_REQUEST, `Timestamp is outside the ${env.MASTER_EVENT_MAX_SKEW_SECONDS}s window`);
  }

  const message = `${request.timestamp}.${request.rawBody}`;

  // Per-strategy credentials first; the platform-wide key is the fallback for
  // strategies the operator runs itself.
  const keyRecord = await prisma.strategyApiKey.findUnique({
    where: { keyId: request.apiKey },
    include: { strategy: true },
  });

  if (keyRecord) {
    if (keyRecord.revokedAt) throw new AppError(ErrorCode.UNAUTHORIZED, "This API key has been revoked");

    const expected = hmacSha256Hex(decryptSecret(keyRecord.encryptedSecret), message);
    if (!safeEqual(expected, request.signature)) {
      throw new AppError(ErrorCode.INVALID_SIGNATURE, "Signature does not match the request body");
    }

    await prisma.strategyApiKey.update({
      where: { id: keyRecord.id },
      data: { lastUsedAt: new Date(), lastUsedIp: request.ipAddress },
    });

    return { strategy: keyRecord.strategy, keyRecordId: keyRecord.id };
  }

  if (!safeEqual(env.MASTER_API_KEY, request.apiKey)) {
    throw new AppError(ErrorCode.UNAUTHORIZED, "Unknown API key");
  }

  const expected = hmacSha256Hex(env.MASTER_API_SECRET, message);
  if (!safeEqual(expected, request.signature)) {
    throw new AppError(ErrorCode.INVALID_SIGNATURE, "Signature does not match the request body");
  }

  // The platform key is not bound to a strategy, so the payload names it.
  const parsed = masterEventSchema.pick({ strategyId: true }).parse(JSON.parse(request.rawBody));
  const strategy = await prisma.strategy.findUnique({ where: { code: parsed.strategyId } });
  if (!strategy) throw new AppError(ErrorCode.NOT_FOUND, `Unknown strategy ${parsed.strategyId}`);
  if (strategy.ownerType !== "PLATFORM") {
    throw new AppError(ErrorCode.FORBIDDEN, "The platform key cannot publish into a provider strategy");
  }

  return { strategy, keyRecordId: null };
}

export type IngestResult = {
  eventId: string;
  status: "QUEUED" | "DUPLICATE" | "IGNORED";
  reason?: string;
};

/**
 * Records a verified event and hands it to the queue.
 *
 * The response never waits for member execution: the API's job is to accept the
 * event exactly once and durably. Duplicate protection is the unique index on
 * `TradeEvent.eventId`, with a Redis nonce in front of it as a fast path.
 */
export async function ingestMasterEvent(
  strategy: Strategy,
  input: MasterEventInput,
  meta: { ipAddress?: string } = {},
): Promise<IngestResult> {
  const fresh = await claimNonce("master-event", input.eventId, 24 * 60 * 60);
  if (!fresh) {
    logEvent({ event: "MASTER_EVENT_DUPLICATE", eventId: input.eventId, source: "nonce" });
    return { eventId: input.eventId, status: "DUPLICATE", reason: "Event already received" };
  }

  if (strategy.status !== "ACTIVE") {
    // Recorded, never fanned out: a paused strategy must not reach members, but
    // the event is still part of the master's history.
    await storeEvent(strategy, input, "PROCESSED", "Strategy is not active");
    logEvent({ event: "MASTER_EVENT_IGNORED", eventId: input.eventId, strategyStatus: strategy.status });
    return { eventId: input.eventId, status: "IGNORED", reason: `Strategy is ${strategy.status}` };
  }

  try {
    const stored = await storeEvent(strategy, input, "QUEUED");
    await enqueueCopyJob({ eventId: stored.eventId, strategyId: strategy.id });

    logEvent({
      event: "MASTER_EVENT_ACCEPTED",
      eventId: stored.eventId,
      strategyId: strategy.id,
      eventType: input.eventType,
      symbol: input.symbol,
      ...meta,
    });

    return { eventId: stored.eventId, status: "QUEUED" };
  } catch (error) {
    // The unique index is the authority: a concurrent delivery that lost the
    // race is a duplicate, not a failure.
    if (isUniqueViolation(error)) {
      logEvent({ event: "MASTER_EVENT_DUPLICATE", eventId: input.eventId, source: "database" });
      return { eventId: input.eventId, status: "DUPLICATE", reason: "Event already received" };
    }

    logErrorEvent({
      event: "MASTER_EVENT_STORE_FAILED",
      eventId: input.eventId,
      reason: error instanceof Error ? error.message : "unknown",
    });
    throw error;
  }
}

async function storeEvent(
  strategy: Strategy,
  input: MasterEventInput,
  status: "QUEUED" | "PROCESSED",
  errorMessage?: string,
) {
  const platform = input.platform ?? strategy.masterPlatform;

  const existingTrade = await prisma.masterTrade.findUnique({
    where: { strategyId_ticket: { strategyId: strategy.id, ticket: input.ticket } },
  });

  // On a partial close the event carries the volume that was closed, so the
  // fraction has to be taken against the volume still open before it. The
  // worker runs later, by which time the master trade holds the remainder.
  let closeFraction: number | null = null;
  let remainingVolume: number | null = null;

  if (input.eventType === "PARTIAL_CLOSE" && existingTrade) {
    const openVolume = Number(existingTrade.volume);
    if (openVolume > 0) {
      closeFraction = Math.min(input.volume / openVolume, 1);
      remainingVolume = Number(Math.max(openVolume - input.volume, 0).toFixed(2));
    }
  }

  // The master position this event belongs to, so MODIFY and CLOSE can be
  // resolved back to what was opened.
  const masterTrade = await prisma.masterTrade.upsert({
    where: { strategyId_ticket: { strategyId: strategy.id, ticket: input.ticket } },
    update: {
      // A partial close reduces the position; other events report its size.
      volume: input.eventType === "PARTIAL_CLOSE" ? (remainingVolume ?? input.volume) : input.volume,
      sl: input.sl ?? null,
      tp: input.tp ?? null,
      ...(input.eventType === "CLOSE"
        ? { status: "CLOSED", closePrice: input.price, closedAt: new Date(input.timestamp) }
        : {}),
      ...(input.eventType === "PARTIAL_CLOSE" ? { status: "PARTIALLY_CLOSED" } : {}),
    },
    create: {
      strategyId: strategy.id,
      masterAccountCode: input.masterAccount,
      ticket: input.ticket,
      symbol: input.symbol,
      orderType: input.orderType,
      volume: input.volume,
      openPrice: input.price,
      sl: input.sl ?? null,
      tp: input.tp ?? null,
      status: input.eventType === "PENDING_ORDER" ? "PENDING" : "OPEN",
      openedAt: new Date(input.timestamp),
    },
  });

  return prisma.tradeEvent.create({
    data: {
      eventId: input.eventId,
      strategyId: strategy.id,
      masterTradeId: masterTrade.id,
      eventType: input.eventType,
      platform,
      masterAccountCode: input.masterAccount,
      ticket: input.ticket,
      symbol: input.symbol,
      orderType: input.orderType,
      volume: input.volume,
      price: input.price,
      sl: input.sl ?? null,
      tp: input.tp ?? null,
      masterBalance: input.masterBalance ?? null,
      masterEquity: input.masterEquity ?? null,
      closeFraction,
      status,
      errorMessage: errorMessage ?? null,
      occurredAt: new Date(input.timestamp),
      processedAt: status === "PROCESSED" ? new Date() : null,
      rawPayload: input as never,
    },
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
