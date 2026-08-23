import type { ITradeProvider } from "./ITradeProvider";
import { MockTradingProvider } from "./MockTradingProvider";
import { MetaApiProvider } from "./MetaApiProvider";
import { getEnv } from "@/lib/env";
import { AppError, ErrorCode } from "@/lib/errors";
import type { Platform } from "@/types/trading";

const globalForProvider = globalThis as unknown as { tradeProvider?: ITradeProvider };

/**
 * Resolves the configured provider. Business logic depends on the interface
 * only, so switching providers is a configuration change.
 */
export function getTradeProvider(): ITradeProvider {
  if (globalForProvider.tradeProvider) return globalForProvider.tradeProvider;

  const configured = getEnv().TRADING_PROVIDER;
  let provider: ITradeProvider;

  switch (configured) {
    case "mock":
      provider = new MockTradingProvider();
      break;
    case "metaapi":
      // Constructing it throws unless a token is configured, so a
      // misconfiguration is caught at startup rather than when the first member
      // order is sent. The SDK itself is loaded on first use.
      provider = new MetaApiProvider({
        token: getEnv().METAAPI_TOKEN ?? "",
        region: getEnv().METAAPI_REGION ?? "new-york",
        accountType: getEnv().METAAPI_ACCOUNT_TYPE,
        reliability: getEnv().METAAPI_RELIABILITY,
      });
      break;
    default:
      throw new AppError(ErrorCode.PROVIDER_ERROR, `Unknown trading provider: ${configured}`);
  }

  globalForProvider.tradeProvider = provider;
  return provider;
}

/** Fails at connect time rather than at order time for an unsupported platform. */
export function assertPlatformSupported(platform: Platform): void {
  const provider = getTradeProvider();
  if (!provider.supportedPlatforms.includes(platform)) {
    throw new AppError(ErrorCode.PLATFORM_NOT_SUPPORTED, `${platform} is not supported by the configured provider`);
  }
}
