import { Queue } from "bullmq";
import { redisConnectionOptions } from "@/lib/redis";

export const QueueName = {
  COPY_TRADE: "copy-trade",
  POSITION_SYNC: "position-sync",
} as const;

/** Retry policy for copy jobs: 3 attempts with exponential backoff (Phase 8). */
export const COPY_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 1000 },
  removeOnComplete: { age: 60 * 60 * 24, count: 10_000 },
  removeOnFail: { age: 60 * 60 * 24 * 7 },
};

const globalForQueues = globalThis as unknown as { copyQueue?: Queue };

export function getCopyQueue(): Queue {
  if (globalForQueues.copyQueue) return globalForQueues.copyQueue;
  const queue = new Queue(QueueName.COPY_TRADE, { connection: redisConnectionOptions() });
  if (process.env.NODE_ENV !== "production") globalForQueues.copyQueue = queue;
  return queue;
}
