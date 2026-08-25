import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { apiGet, ApiError } from "./server";

/**
 * The signed-in member, as seen by a page.
 *
 * This is the frontend's counterpart to `@/lib/auth/session`. It answers the
 * same question but over HTTP, so pages can render on a host with no database.
 * The session cookie is still the only credential involved, and the API is
 * still the only thing that validates it — this cannot be tricked into
 * inventing a user, because it never decides anything itself.
 */

/**
 * Declared here rather than imported from `@prisma/client`, so that nothing on
 * a page's import path reaches for the database client.
 */
export type Role = "ADMIN" | "MEMBER";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  /** ISO timestamp; only a cache-busting stamp for the avatar image. */
  avatarUpdatedAt: string | null;
};

/**
 * Wrapped in `cache` so the layout and the page it wraps resolve the session
 * once per render rather than each making their own call to the API.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  try {
    const { user } = await apiGet<{ user: SessionUser | null }>("/api/auth/session");
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.isUnauthorized) return null;
    throw error;
  }
});

/**
 * Requires a session, or sends the visitor to sign in.
 *
 * A page redirects rather than throwing: an expired session is an ordinary
 * thing to happen while someone has a tab open, and it should look like being
 * asked to sign in again, not like an error.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}
