/**
 * The slice of the official `metaapi.cloud-sdk` surface this platform uses.
 *
 * These declarations mirror the SDK's own typings (v29.x, files
 * `dist/metaApi/metaApi.d.ts`, `metatraderAccount.d.ts`,
 * `rpcMetaApiConnectionInstance.d.ts`, `metaApiConnectionInstance.d.ts` and
 * `clients/metaApi/metaApiWebsocket.client.schemas.d.ts`). They exist for two
 * reasons:
 *
 *   - the SDK is an optional dependency, so `npm run typecheck` and the test
 *     suite must pass on an installation that does not have it;
 *   - a unit test can hand the provider a fake that satisfies this contract,
 *     which is the only way to test the adapter without a live broker.
 *
 * Nothing here is invented. If a field is not listed in the SDK's typings it is
 * not listed here either — a guessed field name on a live account does not fail
 * loudly, it sends the wrong order.
 */

/** Response of every trading call. Success codes: 0, 10008-10010, 10025. */
export type MetaApiTradeResponse = {
  numericCode: number;
  stringCode: string;
  message: string;
  orderId: string;
  positionId: string;
};

export type MetaApiPosition = {
  id: number | string;
  /** `POSITION_TYPE_BUY` | `POSITION_TYPE_SELL`. */
  type: string;
  symbol: string;
  time: Date | string;
  openPrice: number;
  currentPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  volume: number;
  profit: number;
  comment?: string;
  clientId?: string;
  brokerComment?: string;
};

export type MetaApiAccountInformation = {
  platform: string;
  broker: string;
  currency: string;
  server: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  leverage: number;
  marginLevel: number;
  tradeAllowed: boolean;
  marginMode: string;
  name: string;
  login: number;
};

export type MetaApiSymbolSpecification = {
  symbol: string;
  minVolume: number;
  maxVolume: number;
  volumeStep: number;
  contractSize: number;
  digits: number;
  /** `FULL` | `LONGONLY` | `SHORTONLY` | `CLOSEONLY` | `DISABLED`. */
  tradeMode?: string;
  description?: string;
};

/**
 * Options shared by the trading calls. `comment` and `clientId` are bounded by
 * MetaApi: the sum of their lengths must be 26 characters or fewer.
 */
export type MetaApiTradeOptions = {
  comment?: string;
  clientId?: string;
  magic?: number;
  slippage?: number;
};

export interface MetaApiRpcConnection {
  connect(): Promise<void>;
  close(): Promise<void>;
  waitSynchronized(timeoutInSeconds?: number): Promise<unknown>;

  getAccountInformation(): Promise<MetaApiAccountInformation>;
  getPositions(): Promise<MetaApiPosition[]>;
  getPosition(positionId: string): Promise<MetaApiPosition>;
  getSymbolSpecification(symbol: string): Promise<MetaApiSymbolSpecification>;

  createMarketBuyOrder(
    symbol: string,
    volume: number,
    stopLoss?: number,
    takeProfit?: number,
    options?: MetaApiTradeOptions,
  ): Promise<MetaApiTradeResponse>;
  createMarketSellOrder(
    symbol: string,
    volume: number,
    stopLoss?: number,
    takeProfit?: number,
    options?: MetaApiTradeOptions,
  ): Promise<MetaApiTradeResponse>;
  modifyPosition(positionId: string, stopLoss?: number, takeProfit?: number): Promise<MetaApiTradeResponse>;
  closePosition(positionId: string, options: MetaApiTradeOptions): Promise<MetaApiTradeResponse>;
  closePositionPartially(
    positionId: string,
    volume: number,
    options: MetaApiTradeOptions,
  ): Promise<MetaApiTradeResponse>;
}

export interface MetaApiTradingAccount {
  readonly id: string;
  readonly login: string;
  readonly server: string;
  /** `CREATED` | `DEPLOYING` | `DEPLOYED` | `DEPLOY_FAILED` | `UNDEPLOYING` | … */
  readonly state: string;
  /** `CONNECTED` | `DISCONNECTED` | `DISCONNECTED_FROM_BROKER`. */
  readonly connectionStatus: string;
  deploy(): Promise<void>;
  waitConnected(timeoutInSeconds?: number, intervalInMilliseconds?: number): Promise<void>;
  getRPCConnection(): MetaApiRpcConnection;
}

export type MetaApiAccountsFilter = { query?: string; limit?: number; offset?: number };

/** Only the fields this platform sets. `magic: 0` and `name` are required. */
export type MetaApiNewAccountDto = {
  name: string;
  server: string;
  magic: number;
  login?: string;
  password?: string;
  platform?: string;
  type?: string;
  region?: string;
  reliability?: string;
  keywords?: string[];
};

export interface MetaApiAccountApi {
  getAccount(accountId: string): Promise<MetaApiTradingAccount>;
  getAccountsWithInfiniteScrollPagination(filter?: MetaApiAccountsFilter): Promise<MetaApiTradingAccount[]>;
  createAccount(account: MetaApiNewAccountDto): Promise<MetaApiTradingAccount>;
}

export interface MetaApiClient {
  readonly metatraderAccountApi: MetaApiAccountApi;
  close(): void;
}

export type MetaApiConstructor = new (token: string, opts?: Record<string, unknown>) => MetaApiClient;

/**
 * The SDK throws `TradeError` for every response code that is not a success
 * code, so a rejected order arrives as an exception rather than a return value.
 * It is recognised by shape: the class is not exported from the package root,
 * and `instanceof` across a dynamic import is not something to rely on.
 */
export type MetaApiTradeError = Error & { numericCode?: number; stringCode?: string };

export function isTradeError(error: unknown): error is MetaApiTradeError {
  if (!(error instanceof Error)) return false;
  const candidate = error as MetaApiTradeError;
  return typeof candidate.stringCode === "string" || typeof candidate.numericCode === "number";
}
