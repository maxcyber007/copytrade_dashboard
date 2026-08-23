import { Queue } from "bullmq";
import { redisConnectionOptions } from "@/lib/redis";
import { logErrorEvent } from "@/lib/logger";

export const QueueName = {
  COPY_TRADE: "copy-trade",
  POSITION_SYNC: "position-sync",
} as const;

export type CopyJobData = { eventId: string; strategyId: string };

export type MaintenanceJobData = Record<string, never>;

export const MaintenanceJob = {
  ACCOUNT_SYNC: "account-sync",
  STRATEGY_STATS: "strategy-stats",
  MASTER_WATCH: "master-watch",
} as const;

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

const globalForQueues = globalThis as unknown as {
  copyQueue?: Queue<CopyJobData>;
  maintenanceQueue?: Queue<MaintenanceJobData>;
};

export function getCopyQueue(): Queue<CopyJobData> {
  if (globalForQueues.copyQueue) return globalForQueues.copyQueue;
  const queue = new Queue<CopyJobData>(QueueName.COPY_TRADE, { connection: redisConnectionOptions() });
  globalForQueues.copyQueue = queue;
  return queue;
}

export function getMaintenanceQueue(): Queue<MaintenanceJobData> {
  if (globalForQueues.maintenanceQueue) return globalForQueues.maintenanceQueue;
  const queue = new Queue<MaintenanceJobData>(QueueName.POSITION_SYNC, { connection: redisConnectionOptions() });
  globalForQueues.maintenanceQueue = queue;
  return queue;
}

/**
 * Registers the recurring jobs.
 *
 * `upsertJobScheduler` is keyed by the scheduler id, so restarting the worker —
 * or running several of them — re-uses the one schedule instead of stacking
 * another copy of it.
 */
export async function scheduleMaintenanceJobs(intervals: {
  syncSeconds: number;
  statsSeconds: number;
  masterWatchSeconds: number;
}) {
  const queue = getMaintenanceQueue();

  await queue.upsertJobScheduler(
    MaintenanceJob.ACCOUNT_SYNC,
    { every: intervals.syncSeconds * 1000 },
    {
      name: MaintenanceJob.ACCOUNT_SYNC,
      opts: { removeOnComplete: { count: 50 }, removeOnFail: { count: 100 } },
    },
  );

  // Runs far more often than the others: this one decides how long a follower
  // waits before a master's trade reaches them.
  await queue.upsertJobScheduler(
    MaintenanceJob.MASTER_WATCH,
    { every: intervals.masterWatchSeconds * 1000 },
    {
      name: MaintenanceJob.MASTER_WATCH,
      opts: { removeOnComplete: { count: 50 }, removeOnFail: { count: 100 } },
    },
  );

  await queue.upsertJobScheduler(
    MaintenanceJob.STRATEGY_STATS,
    { every: intervals.statsSeconds * 1000 },
    {
      name: MaintenanceJob.STRATEGY_STATS,
      opts: { removeOnComplete: { count: 50 }, removeOnFail: { count: 100 } },
    },
  );
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
