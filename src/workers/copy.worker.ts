import { Worker, type Job } from "bullmq";
import { redisConnectionOptions } from "@/lib/redis";
import { logErrorEvent, logEvent } from "@/lib/logger";
import { processTradeEvent } from "@/services/copy-engine.service";
import { COPY_JOB_OPTIONS, QueueName, type CopyJobData } from "./queues";

/**
 * Consumes copy jobs. Concurrency is safe because every member's copy is
 * guarded by the unique `(eventId, accountId)` constraint, so two workers
 * racing on one event cannot both send the same order.
 */
export function startCopyWorker(): Worker<CopyJobData> {
  const worker = new Worker<CopyJobData>(
    QueueName.COPY_TRADE,
    async (job: Job<CopyJobData>) => {
      const startedAt = Date.now();
      const outcome = await processTradeEvent(job.data.eventId);

      logEvent({
        event: "COPY_JOB_COMPLETED",
        jobId: job.id,
        attempt: job.attemptsMade + 1,
        latency: Date.now() - startedAt,
        ...outcome,
      });

      return outcome;
    },
    { connection: redisConnectionOptions(), concurrency: 5 },
  );

  worker.on("failed", (job, error) => {
    const attempt = (job?.attemptsMade ?? 0) + 1;
    logErrorEvent({
      event: "COPY_JOB_FAILED",
      jobId: job?.id,
      eventId: job?.data?.eventId,
      attempt,
      willRetry: attempt < COPY_JOB_OPTIONS.attempts,
      reason: error.message,
    });
  });

  worker.on("error", (error) => {
    logErrorEvent({ event: "COPY_WORKER_ERROR", reason: error.message });
  });

  return worker;
}
