import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "ct_session";

const PROTECTED_PREFIXES = ["/dashboard", "/account", "/strategies", "/copy", "/history", "/performance", "/settings", "/provider", "/admin"];

/**
 * Edge-level gate: only checks that a session cookie exists so unauthenticated
 * users are redirected early. Real authentication and RBAC always happen again
 * server-side (session lookup in the database) — never trust this alone.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
