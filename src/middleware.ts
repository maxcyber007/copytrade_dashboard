import { NextResponse, type NextRequest } from "next/server";
import {
  apiProxyTarget,
  dashboardHost,
  isAllowedOrigin,
  landingHost,
  servesApi,
  servesPages,
} from "@/lib/runtime-config";

const SESSION_COOKIE = "ct_session";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/account",
  "/strategies",
  "/copy",
  "/history",
  "/performance",
  "/billing",
  "/settings",
  "/provider",
  "/admin",
];

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Paths that belong to the signed-in app rather than the marketing site. */
const APP_PREFIXES = [
  ...PROTECTED_PREFIXES,
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/notifications",
  "/profile",
];

/**
 * Keeps each domain to its own half of the app.
 *
 * The marketing site and the dashboard are one deployment served under two
 * hostnames, so without this both would answer on both — two URLs for every
 * page, which search engines treat as duplicated content and which makes it
 * ambiguous which domain a link should point at. Redirecting rather than
 * rewriting is deliberate: the address bar should agree with the page.
 */
function hostnameRedirect(req: NextRequest): NextResponse | null {
  const landing = landingHost();
  const dashboard = dashboardHost();
  if (!landing || !dashboard) return null;

  const host = req.headers.get("host")?.split(":")[0];
  const { pathname, search } = req.nextUrl;
  const isAppPath = APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (host === landing && isAppPath) {
    return NextResponse.redirect(new URL(`${pathname}${search}`, `https://${dashboard}`));
  }

  // The dashboard domain has no marketing page; its root is the app itself.
  if (host === dashboard && pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", `https://${dashboard}`));
  }

  return null;
}

/** Endpoints called by machines, which legitimately have no browser origin. */
const MACHINE_ENDPOINTS = ["/api/master/events"];

/**
 * Applies CORS to a response leaving the API.
 *
 * Only origins named in `ALLOWED_ORIGINS` are echoed back, and the origin is
 * echoed rather than answered with `*` because these responses carry
 * credentials — a wildcard is not valid there and browsers reject it. `Vary`
 * keeps a shared cache from serving one origin's response to another.
 */
function applyCors(response: NextResponse, origin: string | null): NextResponse {
  response.headers.append("Vary", "Origin");
  if (!origin || !isAllowedOrigin(origin)) return response;

  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  return response;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const origin = req.headers.get("origin");
  const isApiPath = pathname.startsWith("/api/");

  // --- CORS preflight -------------------------------------------------------
  //
  // Answered here rather than in each route: a preflight is an OPTIONS request
  // that never reaches a handler, and it must not require a session.
  if (isApiPath && req.method === "OPTIONS") {
    if (!isAllowedOrigin(origin)) {
      return new NextResponse(null, { status: 403 });
    }
    const response = new NextResponse(null, { status: 204 });
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    response.headers.set(
      "Access-Control-Allow-Headers",
      req.headers.get("access-control-request-headers") ?? "Content-Type",
    );
    response.headers.set("Access-Control-Max-Age", "86400");
    return applyCors(response, origin);
  }

  // --- CSRF: a state-changing request must come from a trusted origin -------
  //
  // Session cookies are SameSite=Lax, which already blocks cross-site form
  // posts. This is the second line: it rejects anything whose Origin is neither
  // this host nor a configured frontend, so an arbitrary site cannot ride a
  // member's session. Splitting the frontend onto its own domain is exactly why
  // the allowlist exists — without it, every request from the dashboard would
  // now look cross-origin and be refused.
  if (MUTATING_METHODS.has(req.method) && !MACHINE_ENDPOINTS.some((path) => pathname.startsWith(path))) {
    if (origin) {
      const expected = `${req.nextUrl.protocol}//${req.headers.get("host")}`;
      if (origin !== expected && !isAllowedOrigin(origin)) {
        return applyCors(
          NextResponse.json(
            { ok: false, error: { code: "FORBIDDEN", message: "Cross-origin request rejected." } },
            { status: 403 },
          ),
          origin,
        );
      }
    }
  }

  if (!isApiPath) {
    const redirected = hostnameRedirect(req);
    if (redirected) return redirected;
  }

  // A backend-only deployment serves the API and nothing else. Without this, a
  // stray request to `api.example.com/dashboard` would render a second copy of
  // the app on the wrong domain, on a host whose CSP and cookies are not set up
  // for it.
  // A frontend that proxies `/api/*` to the backend must let those requests
  // past — the rewrite that forwards them runs after this.
  if (isApiPath && !servesApi() && !apiProxyTarget()) {
    return NextResponse.json(
      { ok: false, error: { code: "NOT_FOUND", message: "This deployment does not serve the API." } },
      { status: 404 },
    );
  }
  if (!isApiPath && !servesPages()) {
    return new NextResponse("Not found", { status: 404 });
  }

  /**
   * Edge-level gate: only checks that a session cookie exists so unauthenticated
   * users are redirected early. Real authentication and RBAC always happen again
   * server-side (session lookup in the database) — never trust this alone.
   */
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!isProtected) return applyCors(NextResponse.next(), isApiPath ? origin : null);

  if (!req.cookies.get(SESSION_COOKIE)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return applyCors(NextResponse.next(), isApiPath ? origin : null);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
