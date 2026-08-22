import "dotenv/config";
import { logger } from "@/lib/logger";
import { getEnv } from "@/lib/env";

/**
 * Worker entrypoint. Runs as its own process (see docker-compose `worker`
 * service) so that restarting the web tier never interrupts copy execution.
 *
 * Copy and position-sync workers are registered here in Phase 8.
 */
async function main() {
  const env = getEnv();
  logger.info({ event: "WORKER_STARTED", provider: env.MT5_PROVIDER, redis: "connected" });

  const shutdown = (signal: string) => {
    logger.info({ event: "WORKER_SHUTDOWN", signal });
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  logger.error({ event: "WORKER_FATAL", err: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
