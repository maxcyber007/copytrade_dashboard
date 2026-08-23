import type { ITradeProvider } from "./ITradeProvider";
import type {
  AccountInfo,
  ClosePositionRequest,
  ConnectAccountInput,
  ConnectionResult,
  ModifyPositionRequest,
  OpenPositionRequest,
  OrderResult,
  Platform,
  PositionMode,
  ProviderPosition,
  SymbolSpec,
} from "@/types/trading";
import type {
  MetaApiClient,
  MetaApiConstructor,
  MetaApiPosition,
  MetaApiRpcConnection,
  MetaApiTradeResponse,
  MetaApiTradingAccount,
} from "./metaapi-sdk";
import { isTradeError } from "./metaapi-sdk";
import { AppError, ErrorCode } from "@/lib/errors";
import { logErrorEvent, logEvent } from "@/lib/logger";

/**
 * MetaApi adapter — the production implementation of {@link ITradeProvider}.
 *
 * It is written against the official `metaapi.cloud-sdk` typings rather than
 * against the REST endpoints: the SDK owns the regional routing, the socket
 * lifecycle and the retry policy, and its typings are the authoritative record
 * of every field name used here (see `metaapi-sdk.ts`).
 *
 * The SDK is an **optional** dependency, loaded through a dynamic import, so a
 * deployment running `TRADING_PROVIDER=mock` does not carry its ~47 MB. A
 * deployment that sets `TRADING_PROVIDER=metaapi` installs it:
 *
 *     npm install metaapi.cloud-sdk
 *
 * Two behaviours of the SDK shape this file and are easy to get wrong:
 *
 *   1. A rejected order is **thrown**, not returned. `MetaApiWebsocketClient`
 *      only returns the response for the success codes (`ERR_NO_ERROR`,
 *      `TRADE_RETCODE_PLACED`, `TRADE_RETCODE_DONE`, `TRADE_RETCODE_DONE_PARTIAL`,
 *      `TRADE_RETCODE_NO_CHANGES`) and throws `TradeError` for everything else.
 *      So "no exception" is what success means here — never a 200.
 *   2. `comment` and `clientId` together may not exceed 26 characters. The copy
 *      correlation id therefore travels as `clientId` alone, and is read back
 *      into {@link ProviderPosition.comment} so the copy engine can recognise
 *      an order that already landed.
 *
 * Runtime verification against a live demo account is the operator's step —
 * see `docs/trading-provider.md`.
 */

/** Module specifiers to try, most Node-appropriate first. */
const SDK_SPECIFIERS = ["metaapi.cloud-sdk/esm-node", "metaapi.cloud-sdk"];

/**
 * Account-level volume bounds. MetaApi reports volume constraints per symbol,
 * not per account, so these are a permissive floor: the copy engine combines
 * them with the per-symbol specification from {@link getSymbolSpec}, which is
 * the authority, by taking the stricter of the two.
 */
const DEFAULT_MIN_LOT = 0.01;
const DEFAULT_MAX_LOT = 100;
const DEFAULT_LOT_STEP = 0.01;

/** MT5 trade return codes (ENUM_TRADE_RETURN_CODE) mapped to platform codes. */
const NUMERIC_CODE_MAP: Record<number, string> = {
  10004: ErrorCode.TIMEOUT, // REQUOTE
  10006: ErrorCode.PROVIDER_ERROR, // REJECT
  10007: ErrorCode.PROVIDER_ERROR, // CANCEL
  10013: ErrorCode.PROVIDER_ERROR, // INVALID request
  10014: ErrorCode.INVALID_VOLUME, // INVALID_VOLUME
  10015: ErrorCode.INVALID_STOPS, // INVALID_PRICE
  10016: ErrorCode.INVALID_STOPS, // INVALID_STOPS
  10017: ErrorCode.MARKET_CLOSED, // TRADE_DISABLED
  10018: ErrorCode.MARKET_CLOSED, // MARKET_CLOSED
  10019: ErrorCode.INSUFFICIENT_MARGIN, // NO_MONEY
  10020: ErrorCode.TIMEOUT, // PRICE_CHANGED
  10021: ErrorCode.MARKET_CLOSED, // PRICE_OFF
  10024: ErrorCode.RATE_LIMITED, // TOO_MANY_REQUESTS
  10027: ErrorCode.MARKET_CLOSED, // CLIENT_DISABLES_AT (algo trading disabled)
  10030: ErrorCode.PROVIDER_ERROR, // INVALID_FILL
  10031: ErrorCode.PLATFORM_CONNECTION_ERROR, // CONNECTION
  10034: ErrorCode.INVALID_VOLUME, // LIMIT_VOLUME
  10036: ErrorCode.POSITION_NOT_FOUND, // POSITION_CLOSED
  10038: ErrorCode.INVALID_VOLUME, // CLOSE_ORDER_EXIST / volume over position
  10040: ErrorCode.INVALID_VOLUME, // LIMIT_POSITIONS
  // MT4 error codes (book.mql4 appendix) — a disjoint range, so one map serves both.
  129: ErrorCode.INVALID_STOPS, // ERR_INVALID_PRICE
  130: ErrorCode.INVALID_STOPS, // ERR_INVALID_STOPS
  131: ErrorCode.INVALID_VOLUME, // ERR_INVALID_TRADE_VOLUME
  132: ErrorCode.MARKET_CLOSED, // ERR_MARKET_CLOSED
  133: ErrorCode.MARKET_CLOSED, // ERR_TRADE_DISABLED
  134: ErrorCode.INSUFFICIENT_MARGIN, // ERR_NOT_ENOUGH_MONEY
  135: ErrorCode.TIMEOUT, // ERR_PRICE_CHANGED
  136: ErrorCode.MARKET_CLOSED, // ERR_OFF_QUOTES
  138: ErrorCode.TIMEOUT, // ERR_REQUOTE
  141: ErrorCode.RATE_LIMITED, // ERR_TOO_MANY_REQUESTS
  145: ErrorCode.INVALID_STOPS, // ERR_MODIFY_DENIED (too close to market)
  146: ErrorCode.TIMEOUT, // ERR_TRADE_CONTEXT_BUSY
  148: ErrorCode.INVALID_VOLUME, // ERR_TRADE_TOO_MANY_ORDERS
};

/** Checked before the numeric code: a string code is the same on MT4 and MT5. */
const STRING_CODE_MAP: Record<string, string> = {
  TRADE_RETCODE_INVALID_VOLUME: ErrorCode.INVALID_VOLUME,
  TRADE_RETCODE_INVALID_STOPS: ErrorCode.INVALID_STOPS,
  TRADE_RETCODE_INVALID_PRICE: ErrorCode.INVALID_STOPS,
  TRADE_RETCODE_MARKET_CLOSED: ErrorCode.MARKET_CLOSED,
  TRADE_RETCODE_TRADE_DISABLED: ErrorCode.MARKET_CLOSED,
  TRADE_RETCODE_NO_MONEY: ErrorCode.INSUFFICIENT_MARGIN,
  TRADE_RETCODE_PRICE_CHANGED: ErrorCode.TIMEOUT,
  TRADE_RETCODE_REQUOTE: ErrorCode.TIMEOUT,
  TRADE_RETCODE_TOO_MANY_REQUESTS: ErrorCode.RATE_LIMITED,
  TRADE_RETCODE_POSITION_CLOSED: ErrorCode.POSITION_NOT_FOUND,
  TRADE_RETCODE_LIMIT_VOLUME: ErrorCode.INVALID_VOLUME,
  TRADE_RETCODE_CONNECTION: ErrorCode.PLATFORM_CONNECTION_ERROR,
  ERR_INVALID_STOPS: ErrorCode.INVALID_STOPS,
  ERR_INVALID_TRADE_VOLUME: ErrorCode.INVALID_VOLUME,
  ERR_MARKET_CLOSED: ErrorCode.MARKET_CLOSED,
  ERR_TRADE_DISABLED: ErrorCode.MARKET_CLOSED,
  ERR_NOT_ENOUGH_MONEY: ErrorCode.INSUFFICIENT_MARGIN,
  ERR_OFF_QUOTES: ErrorCode.MARKET_CLOSED,
  ERR_REQUOTE: ErrorCode.TIMEOUT,
  ERR_PRICE_CHANGED: ErrorCode.TIMEOUT,
  ERR_TRADE_CONTEXT_BUSY: ErrorCode.TIMEOUT,
};

export type MetaApiProviderConfig = {
  token: string;
  region: string;
  /** How long to wait for the terminal to reach the broker. */
  connectTimeoutSeconds?: number;
  /** Injected by tests so the adapter can be exercised without the package. */
  loadSdk?: () => Promise<MetaApiConstructor>;
};

/** Cached across hot reloads: a connection is a socket, not a request. */
const globalForMetaApi = globalThis as unknown as {
  metaApiClient?: Promise<MetaApiClient>;
  metaApiConnections?: Map<string, Promise<MetaApiRpcConnection>>;
};

async function loadSdkFromPackage(): Promise<MetaApiConstructor> {
  const failures: string[] = [];

  for (const specifier of SDK_SPECIFIERS) {
    try {
      // A variable specifier keeps the bundler from pulling the SDK into the
      // build of a deployment that does not use it.
      const imported: unknown = await import(/* webpackIgnore: true */ specifier);
      const unwrapped = (imported as { default?: unknown })?.default ?? imported;
      const candidate = (unwrapped as { default?: unknown })?.default ?? unwrapped;

      if (typeof candidate === "function") return candidate as MetaApiConstructor;
      failures.push(`${specifier}: module has no callable default export`);
    } catch (error) {
      failures.push(`${specifier}: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  throw new AppError(
    ErrorCode.PROVIDER_ERROR,
    "The metaapi.cloud-sdk package is required by TRADING_PROVIDER=metaapi but could not be loaded. " +
      `Install it with \`npm install metaapi.cloud-sdk\`. Attempts: ${failures.join("; ")}`,
  );
}

export class MetaApiProvider implements ITradeProvider {
  readonly supportedPlatforms = ["MT4", "MT5"] as const;

  private readonly connectTimeoutSeconds: number;
  private readonly loadSdk: () => Promise<MetaApiConstructor>;

  constructor(private readonly config: MetaApiProviderConfig) {
    if (!config.token) {
      throw new AppError(ErrorCode.PROVIDER_ERROR, "METAAPI_TOKEN is required for the MetaApi provider");
    }
    this.connectTimeoutSeconds = config.connectTimeoutSeconds ?? 90;
    this.loadSdk = config.loadSdk ?? loadSdkFromPackage;
  }

  // ---------------------------------------------------------------- lifecycle

  private client(): Promise<MetaApiClient> {
    // One client per process: it owns the websocket pool, and a second one
    // would open a second set of sockets to the same region.
    globalForMetaApi.metaApiClient ??= this.loadSdk()
      .then((MetaApi) => new MetaApi(this.config.token, { region: this.config.region }))
      .catch((error) => {
        // A failed construction must not be cached, or every later call fails
        // with the first error even after the cause is fixed.
        globalForMetaApi.metaApiClient = undefined;
        throw error;
      });

    return globalForMetaApi.metaApiClient;
  }

  private connections(): Map<string, Promise<MetaApiRpcConnection>> {
    globalForMetaApi.metaApiConnections ??= new Map();
    return globalForMetaApi.metaApiConnections;
  }

  /** Deploys and connects an account, then opens (or reuses) its RPC connection. */
  private connection(providerAccountId: string): Promise<MetaApiRpcConnection> {
    const cache = this.connections();
    const cached = cache.get(providerAccountId);
    if (cached) return cached;

    const opening = (async () => {
      const client = await this.client();
      const account = await client.metatraderAccountApi.getAccount(providerAccountId);
      return this.openConnection(account);
    })().catch((error) => {
      cache.delete(providerAccountId);
      throw this.connectionError(error, providerAccountId);
    });

    cache.set(providerAccountId, opening);
    return opening;
  }

  private async openConnection(account: MetaApiTradingAccount): Promise<MetaApiRpcConnection> {
    if (account.state !== "DEPLOYED") {
      await account.deploy();
    }

    // Until the terminal has reached the broker, a trading call would fail with
    // a connection error rather than tell us the account is still starting.
    await account.waitConnected(this.connectTimeoutSeconds);

    const connection = account.getRPCConnection();
    await connection.connect();
    await connection.waitSynchronized(this.connectTimeoutSeconds);

    logEvent({ event: "METAAPI_CONNECTION_OPENED", providerAccountId: account.id });
    return connection;
  }

  private connectionError(error: unknown, providerAccountId?: string): AppError {
    if (error instanceof AppError) return error;
    const message = error instanceof Error ? error.message : "unknown error";
    logErrorEvent({ event: "METAAPI_CONNECTION_FAILED", providerAccountId, reason: message });
    return new AppError(ErrorCode.PLATFORM_CONNECTION_ERROR, `MetaApi connection failed: ${message}`);
  }

  // ------------------------------------------------------------------ account

  async connectAccount(input: ConnectAccountInput): Promise<ConnectionResult> {
    if (!input.password) {
      throw new AppError(ErrorCode.PLATFORM_CONNECTION_ERROR, "Password is required to connect");
    }

    const client = await this.client();
    const api = client.metatraderAccountApi;

    let account: MetaApiTradingAccount;

    try {
      // Reuse the MetaApi account for these credentials if one exists. Creating
      // a second one for the same login is billed twice and leaves two
      // terminals fighting over the same broker session.
      const existing = await api
        .getAccountsWithInfiniteScrollPagination({ query: input.login, limit: 100 })
        .catch(() => [] as MetaApiTradingAccount[]);

      const match = existing.find(
        (candidate) => String(candidate.login) === input.login && candidate.server === input.server,
      );

      account =
        match ??
        (await api.createAccount({
          name: `${input.broker} ${input.login}`.slice(0, 64),
          login: input.login,
          password: input.password,
          server: input.server,
          platform: input.platform.toLowerCase(),
          // Magic 0: the member's own manual trades must stay untouched, and we
          // identify our orders by clientId rather than by magic number.
          magic: 0,
          type: "cloud-g1",
          region: this.config.region,
          reliability: "high",
        }));

      if (!match) {
        logEvent({ event: "METAAPI_ACCOUNT_CREATED", providerAccountId: account.id, platform: input.platform });
      }
    } catch (error) {
      throw this.connectionError(error);
    }

    const connection = await (async () => {
      try {
        const opened = await this.openConnection(account);
        this.connections().set(account.id, Promise.resolve(opened));
        return opened;
      } catch (error) {
        throw this.connectionError(error, account.id);
      }
    })();

    let info;
    try {
      info = await connection.getAccountInformation();
    } catch (error) {
      throw this.connectionError(error, account.id);
    }

    return {
      providerAccountId: account.id,
      platform: input.platform,
      positionMode: positionModeOf(input.platform, info.marginMode),
      currency: info.currency,
      balance: info.balance,
      // Refined per symbol at order time; see DEFAULT_MIN_LOT above.
      minLot: DEFAULT_MIN_LOT,
      maxLot: DEFAULT_MAX_LOT,
      lotStep: DEFAULT_LOT_STEP,
    };
  }

  /**
   * Closes the socket for this account. The MetaApi account itself is left
   * deployed: undeploying is a provisioning decision with a billing effect, and
   * a member removing one platform account must not tear down a terminal that
   * another of their subscriptions may still be trading on.
   */
  async disconnectAccount(providerAccountId: string): Promise<void> {
    const cached = this.connections().get(providerAccountId);
    if (!cached) return;

    this.connections().delete(providerAccountId);

    try {
      const connection = await cached;
      await connection.close();
    } catch (error) {
      // Nothing to recover: the session is gone either way.
      logErrorEvent({
        event: "METAAPI_DISCONNECT_FAILED",
        providerAccountId,
        reason: error instanceof Error ? error.message : "unknown",
      });
    }
  }

  async getAccountInfo(providerAccountId: string): Promise<AccountInfo> {
    const connection = await this.connection(providerAccountId);

    try {
      const info = await connection.getAccountInformation();
      return {
        balance: info.balance,
        equity: info.equity,
        margin: info.margin,
        freeMargin: info.freeMargin,
        currency: info.currency,
        positionMode: positionModeOf(info.platform === "mt4" ? "MT4" : "MT5", info.marginMode),
      };
    } catch (error) {
      throw this.connectionError(error, providerAccountId);
    }
  }

  async getPositions(providerAccountId: string): Promise<ProviderPosition[]> {
    const connection = await this.connection(providerAccountId);

    try {
      const positions = await connection.getPositions();
      return positions.map(toProviderPosition);
    } catch (error) {
      throw this.connectionError(error, providerAccountId);
    }
  }

  async getSymbolSpec(providerAccountId: string, symbol: string): Promise<SymbolSpec | null> {
    const connection = await this.connection(providerAccountId);

    let spec;
    try {
      spec = await connection.getSymbolSpecification(symbol);
    } catch {
      // A symbol the broker does not offer is not an outage: the copy engine
      // treats null as "not tradable here" and skips the member.
      return null;
    }

    if (!spec) return null;

    return {
      symbol: spec.symbol,
      minLot: spec.minVolume,
      maxLot: spec.maxVolume,
      lotStep: spec.volumeStep,
      digits: spec.digits,
      // LONGONLY / SHORTONLY cannot be expressed here; those orders are refused
      // by the broker and surface as a mapped rejection instead.
      tradeAllowed: spec.tradeMode === undefined || !["DISABLED", "CLOSEONLY"].includes(spec.tradeMode),
    };
  }

  // ------------------------------------------------------------------ trading

  async openPosition(providerAccountId: string, request: OpenPositionRequest): Promise<OrderResult> {
    const connection = await this.connection(providerAccountId);

    // The correlation id travels as clientId alone: MetaApi caps comment plus
    // clientId at 26 characters, and it is read back into `comment` by
    // toProviderPosition so a retry can recognise its own order.
    const options = {
      clientId: request.clientId,
      ...(request.slippagePoints ? { slippage: request.slippagePoints } : {}),
    };

    const send = () =>
      request.orderType === "BUY"
        ? connection.createMarketBuyOrder(request.symbol, request.volume, request.sl, request.tp, options)
        : connection.createMarketSellOrder(request.symbol, request.volume, request.sl, request.tp, options);

    const result = await this.trade(send, providerAccountId);
    if (!result.executed || !result.ticket) return result;

    // The trade response carries no fill price. Reading the position back keeps
    // the member's recorded entry price their own, rather than the master's.
    return { ...result, ...(await this.fillDetails(connection, result.ticket, request.volume)) };
  }

  async modifyPosition(providerAccountId: string, request: ModifyPositionRequest): Promise<OrderResult> {
    const connection = await this.connection(providerAccountId);
    return this.trade(() => connection.modifyPosition(request.ticket, request.sl, request.tp), providerAccountId, {
      ticket: request.ticket,
    });
  }

  async closePosition(providerAccountId: string, request: ClosePositionRequest): Promise<OrderResult> {
    const connection = await this.connection(providerAccountId);

    const send = () =>
      request.volume !== undefined
        ? connection.closePositionPartially(request.ticket, request.volume, {})
        : connection.closePosition(request.ticket, {});

    const result = await this.trade(send, providerAccountId, { ticket: request.ticket });

    // MT4 issues a new ticket for the remainder of a partial close. When the
    // response names a different position, that is the remainder, and the copy
    // engine remaps its mapping onto it.
    if (result.executed && request.volume !== undefined) {
      const returned = (result.raw as MetaApiTradeResponse | undefined)?.positionId;
      if (returned && returned !== request.ticket) {
        return { ...result, ticket: request.ticket, remainderTicket: returned, volume: request.volume };
      }
      return { ...result, ticket: request.ticket, volume: request.volume };
    }

    return result;
  }

  // ------------------------------------------------------------------ helpers

  /**
   * Runs one trading call and turns its outcome into an {@link OrderResult}.
   *
   * A returned response is a filled order — the SDK throws for every code that
   * is not a success code — so nothing here infers success from the absence of
   * an error field. A rejection becomes `executed: false` with a mapped code,
   * which the copy engine records as FAILED without retrying; anything else
   * (a socket drop, a timeout) is thrown so the queue can retry it.
   */
  private async trade(
    send: () => Promise<MetaApiTradeResponse>,
    providerAccountId: string,
    defaults: { ticket?: string } = {},
  ): Promise<OrderResult> {
    try {
      const response = await send();

      return {
        executed: true,
        ticket: response.positionId || defaults.ticket || response.orderId,
        raw: response,
      };
    } catch (error) {
      if (!isTradeError(error)) throw this.connectionError(error, providerAccountId);

      const errorCode = mapTradeErrorCode(error.stringCode, error.numericCode);

      logErrorEvent({
        event: "METAAPI_TRADE_REJECTED",
        providerAccountId,
        stringCode: error.stringCode,
        numericCode: error.numericCode,
        errorCode,
      });

      return {
        executed: false,
        errorCode,
        errorMessage: error.message,
        raw: { numericCode: error.numericCode, stringCode: error.stringCode, message: error.message },
      };
    }
  }

  /** Best effort: a missing fill price must not fail an order that went through. */
  private async fillDetails(
    connection: MetaApiRpcConnection,
    ticket: string,
    requestedVolume: number,
  ): Promise<{ price?: number; volume: number }> {
    try {
      const position = await connection.getPosition(ticket);
      return { price: position.openPrice, volume: position.volume };
    } catch {
      return { volume: requestedVolume };
    }
  }
}

/**
 * MT4 is hedging-only. On MT5 the broker decides, and MetaApi reports it as the
 * MT5 margin mode (`retail-netting`, `retail-hedging`, `exchange`). Anything
 * unrecognised is reported as hedging, which is what a standalone ticket per
 * copied trade assumes.
 */
function positionModeOf(platform: Platform, marginMode: string | undefined): PositionMode {
  if (platform === "MT4") return "HEDGING";
  const mode = (marginMode ?? "").toLowerCase();
  return mode.includes("netting") || mode === "exchange" ? "NETTING" : "HEDGING";
}

function toProviderPosition(position: MetaApiPosition): ProviderPosition {
  return {
    ticket: String(position.id),
    symbol: position.symbol,
    orderType: position.type === "POSITION_TYPE_SELL" ? "SELL" : "BUY",
    volume: position.volume,
    openPrice: position.openPrice,
    currentPrice: position.currentPrice,
    sl: position.stopLoss,
    tp: position.takeProfit,
    profit: position.profit,
    openedAt: position.time instanceof Date ? position.time : new Date(position.time),
    // The correlation id was sent as clientId; the platform reads it as the
    // comment, which is where the copy engine looks for it.
    comment: position.clientId ?? position.comment,
  };
}

function mapTradeErrorCode(stringCode: string | undefined, numericCode: number | undefined): string {
  if (stringCode && STRING_CODE_MAP[stringCode]) return STRING_CODE_MAP[stringCode];
  if (numericCode !== undefined && NUMERIC_CODE_MAP[numericCode]) return NUMERIC_CODE_MAP[numericCode];
  return ErrorCode.PROVIDER_ERROR;
}
