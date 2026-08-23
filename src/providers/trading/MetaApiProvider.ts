import type { ITradeProvider } from "./ITradeProvider";
import type {
  AccountInfo,
  ClosePositionRequest,
  ConnectAccountInput,
  ConnectionResult,
  ModifyPositionRequest,
  OpenPositionRequest,
  OrderResult,
  ProviderPosition,
  SymbolSpec,
} from "@/types/trading";
import { AppError, ErrorCode } from "@/lib/errors";

/**
 * MetaApi adapter — NOT IMPLEMENTED.
 *
 * This file deliberately contains no trading calls. Writing them would mean
 * guessing MetaApi's request shapes, and a guessed field name on a live account
 * does not fail loudly: it sends the wrong order. Everything here throws until
 * each method is written against the official documentation and verified on a
 * demo account.
 *
 * What has been confirmed so far (public documentation index, August 2026):
 *
 *   - Two separate APIs: provisioning (account management) and the client API
 *     (trading and terminal state).
 *   - Requests authenticate with an `auth-token` header, not a bearer token.
 *   - Trading goes through `POST /users/current/accounts/{accountId}/trade`
 *     with an `actionType` discriminator (e.g. POSITION_CLOSE_ID,
 *     POSITIONS_CLOSE_SYMBOL), and the response carries `numericCode`,
 *     `stringCode`, `message`, `orderId` and `positionId`.
 *   - Account information is read through the client API's
 *     `readAccountInformation` endpoint.
 *
 * What must be confirmed before writing each method:
 *
 *   1. The regional base URLs and how the region is selected.
 *   2. Provisioning: creating and deploying an account, and how long deployment
 *      takes before the account is tradable.
 *   3. The exact `actionType` values for a market buy and sell, and which
 *      fields carry volume, stop loss, take profit, slippage and a client id.
 *   4. The positions endpoint and its field names, including how MT4 and MT5
 *      differ and how a netting account reports its net position.
 *   5. Symbol specification: minimum volume, volume step and digits.
 *   6. Which `numericCode` / `stringCode` values mean "filled", and which map to
 *      MARKET_CLOSED, INVALID_VOLUME, INVALID_STOPS and INSUFFICIENT_MARGIN.
 *   7. Whether a partial close returns a new ticket on MT4, as the platform's
 *      `OrderResult.remainderTicket` expects.
 *   8. Rate limits and the retry policy the API documents.
 *
 * Until then `TRADING_PROVIDER=metaapi` fails at startup rather than at order
 * time, and the mock provider serves development and testing.
 */
export class MetaApiProvider implements ITradeProvider {
  readonly supportedPlatforms = ["MT4", "MT5"] as const;

  constructor(
    private readonly config: { token: string; region: string },
  ) {
    if (!config.token) {
      throw new AppError(ErrorCode.PROVIDER_ERROR, "METAAPI_TOKEN is required for the MetaApi provider");
    }
  }

  connectAccount(_input: ConnectAccountInput): Promise<ConnectionResult> {
    return this.notImplemented("connectAccount");
  }

  disconnectAccount(_providerAccountId: string): Promise<void> {
    return this.notImplemented("disconnectAccount");
  }

  getAccountInfo(_providerAccountId: string): Promise<AccountInfo> {
    return this.notImplemented("getAccountInfo");
  }

  getPositions(_providerAccountId: string): Promise<ProviderPosition[]> {
    return this.notImplemented("getPositions");
  }

  getSymbolSpec(_providerAccountId: string, _symbol: string): Promise<SymbolSpec | null> {
    return this.notImplemented("getSymbolSpec");
  }

  openPosition(_providerAccountId: string, _request: OpenPositionRequest): Promise<OrderResult> {
    return this.notImplemented("openPosition");
  }

  modifyPosition(_providerAccountId: string, _request: ModifyPositionRequest): Promise<OrderResult> {
    return this.notImplemented("modifyPosition");
  }

  closePosition(_providerAccountId: string, _request: ClosePositionRequest): Promise<OrderResult> {
    return this.notImplemented("closePosition");
  }

  private notImplemented(method: string): never {
    throw new AppError(
      ErrorCode.PROVIDER_ERROR,
      `MetaApiProvider.${method} is not implemented. See docs/trading-provider.md before writing it — ` +
        `guessing a request shape against a live account sends the wrong order rather than failing.`,
    );
  }
}
