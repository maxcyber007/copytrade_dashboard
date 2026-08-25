/**
 * Deployment topology.
 *
 * The frontend (landing page and dashboard) and the backend (API, worker,
 * database, queues) can run as one process or as two separate deployments.
 * This module is the single description of which arrangement is in effect.
 *
 * It reads `process.env` directly and never throws. That is deliberate: it is
 * imported by `middleware.ts`, which runs on the Edge runtime where the
 * validated backend schema in `@/lib/env` cannot load, and it must also work on
 * a frontend host that has none of the database or provider secrets.
 */

export type AppRole = "all" | "api" | "frontend";

/**
 * `all`      — one process serves pages and API. The default, and what a
 *              single-host deployment keeps doing with no configuration.
 * `api`      — backend only: API routes, worker, database, queues.
 * `frontend` — pages only. Holds no secrets and never opens a database
 *              connection; every read goes over HTTP to the API.
 */
export function appRole(): AppRole {
  const raw = process.env.APP_ROLE;
  return raw === "api" || raw === "frontend" ? raw : "all";
}

export const isFrontendRole = () => appRole() === "frontend";
export const servesApi = () => appRole() !== "frontend";
export const servesPages = () => appRole() !== "api";

const stripTrailingSlash = (url: string) => url.replace(/\/+$/, "");

/**
 * Where server-rendered pages reach the API.
 *
 * Defaults to this deployment's own origin, so a single-host install calls
 * itself over loopback and behaves exactly as it did before the split.
 */
export function apiBaseUrl(): string {
  const explicit = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL;
  if (explicit) return stripTrailingSlash(explicit);
  return stripTrailingSlash(process.env.APP_URL ?? "http://localhost:3000");
}

/**
 * Where the *browser* reaches the API.
 *
 * Must be inlined at build time to exist in client code, so it is read from the
 * literal `process.env.NEXT_PUBLIC_API_BASE_URL` rather than a computed key —
 * Next.js only substitutes the literal form. An empty string means "same
 * origin", which is what a single-host deployment wants.
 */
export function publicApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL;
  return raw ? stripTrailingSlash(raw) : "";
}

/**
 * Browser origins permitted to call this API with credentials.
 *
 * Comma-separated and matched exactly. There is no wildcard: a credentialed
 * cross-origin request must name its origin, and `*` is not valid with
 * `Access-Control-Allow-Credentials` in any case.
 */
export function allowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return allowedOrigins().includes(origin.replace(/\/+$/, ""));
}

/**
 * Backend to proxy `/api/*` to, when the frontend fronts the API itself.
 *
 * Set this and the browser only ever talks to the frontend's own origin: the
 * request is same-origin, so there is no CORS exchange and the session is a
 * first-party cookie. That last part is what makes it worth doing — a cookie
 * set by a different site is a third-party cookie, which Safari blocks
 * outright and Firefox partitions, and sign-in would simply not work there.
 *
 * Unnecessary once the frontend and the API are subdomains of one domain,
 * because then they are already same-site.
 */
export function apiProxyTarget(): string {
  const raw = process.env.API_PROXY_TARGET;
  return raw ? stripTrailingSlash(raw) : "";
}

/** Hostname that serves the marketing site, when it is split from the app. */
export const landingHost = () => process.env.NEXT_PUBLIC_LANDING_HOST ?? "";

/** Hostname that serves the signed-in dashboard, when it is split off. */
export const dashboardHost = () => process.env.NEXT_PUBLIC_DASHBOARD_HOST ?? "";
