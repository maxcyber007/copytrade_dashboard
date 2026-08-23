import { NextResponse, type NextRequest } from "next/server";

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

/** Endpoints called by machines, which legitimately have no browser origin. */
const MACHINE_ENDPOINTS = ["/api/master/events"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // --- CSRF: a state-changing request must come from this origin ------------
  //
  // Session cookies are SameSite=Lax, which already blocks cross-site form
  // posts. This is the second line: it rejects anything whose Origin does not
  // match the host, so a cross-origin fetch cannot ride a member's session.
  if (MUTATING_METHODS.has(req.method) && !MACHINE_ENDPOINTS.some((path) => pathname.startsWith(path))) {
    const origin = req.headers.get("origin");
    if (origin) {
      const expected = `${req.nextUrl.protocol}//${req.headers.get("host")}`;
      if (origin !== expected) {
        return NextResponse.json(
          { ok: false, error: { code: "FORBIDDEN", message: "Cross-origin request rejected." } },
          { status: 403 },
        );
      }
    }
  }

  /**
   * Edge-level gate: only checks that a session cookie exists so unauthenticated
   * users are redirected early. Real authentication and RBAC always happen again
   * server-side (session lookup in the database) — never trust this alone.
   */
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!isProtected) return NextResponse.next();

  if (!req.cookies.get(SESSION_COOKIE)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
