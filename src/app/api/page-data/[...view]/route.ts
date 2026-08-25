import { handler, ok } from "@/lib/api";
import { AppError, ErrorCode } from "@/lib/errors";
import { getCurrentUser } from "@/lib/auth/session";
import { isPageView, pageLoaders } from "@/server/page-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The read side of every page.
 *
 * One endpoint rather than twenty route files: the views differ only in which
 * loader runs, and keeping the access check in a single place means a new view
 * cannot be added that forgets to make one.
 *
 * A catch-all segment because admin views are named with a slash
 * (`admin/members`), which a single dynamic segment would not match.
 */
export const GET = handler(async (request: Request, context: { params: Promise<{ view: string[] }> }) => {
  const { view: segments } = await context.params;
  const view = segments.join("/");

  if (!isPageView(view)) throw new AppError(ErrorCode.NOT_FOUND);

  const loader = pageLoaders[view];
  const user = await getCurrentUser();

  // Authorisation happens here, not in the loaders, so that every view is
  // covered by the same check. `member` loaders receive a guaranteed user.
  if (loader.access !== "public" && !user) throw new AppError(ErrorCode.UNAUTHORIZED);
  if (loader.access === "admin" && user?.role !== "ADMIN") throw new AppError(ErrorCode.FORBIDDEN);

  const params = new URL(request.url).searchParams;
  return ok(await loader.load({ user, params }));
});
