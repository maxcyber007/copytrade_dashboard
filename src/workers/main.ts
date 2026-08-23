import "dotenv/config";
import { logger } from "@/lib/logger";
import { getEnv } from "@/lib/env";
import { startCopyWorker } from "./copy.worker";
import { startSyncWorker } from "./sync.worker";
import { scheduleMaintenanceJobs } from "./queues";

/**
 * Worker entrypoint. Runs as its own process (see the `worker` service in
 * docker-compose) so restarting the web tier never interrupts an in-flight copy
 * and the worker can be scaled independently of web traffic.
 */
async function main() {
  const env = getEnv();

  const copyWorker = startCopyWorker();
  const syncWorker = startSyncWorker();

  await scheduleMaintenanceJobs({
    syncSeconds: env.SYNC_INTERVAL_SECONDS,
    statsSeconds: env.STATS_INTERVAL_SECONDS,
  });

  logger.info({
    event: "WORKER_STARTED",
    provider: env.TRADING_PROVIDER,
    queues: ["copy-trade", "position-sync"],
    syncSeconds: env.SYNC_INTERVAL_SECONDS,
    statsSeconds: env.STATS_INTERVAL_SECONDS,
  });

  const shutdown = async (signal: string) => {
    logger.info({ event: "WORKER_SHUTDOWN", signal });
    // Let in-flight work finish rather than abandoning a half-sent order.
    await Promise.all([copyWorker.close(), syncWorker.close()]);
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error) => {
  logger.error({ event: "WORKER_FATAL", err: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
