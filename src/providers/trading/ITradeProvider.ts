import type {
  AccountInfo,
  ClosedPositionResult,
  ClosePositionRequest,
  ConnectAccountInput,
  ConnectionResult,
  ModifyPositionRequest,
  OpenPositionRequest,
  OrderResult,
  Platform,
  ProviderPosition,
  SymbolSpec,
} from "@/types/trading";

/**
 * The only contract business logic is allowed to depend on.
 *
 * One interface serves both MetaTrader 4 and MetaTrader 5: the platform is a
 * property of the account, not of the code path. Implementations translate the
 * platform differences (MT4 is hedging-only and remaps tickets on partial close;
 * MT5 may be netting) and expose the same shape upward.
 *
 * Implementations: MockMT5Provider / MockMT4Provider (Phase 6), MetaApiProvider
 * (Phase 11, written against the official documentation at that time).
 */
export interface ITradeProvider {
  /** Platforms this provider can serve. */
  readonly supportedPlatforms: readonly Platform[];

  connectAccount(input: ConnectAccountInput): Promise<ConnectionResult>;
  disconnectAccount(providerAccountId: string): Promise<void>;

  getAccountInfo(providerAccountId: string): Promise<AccountInfo>;
  getPositions(providerAccountId: string): Promise<ProviderPosition[]>;
  getSymbolSpec(providerAccountId: string, symbol: string): Promise<SymbolSpec | null>;

  /**
   * What the broker recorded for a position that is no longer open: the fill
   * price and the realised profit.
   *
   * Returns null when the broker has nothing to say about the ticket yet, which
   * is not an error — the history simply shows no figure rather than one this
   * platform made up.
   */
  getClosedPosition(providerAccountId: string, ticket: string): Promise<ClosedPositionResult | null>;

  openPosition(providerAccountId: string, request: OpenPositionRequest): Promise<OrderResult>;
  modifyPosition(providerAccountId: string, request: ModifyPositionRequest): Promise<OrderResult>;
  closePosition(providerAccountId: string, request: ClosePositionRequest): Promise<OrderResult>;
}
