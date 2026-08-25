import "server-only";
import { cookies, headers } from "next/headers";
import { apiBaseUrl } from "@/lib/runtime-config";
import type { ApiFailure, ApiSuccess } from "@/lib/api";

/**
 * How server-rendered pages read data.
 *
 * Pages do not touch the database. They call the API over HTTP, which is what
 * lets the frontend be deployed somewhere that has no database at all. On a
 * single-host install `API_BASE_URL` points back at this same process, so the
 * call is a loopback request and the behaviour is unchanged.
 *
 * The session travels as the member's own cookie, forwarded from the incoming
 * request. The frontend therefore holds no credential of its own and can only
 * ever read what the signed-in member could read — there is no service account
 * here to be stolen or misused.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }

  get isNotFound() {
    return this.status === 404;
  }
}

/**
 * Headers that must survive the hop to the API.
 *
 * The client IP matters: rate limits and the audit log are keyed on it, and
 * without forwarding, every member would look like the frontend host and share
 * one bucket.
 */
async function forwardedHeaders(): Promise<Headers> {
  const [cookieStore, incoming] = await Promise.all([cookies(), headers()]);

  const out = new Headers();
  const cookie = cookieStore.toString();
  if (cookie) out.set("cookie", cookie);

  const forwardedFor = incoming.get("x-forwarded-for");
  const realIp = incoming.get("x-real-ip");
  if (forwardedFor) out.set("x-forwarded-for", forwardedFor);
  else if (realIp) out.set("x-forwarded-for", realIp);

  const userAgent = incoming.get("user-agent");
  if (userAgent) out.set("user-agent", userAgent);

  return out;
}

/** GETs an API route and unwraps the `{ ok, data }` envelope. */
export async function apiGet<T>(path: string): Promise<T> {
  const requestHeaders = await forwardedHeaders();

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      headers: requestHeaders,
      // Member data is per-request and must never be served from a shared cache.
      cache: "no-store",
    });
  } catch (error) {
    throw new ApiError(
      503,
      "API_UNREACHABLE",
      `Could not reach the API at ${apiBaseUrl()}${path}: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }

  const body = (await response.json().catch(() => null)) as ApiSuccess<T> | ApiFailure | null;

  if (!body) {
    throw new ApiError(response.status, "INVALID_RESPONSE", "The API returned a response that was not JSON.");
  }

  if (!body.ok) {
    throw new ApiError(response.status, body.error.code, body.error.message, body.error.details);
  }

  return body.data;
}

/**
 * As `apiGet`, but returns null instead of throwing when the member is not
 * signed in or the record is not theirs.
 *
 * For pages that render something either way — the landing page reads the
 * session to decide between "Sign in" and "Dashboard", and must not break when
 * there is no session.
 */
export async function apiGetOrNull<T>(path: string): Promise<T | null> {
  try {
    return await apiGet<T>(path);
  } catch (error) {
    if (error instanceof ApiError && (error.isUnauthorized || error.isForbidden || error.isNotFound)) {
      return null;
    }
    throw error;
  }
}

/**
 * As `apiGet`, but falls back to a supplied value when the API cannot be
 * reached at all.
 *
 * Only for content that is worth showing degraded rather than not at all — the
 * marketing page's pricing table, for instance. Never for member data, where a
 * silent empty result would misrepresent the account.
 */
export async function apiGetOrFallback<T>(path: string, fallback: T): Promise<T> {
  try {
    return await apiGet<T>(path);
  } catch {
    return fallback;
  }
}
