/** Machine readable error codes shared by API, engine and providers. */
export const ErrorCode = {
  // auth / access
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  RATE_LIMITED: "RATE_LIMITED",
  // request
  VALIDATION_ERROR: "VALIDATION_ERROR",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  INVALID_SIGNATURE: "INVALID_SIGNATURE",
  STALE_REQUEST: "STALE_REQUEST",
  DUPLICATE_EVENT: "DUPLICATE_EVENT",
  // trading / provider
  PLATFORM_CONNECTION_ERROR: "PLATFORM_CONNECTION_ERROR",
  PLATFORM_NOT_SUPPORTED: "PLATFORM_NOT_SUPPORTED",
  INVALID_SYMBOL: "INVALID_SYMBOL",
  INSUFFICIENT_MARGIN: "INSUFFICIENT_MARGIN",
  MARKET_CLOSED: "MARKET_CLOSED",
  INVALID_VOLUME: "INVALID_VOLUME",
  INVALID_STOPS: "INVALID_STOPS",
  TIMEOUT: "TIMEOUT",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  POSITION_NOT_FOUND: "POSITION_NOT_FOUND",
  RISK_LIMIT_REACHED: "RISK_LIMIT_REACHED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Member-facing messages. Technical detail stays in `message`/logs (admin only). */
const FRIENDLY: Record<string, string> = {
  UNAUTHORIZED: "Please sign in to continue.",
  FORBIDDEN: "You do not have access to this resource.",
  INVALID_CREDENTIALS: "Email or password is incorrect.",
  ACCOUNT_LOCKED: "Too many failed attempts. Try again later.",
  RATE_LIMITED: "Too many requests. Please slow down.",
  VALIDATION_ERROR: "Some of the submitted values are invalid.",
  NOT_FOUND: "The requested item was not found.",
  CONFLICT: "This item already exists.",
  INVALID_SIGNATURE: "Request signature verification failed.",
  STALE_REQUEST: "Request timestamp is outside the accepted window.",
  DUPLICATE_EVENT: "This event was already processed.",
  PLATFORM_CONNECTION_ERROR: "Could not reach your trading account. Check the connection.",
  PLATFORM_NOT_SUPPORTED: "This strategy cannot be copied to this platform.",
  INVALID_SYMBOL: "This symbol is not available on your broker.",
  INSUFFICIENT_MARGIN: "Not enough free margin to open this position.",
  MARKET_CLOSED: "The market is closed for this symbol.",
  INVALID_VOLUME: "The calculated lot size is not allowed by your broker.",
  INVALID_STOPS: "Stop loss or take profit is too close to the current price.",
  TIMEOUT: "The broker did not respond in time.",
  PROVIDER_ERROR: "The trading provider reported an error.",
  POSITION_NOT_FOUND: "The related position could not be found.",
  RISK_LIMIT_REACHED: "A risk limit stopped this trade from being copied.",
  INTERNAL_ERROR: "Something went wrong. Please try again.",
};

export class AppError extends Error {
  readonly code: ErrorCodeValue;
  readonly httpStatus: number;
  readonly details?: unknown;
  readonly retryable: boolean;

  constructor(
    code: ErrorCodeValue,
    message?: string,
    opts: { httpStatus?: number; details?: unknown; retryable?: boolean } = {},
  ) {
    super(message ?? code);
    this.name = "AppError";
    this.code = code;
    this.httpStatus = opts.httpStatus ?? defaultStatus(code);
    this.details = opts.details;
    this.retryable = opts.retryable ?? false;
  }

  get friendlyMessage(): string {
    return FRIENDLY[this.code] ?? FRIENDLY.INTERNAL_ERROR!;
  }
}

function defaultStatus(code: ErrorCodeValue): number {
  switch (code) {
    case ErrorCode.UNAUTHORIZED:
    case ErrorCode.INVALID_CREDENTIALS:
    case ErrorCode.INVALID_SIGNATURE:
      return 401;
    case ErrorCode.FORBIDDEN:
      return 403;
    case ErrorCode.NOT_FOUND:
      return 404;
    case ErrorCode.CONFLICT:
    case ErrorCode.DUPLICATE_EVENT:
      return 409;
    case ErrorCode.VALIDATION_ERROR:
    case ErrorCode.STALE_REQUEST:
      return 400;
    case ErrorCode.ACCOUNT_LOCKED:
    case ErrorCode.RATE_LIMITED:
      return 429;
    default:
      return 500;
  }
}

export const friendlyMessageFor = (code: string) => FRIENDLY[code] ?? FRIENDLY.INTERNAL_ERROR!;
