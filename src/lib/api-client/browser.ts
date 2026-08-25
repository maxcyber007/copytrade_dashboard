import { publicApiBaseUrl } from "@/lib/runtime-config";

/**
 * How client components reach the API.
 *
 * `NEXT_PUBLIC_API_BASE_URL` is empty on a single-host deployment, so paths
 * stay relative and nothing changes. When the frontend is deployed separately
 * it holds the API's origin, and every call becomes an absolute cross-origin
 * request that carries the session cookie.
 */

/** Absolute URL for an API path, or the path itself when the API is same-origin. */
export function apiUrl(path: string): string {
  return `${publicApiBaseUrl()}${path}`;
}

/**
 * `fetch` against the API.
 *
 * `credentials: "include"` is the part that matters: a cross-origin `fetch`
 * sends no cookies by default, so without it every call would arrive
 * unauthenticated the moment the frontend moved to its own domain.
 */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(apiUrl(path), {
    ...init,
    credentials: "include",
  });
}
