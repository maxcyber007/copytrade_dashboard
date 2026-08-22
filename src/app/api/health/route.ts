import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Check = { status: "up" | "down"; latencyMs?: number; error?: string };

async function timed(fn: () => Promise<unknown>): Promise<Check> {
  const start = Date.now();
  try {
    await fn();
    return { status: "up", latencyMs: Date.now() - start };
  } catch (error) {
    return { status: "down", error: error instanceof Error ? error.message : "unknown error" };
  }
}

export async function GET() {
  const [database, redis] = await Promise.all([
    timed(() => prisma.$queryRaw`SELECT 1`),
    timed(() => getRedis().ping()),
  ]);

  const checks = {
    database,
    redis,
    tradingProvider: { status: "up" as const, provider: getEnv().TRADING_PROVIDER },
  };

  const healthy = database.status === "up" && redis.status === "up";

  return NextResponse.json(
    { status: healthy ? "healthy" : "degraded", timestamp: new Date().toISOString(), checks },
    { status: healthy ? 200 : 503 },
  );
}
