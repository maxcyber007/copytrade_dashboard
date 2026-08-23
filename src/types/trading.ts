import type { OrderType, Platform, PositionMode } from "@prisma/client";

export type { OrderType, Platform, PositionMode };

/** Credentials handed to a provider. They are decrypted in memory only. */
export type ConnectAccountInput = {
  accountId: string;
  platform: Platform;
  login: string;
  server: string;
  broker: string;
  password: string;
};

export type ConnectionResult = {
  providerAccountId: string;
  platform: Platform;
  /** MT4 is always hedging; MT5 reports the broker's configuration. */
  positionMode: PositionMode;
  currency: string;
  balance: number;
  /** Broker volume constraints — the copy engine clamps every lot to these. */
  minLot: number;
  maxLot: number;
  lotStep: number;
};

export type AccountInfo = {
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  currency: string;
  positionMode: PositionMode;
};

export type ProviderPosition = {
  ticket: string;
  symbol: string;
  orderType: OrderType;
  volume: number;
  openPrice: number;
  currentPrice: number;
  sl?: number;
  tp?: number;
  profit: number;
  openedAt: Date;
  /** Free-text comment used to carry the copy correlation id where supported. */
  comment?: string;
};

export type OpenPositionRequest = {
  symbol: string;
  orderType: OrderType;
  volume: number;
  sl?: number;
  tp?: number;
  slippagePoints?: number;
  /** Correlation id (the copy trade id) so a retry can recognise its own order. */
  clientId: string;
};

export type ModifyPositionRequest = { ticket: string; sl?: number; tp?: number };

export type ClosePositionRequest = { ticket: string; volume?: number };

/**
 * Result of an order request. `HTTP 200` is not success: a copy counts as filled
 * only when `executed` is true and the broker returned a ticket.
 */
export type OrderResult = {
  executed: boolean;
  ticket?: string;
  /** MT4 partial close returns a new ticket for the remaining volume. */
  remainderTicket?: string;
  price?: number;
  volume?: number;
  errorCode?: string;
  errorMessage?: string;
  raw: unknown;
};

/** Why a position stopped existing at the broker. */
export type CloseReason = "STOP_LOSS" | "TAKE_PROFIT" | "COPIED_CLOSE" | "MANUAL" | "OTHER";

/**
 * What the broker recorded once a position was closed.
 *
 * A trade event says what the master did; it says nothing about what the
 * member's own position was worth when it ended. Only the broker knows the fill
 * price and the realised profit, and a stop loss or take profit closes a
 * position with no event at all — so this is read back from the broker rather
 * than inferred from prices we happen to have.
 */
export type ClosedPositionResult = {
  ticket: string;
  closePrice?: number;
  /** Realised profit, including commission and swap. */
  profit: number;
  volume?: number;
  closedAt?: Date;
  reason?: CloseReason;
};

/**
 * One trade as the broker recorded it, reconstructed from its deals.
 *
 * This is the account's own history — every position it held, including trades
 * the member placed by hand and trades from before the account was connected.
 * It is read live from the broker, because the platform only ever stored the
 * positions it copied itself.
 */
export type AccountTrade = {
  ticket: string;
  symbol: string;
  orderType: OrderType;
  volume: number;
  openPrice?: number;
  closePrice?: number;
  /** Realised profit, including commission and swap. */
  profit: number;
  commission?: number;
  swap?: number;
  openedAt?: Date;
  closedAt: Date;
  reason?: CloseReason;
};

export type SymbolSpec = {
  symbol: string;
  minLot: number;
  maxLot: number;
  lotStep: number;
  digits: number;
  tradeAllowed: boolean;
};
