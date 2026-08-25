import { getEnv } from "@/lib/env";
import { AppError, ErrorCode } from "@/lib/errors";

/**
 * Known MetaTrader brokers and their servers.
 *
 * MetaApi exposes this through the provisioning API rather than the SDK, so it
 * is called directly. The response is a flat map of broker name to server
 * names, capped by MetaApi at 10 brokers and 10 servers each — it is a search,
 * not a full directory, so the caller always passes a query.
 *
 * Servers are version-specific: an MT4 server name is not valid for MT5, which
 * is why the platform is part of the request rather than an afterthought.
 */
const PROVISIONING_HOST = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";

export type BrokerServers = { broker: string; servers: string[] }[];

export async function searchKnownServers(
  platform: "MT4" | "MT5",
  query: string,
): Promise<BrokerServers> {
  const token = getEnv().METAAPI_TOKEN;
  if (!token) throw new AppError(ErrorCode.PROVIDER_ERROR, "MetaApi is not configured");

  const version = platform === "MT4" ? 4 : 5;
  const url = `${PROVISIONING_HOST}/known-mt-servers/${version}/search?query=${encodeURIComponent(query)}`;

  const res = await fetch(url, {
    headers: { "auth-token": token },
    // Broker lists change rarely; a short cache keeps typing responsive
    // without holding a stale directory for long.
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new AppError(ErrorCode.PROVIDER_ERROR, `MetaApi returned ${res.status}`, { httpStatus: 502 });
  }

  const body = (await res.json()) as Record<string, unknown>;

  return Object.entries(body)
    .filter(([, servers]) => Array.isArray(servers))
    .map(([broker, servers]) => ({
      broker,
      servers: (servers as unknown[]).filter((s): s is string => typeof s === "string"),
    }));
}
