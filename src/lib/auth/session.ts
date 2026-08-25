import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { randomToken, sha256 } from "@/lib/crypto";
import { AppError, ErrorCode } from "@/lib/errors";

export const SESSION_COOKIE = "ct_session";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  /**
   * Carried on the session so the app shell can show the member's avatar
   * without a second query — it is only a cache-busting stamp, not the image.
   */
  avatarUpdatedAt: Date | null;
};

/** Issues a new DB-backed session and returns the raw token for the cookie. */
export async function createSession(
  userId: string,
  meta: { ipAddress?: string; userAgent?: string } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + getEnv().SESSION_TTL_SECONDS * 1000);
  await prisma.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      expiresAt,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent?.slice(0, 255),
    },
  });
  return { token, expiresAt };
}

/**
 * Cookie attributes, shared by the set and clear paths.
 *
 * A cookie is only removable by a request whose domain and path match the ones
 * it was issued with, so signing out has to repeat them exactly — otherwise the
 * browser keeps the original and the member stays signed in.
 */
function sessionCookieOptions() {
  const env = getEnv();
  const sameSite = env.SESSION_COOKIE_SAMESITE;

  return {
    httpOnly: true,
    // SameSite=None is only honoured on a Secure cookie, so it forces HTTPS
    // regardless of NODE_ENV; the env schema refuses that combination without
    // an https APP_URL.
    secure: env.NODE_ENV === "production" || sameSite === "none",
    sameSite,
    path: "/",
    /**
     * Set to the registrable domain (`.example.com`) when the dashboard and the
     * API live on different subdomains, so one session covers both. Left unset
     * on a single-host install, which yields a host-only cookie — the tighter
     * of the two, and the right default.
     */
    ...(env.SESSION_COOKIE_DOMAIN ? { domain: env.SESSION_COOKIE_DOMAIN } : {}),
  } as const;
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, { ...sessionCookieOptions(), expires: expiresAt });
}

export async function clearSessionCookie() {
  const store = await cookies();
  const { httpOnly, secure, sameSite, path, ...rest } = sessionCookieOptions();
  store.set(SESSION_COOKIE, "", {
    httpOnly,
    secure,
    sameSite,
    path,
    ...rest,
    // Expiring in the past is what actually removes it; `delete` would not carry
    // the domain, leaving a cookie on the parent domain behind.
    expires: new Date(0),
    maxAge: 0,
  });
}

/** Resolves the current user from the session cookie, or null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: { select: { id: true, email: true, name: true, role: true, status: true, avatarUpdatedAt: true } },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.user.status !== "ACTIVE") return null;

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    avatarUpdatedAt: session.user.avatarUpdatedAt,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AppError(ErrorCode.UNAUTHORIZED);
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new AppError(ErrorCode.FORBIDDEN);
  return user;
}

export async function revokeSessionByToken(token: string) {
  await prisma.session.updateMany({
    where: { tokenHash: sha256(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeCurrentSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await revokeSessionByToken(token);
}
