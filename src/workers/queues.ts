import { Queue } from "bullmq";
import { redisConnectionOptions } from "@/lib/redis";
import { logErrorEvent } from "@/lib/logger";

export const QueueName = {
  COPY_TRADE: "copy-trade",
  POSITION_SYNC: "position-sync",
} as const;

export type CopyJobData = { eventId: string; strategyId: string };

/**
 * Three attempts with exponential backoff. The worker re-checks live positions
 * before each retry, so a retry can confirm an order that did land rather than
 * sending a second one.
 */
export const COPY_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 1000 },
  removeOnComplete: { age: 60 * 60 * 24, count: 10_000 },
  removeOnFail: { age: 60 * 60 * 24 * 7 },
};

const globalForQueues = globalThis as unknown as { copyQueue?: Queue<CopyJobData> };

export function getCopyQueue(): Queue<CopyJobData> {
  if (globalForQueues.copyQueue) return globalForQueues.copyQueue;
  const queue = new Queue<CopyJobData>(QueueName.COPY_TRADE, { connection: redisConnectionOptions() });
  globalForQueues.copyQueue = queue;
  return queue;
}

/**
 * Enqueues fan-out for one event. The job id is the event id, so even if the
 * same event were accepted twice the queue would hold a single job.
 */
export async function enqueueCopyJob(data: CopyJobData): Promise<void> {
  try {
    await getCopyQueue().add("copy", data, { ...COPY_JOB_OPTIONS, jobId: data.eventId });
  } catch (error) {
    // The event is already stored; a queue outage must not lose it, so it is
    // logged for the recovery sweep rather than swallowed.
    logErrorEvent({
      event: "COPY_JOB_ENQUEUE_FAILED",
      eventId: data.eventId,
      reason: error instanceof Error ? error.message : "unknown",
    });
    throw error;
  }
}
