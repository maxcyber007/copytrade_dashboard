import type { ITradeProvider } from "./ITradeProvider";
import type {
  AccountInfo,
  AccountTrade,
  ClosedPositionResult,
  CloseReason,
  ClosePositionRequest,
  ConnectAccountInput,
  ConnectionResult,
  ModifyPositionRequest,
  OpenPositionRequest,
  OrderType,
  OrderResult,
  Platform,
  ProviderPosition,
  SymbolSpec,
} from "@/types/trading";
import { AppError, ErrorCode } from "@/lib/errors";

/**
 * In-memory broker simulation used for development, demo mode and tests.
 *
 * It deliberately models the platform differences that break naive copy
 * implementations: MT4 is hedging-only and issues a new ticket for the
 * remainder of a partial close, while an MT5 netting account merges same-symbol
 * orders into one net position. Nothing here talks to a real broker, so no real
 * money can move.
 */

type MockPosition = ProviderPosition & { closed: boolean };

/** What the simulated broker remembers about a position that ended. */
type MockClose = {
  ticket: string;
  symbol: string;
  orderType: OrderType;
  openPrice: number;
  closePrice: number;
  profit: number;
  volume: number;
  openedAt: Date;
  closedAt: Date;
  reason: CloseReason;
};

type MockAccount = {
  providerAccountId: string;
  platform: Platform;
  login: string;
  currency: string;
  balance: number;
  netting: boolean;
  positions: Map<string, MockPosition>;
  closes: Map<string, MockClose>;
  nextTicket: number;
};

const SYMBOLS: Record<string, { price: number; digits: number; minLot: number; maxLot: number; lotStep: number }> = {
  XAUUSD: { price: 3345.2, digits: 2, minLot: 0.01, maxLot: 50, lotStep: 0.01 },
  EURUSD: { price: 1.0842, digits: 5, minLot: 0.01, maxLot: 100, lotStep: 0.01 },
  GBPUSD: { price: 1.2673, digits: 5, minLot: 0.01, maxLot: 100, lotStep: 0.01 },
  USDJPY: { price: 152.41, digits: 3, minLot: 0.01, maxLot: 100, lotStep: 0.01 },
  US30: { price: 38940, digits: 1, minLot: 0.01, maxLot: 20, lotStep: 0.01 },
  BTCUSD: { price: 68250, digits: 2, minLot: 0.01, maxLot: 10, lotStep: 0.01 },
};

/** Survives hot reloads in development so connected accounts do not vanish. */
const globalForMock = globalThis as unknown as { mockAccounts?: Map<string, MockAccount> };
const accounts: Map<string, MockAccount> = globalForMock.mockAccounts ?? new Map();
globalForMock.mockAccounts = accounts;

/** Deterministic pseudo-random in [0,1) derived from a string. */
function seeded(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10_000) / 10_000;
}

const round = (value: number, digits: number) => Number(value.toFixed(digits));

export class MockTradingProvider implements ITradeProvider {
  readonly supportedPlatforms = ["MT4", "MT5"] as const;

  async connectAccount(input: ConnectAccountInput): Promise<ConnectionResult> {
    if (!input.password) {
      throw new AppError(ErrorCode.PLATFORM_CONNECTION_ERROR, "Password is required to connect");
    }
    // A login the simulation rejects on purpose, so the failure path is testable.
    if (input.login.endsWith("0000")) {
      throw new AppError(ErrorCode.PLATFORM_CONNECTION_ERROR, "Mock broker rejected the credentials");
    }

    const providerAccountId = `mock-${input.platform.toLowerCase()}-${input.login}`;
    // MT4 is always hedging; MT5 netting is derived from the login so the same
    // account always comes back with the same mode.
    const netting = input.platform === "MT5" && seeded(input.login) > 0.7;
    const balance = 5_000 + Math.floor(seeded(`${input.login}-balance`) * 15_000);

    const existing = accounts.get(providerAccountId);
    accounts.set(providerAccountId, {
      providerAccountId,
      platform: input.platform,
      login: input.login,
      currency: "USD",
      balance: existing?.balance ?? balance,
      netting,
      positions: existing?.positions ?? new Map(),
      closes: existing?.closes ?? new Map(),
      nextTicket: existing?.nextTicket ?? 100_000 + Math.floor(seeded(input.login) * 800_000),
    });

    // A broker's minimum equals its step: one that trades in 0.1 increments
    // cannot fill 0.05, so reporting 0.01 here would be fiction.
    const lotStep = input.platform === "MT4" ? 0.1 : 0.01;

    return {
      providerAccountId,
      platform: input.platform,
      positionMode: netting ? "NETTING" : "HEDGING",
      currency: "USD",
      balance,
      minLot: lotStep,
      maxLot: input.platform === "MT4" ? 50 : 100,
      lotStep,
    };
  }

  async disconnectAccount(providerAccountId: string): Promise<void> {
    // Positions are kept: disconnecting is not the same as closing trades.
    accounts.get(providerAccountId);
  }

  async getAccountInfo(providerAccountId: string): Promise<AccountInfo> {
    const account = this.require(providerAccountId);
    const open = [...account.positions.values()].filter((p) => !p.closed);
    const floating = open.reduce((sum, position) => sum + this.profitOf(position), 0);
    const margin = open.reduce((sum, position) => sum + position.volume * 1000, 0);
    const equity = account.balance + floating;

    return {
      balance: round(account.balance, 2),
      equity: round(equity, 2),
      margin: round(margin, 2),
      freeMargin: round(equity - margin, 2),
      currency: account.currency,
      positionMode: account.netting ? "NETTING" : "HEDGING",
    };
  }

  async getPositions(providerAccountId: string): Promise<ProviderPosition[]> {
    const account = this.require(providerAccountId);
    return [...account.positions.values()]
      .filter((position) => !position.closed)
      .map((position) => ({
        ...position,
        currentPrice: this.currentPrice(position.symbol),
        profit: round(this.profitOf(position), 2),
      }));
  }

  async getSymbolSpec(providerAccountId: string, symbol: string): Promise<SymbolSpec | null> {
    const account = this.require(providerAccountId);
    const spec = SYMBOLS[symbol.toUpperCase()];
    if (!spec) return null;

    // MT4 brokers in this simulation trade in coarser steps than MT5 ones, and
    // the minimum tracks the step.
    const lotStep = account.platform === "MT4" ? Math.max(spec.lotStep, 0.1) : spec.lotStep;

    return {
      symbol: symbol.toUpperCase(),
      minLot: Math.max(spec.minLot, lotStep),
      maxLot: spec.maxLot,
      lotStep,
      digits: spec.digits,
      tradeAllowed: true,
    };
  }

  async openPosition(providerAccountId: string, request: OpenPositionRequest): Promise<OrderResult> {
    const account = this.require(providerAccountId);
    const spec = SYMBOLS[request.symbol.toUpperCase()];

    if (!spec) {
      return this.failure(ErrorCode.INVALID_SYMBOL, `Unknown symbol ${request.symbol}`, request);
    }
    if (request.volume < spec.minLot || request.volume > spec.maxLot) {
      return this.failure(ErrorCode.INVALID_VOLUME, `Volume ${request.volume} outside broker limits`, request);
    }

    const price = this.currentPrice(request.symbol);

    // On a netting account a same-symbol order merges into the open position
    // instead of creating a second ticket.
    if (account.netting) {
      const existing = [...account.positions.values()].find(
        (position) => !position.closed && position.symbol === request.symbol.toUpperCase(),
      );
      if (existing && existing.orderType === request.orderType) {
        const totalVolume = round(existing.volume + request.volume, 2);
        existing.openPrice = round(
          (existing.openPrice * existing.volume + price * request.volume) / totalVolume,
          spec.digits,
        );
        existing.volume = totalVolume;
        return { executed: true, ticket: existing.ticket, price, volume: request.volume, raw: { merged: true } };
      }
    }

    const ticket = String(account.nextTicket);
    account.nextTicket += 1;
    account.positions.set(ticket, {
      ticket,
      symbol: request.symbol.toUpperCase(),
      orderType: request.orderType,
      volume: request.volume,
      openPrice: price,
      currentPrice: price,
      sl: request.sl,
      tp: request.tp,
      profit: 0,
      openedAt: new Date(),
      comment: request.clientId,
      closed: false,
    });

    return { executed: true, ticket, price, volume: request.volume, raw: { simulated: true } };
  }

  async modifyPosition(providerAccountId: string, request: ModifyPositionRequest): Promise<OrderResult> {
    const account = this.require(providerAccountId);
    const position = account.positions.get(request.ticket);
    if (!position || position.closed) {
      return this.failure(ErrorCode.POSITION_NOT_FOUND, `Ticket ${request.ticket} not found`, request);
    }

    position.sl = request.sl ?? position.sl;
    position.tp = request.tp ?? position.tp;
    return { executed: true, ticket: position.ticket, raw: { modified: true } };
  }

  async closePosition(providerAccountId: string, request: ClosePositionRequest): Promise<OrderResult> {
    const account = this.require(providerAccountId);
    const position = account.positions.get(request.ticket);
    if (!position || position.closed) {
      return this.failure(ErrorCode.POSITION_NOT_FOUND, `Ticket ${request.ticket} not found`, request);
    }

    const closingVolume = request.volume ?? position.volume;
    const profit = round(this.profitOf(position) * (closingVolume / position.volume), 2);
    account.balance = round(account.balance + profit, 2);

    // The broker is the only place a realised price and profit exist, so the
    // simulation records them the way a real one would.
    account.closes.set(position.ticket, {
      ticket: position.ticket,
      symbol: position.symbol,
      orderType: position.orderType,
      openPrice: position.openPrice,
      closePrice: position.currentPrice,
      profit,
      volume: closingVolume,
      openedAt: position.openedAt,
      closedAt: new Date(),
      reason: "COPIED_CLOSE",
    });

    if (closingVolume >= position.volume) {
      position.closed = true;
      return { executed: true, ticket: position.ticket, volume: closingVolume, raw: { fullClose: true } };
    }

    const remainder = round(position.volume - closingVolume, 2);

    // MT4 closes the original ticket and opens a new one for the remainder;
    // MT5 keeps the same ticket and only reduces its volume.
    if (account.platform === "MT4") {
      position.closed = true;
      const newTicket = String(account.nextTicket);
      account.nextTicket += 1;
      account.positions.set(newTicket, { ...position, ticket: newTicket, volume: remainder, closed: false });
      return {
        executed: true,
        ticket: position.ticket,
        remainderTicket: newTicket,
        volume: closingVolume,
        raw: { partialClose: true, platform: "MT4" },
      };
    }

    position.volume = remainder;
    return {
      executed: true,
      ticket: position.ticket,
      volume: closingVolume,
      raw: { partialClose: true, platform: "MT5" },
    };
  }

  async getClosedPosition(providerAccountId: string, ticket: string): Promise<ClosedPositionResult | null> {
    const account = this.require(providerAccountId);
    return account.closes.get(ticket) ?? null;
  }

  async getTradeHistory(
    providerAccountId: string,
    range: { from: Date; to: Date; limit?: number },
  ): Promise<AccountTrade[]> {
    const account = this.require(providerAccountId);

    return [...account.closes.values()]
      .filter((close) => close.closedAt >= range.from && close.closedAt <= range.to)
      .sort((a, b) => b.closedAt.getTime() - a.closedAt.getTime())
      .slice(0, range.limit ?? 500)
      .map((close) => ({
        ticket: close.ticket,
        symbol: close.symbol,
        orderType: close.orderType,
        volume: close.volume,
        openPrice: close.openPrice,
        closePrice: close.closePrice,
        profit: close.profit,
        openedAt: close.openedAt,
        closedAt: close.closedAt,
        reason: close.reason,
      }));
  }

  // -- helpers ---------------------------------------------------------------

  private require(providerAccountId: string): MockAccount {
    const account = accounts.get(providerAccountId);
    if (!account) {
      throw new AppError(ErrorCode.PLATFORM_CONNECTION_ERROR, `Mock account ${providerAccountId} is not connected`);
    }
    return account;
  }

  /** Price drifts slowly with the clock so dashboards show movement. */
  private currentPrice(symbol: string): number {
    const spec = SYMBOLS[symbol.toUpperCase()];
    if (!spec) return 0;
    const drift = Math.sin(Date.now() / 90_000 + seeded(symbol) * 10) * spec.price * 0.0012;
    return round(spec.price + drift, spec.digits);
  }

  private profitOf(position: MockPosition): number {
    const current = this.currentPrice(position.symbol);
    const direction = position.orderType.startsWith("BUY") ? 1 : -1;
    const contractSize = position.symbol === "XAUUSD" ? 100 : position.symbol.includes("USD") ? 100_000 : 1;
    return ((current - position.openPrice) * direction * position.volume * contractSize) / 1000;
  }

  private failure(code: string, message: string, request: unknown): OrderResult {
    return { executed: false, errorCode: code, errorMessage: message, raw: { request } };
  }
}
