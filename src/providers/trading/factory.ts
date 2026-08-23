import type { ITradeProvider } from "./ITradeProvider";
import { MockTradingProvider } from "./MockTradingProvider";
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
      // Written in Phase 11 against the official documentation at that time.
      throw new AppError(ErrorCode.PROVIDER_ERROR, "The MetaApi provider is not implemented yet");
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
