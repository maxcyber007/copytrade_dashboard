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

export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: getEnv().NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Resolves the current user from the session cookie, or null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { id: true, email: true, name: true, role: true, status: true } } },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.user.status !== "ACTIVE") return null;

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
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
