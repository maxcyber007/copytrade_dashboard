import { Worker, type Job } from "bullmq";
import { redisConnectionOptions } from "@/lib/redis";
import { logErrorEvent, logEvent } from "@/lib/logger";
import { reconcileAllAccounts, recomputeAllStats } from "@/services/reconcile.service";
import { pollAllMasterAccounts } from "@/services/master-watch.service";
import { MaintenanceJob, QueueName, type MaintenanceJobData } from "./queues";

/**
 * Runs the recurring maintenance jobs.
 *
 * Concurrency is 1: these sweep every account and every strategy, and two
 * passes racing each other would waste broker calls without making the data any
 * fresher.
 */
export function startSyncWorker(): Worker<MaintenanceJobData> {
  const worker = new Worker<MaintenanceJobData>(
    QueueName.POSITION_SYNC,
    async (job: Job<MaintenanceJobData>) => {
      const startedAt = Date.now();

      if (job.name === MaintenanceJob.ACCOUNT_SYNC) {
        const result = await reconcileAllAccounts();
        logEvent({ event: "ACCOUNT_SYNC_COMPLETED", latency: Date.now() - startedAt, ...result });
        return result;
      }

      if (job.name === MaintenanceJob.MASTER_WATCH) {
        const result = await pollAllMasterAccounts();
        // Logged only when there was something to do: at this cadence a line
        // per poll would bury everything else in the log.
        if (result.strategies > 0) {
          logEvent({ event: "MASTER_WATCH_COMPLETED", latency: Date.now() - startedAt, ...result });
        }
        return result;
      }

      if (job.name === MaintenanceJob.STRATEGY_STATS) {
        const result = await recomputeAllStats();
        logEvent({ event: "STRATEGY_STATS_COMPLETED", latency: Date.now() - startedAt, ...result });
        return result;
      }

      logErrorEvent({ event: "UNKNOWN_MAINTENANCE_JOB", name: job.name });
      return null;
    },
    { connection: redisConnectionOptions(), concurrency: 1 },
  );

  worker.on("failed", (job, error) => {
    logErrorEvent({ event: "MAINTENANCE_JOB_FAILED", name: job?.name, reason: error.message });
  });

  worker.on("error", (error) => {
    logErrorEvent({ event: "SYNC_WORKER_ERROR", reason: error.message });
  });

  return worker;
}
