import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, ErrorCode, friendlyMessageFor } from "./errors";
import { logger } from "./logger";

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = { ok: false; error: { code: string; message: string; details?: unknown } };

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiSuccess<T>>({ ok: true, data }, init);
}

export function created<T>(data: T) {
  return ok(data, { status: 201 });
}

/**
 * Converts any thrown value into a safe API response.
 * Technical details are logged, never returned to members.
 */
export function fail(error: unknown, opts: { exposeDetails?: boolean } = {}) {
  if (error instanceof ZodError) {
    return NextResponse.json<ApiFailure>(
      {
        ok: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: friendlyMessageFor(ErrorCode.VALIDATION_ERROR),
          details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 400 },
    );
  }

  if (error instanceof AppError) {
    if (error.httpStatus >= 500) logger.error({ event: "API_ERROR", code: error.code, message: error.message });

    // Structured details (such as what blocks a deletion) travel with client
    // errors so the UI can list them; server errors never carry internals out.
    const includeDetails = Boolean(error.details) && (opts.exposeDetails || error.httpStatus < 500);

    return NextResponse.json<ApiFailure>(
      {
        ok: false,
        error: {
          code: error.code,
          message: error.friendlyMessage,
          ...(includeDetails ? { details: error.details } : {}),
        },
      },
      { status: error.httpStatus },
    );
  }

  logger.error({ event: "UNHANDLED_ERROR", err: error instanceof Error ? error.message : String(error) });
  return NextResponse.json<ApiFailure>(
    {
      ok: false,
      error: { code: ErrorCode.INTERNAL_ERROR, message: friendlyMessageFor(ErrorCode.INTERNAL_ERROR) },
    },
    { status: 500 },
  );
}

/** Wraps a route handler so no raw stack ever leaks to the client. */
export function handler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (error) {
      return fail(error);
    }
  };
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
