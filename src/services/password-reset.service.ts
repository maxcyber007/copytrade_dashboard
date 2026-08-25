import { prisma } from "@/lib/prisma";
import { getEnv, publicAppUrl } from "@/lib/env";
import { randomToken, sha256 } from "@/lib/crypto";
import { hashPassword } from "@/lib/auth/password";
import { AppError, ErrorCode } from "@/lib/errors";
import { logErrorEvent, logEvent } from "@/lib/logger";
import { getEmailProvider } from "@/providers/email/factory";
import { AuditAction, recordAudit } from "./audit.service";
import type { RequestMeta } from "./auth.service";
import { BRAND } from "@/lib/brand";

/**
 * Starts a password reset.
 *
 * Always succeeds from the caller's point of view, whether or not the address
 * belongs to an account: telling a stranger which emails are registered is a
 * user-enumeration oracle, and the reset form is unauthenticated.
 */
export async function requestPasswordReset(email: string, meta: RequestMeta): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, status: true } });

  if (!user || user.status !== "ACTIVE") {
    logEvent({ event: "PASSWORD_RESET_REQUESTED_UNKNOWN", ...meta });
    return;
  }

  // Any earlier link stops working, so a forwarded or leaked one cannot be used
  // after the member asks again.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = randomToken(32);
  const ttlMinutes = getEnv().PASSWORD_RESET_TTL_MINUTES;

  await prisma.passwordResetToken.create({
    data: {
      // Only the hash is stored: a database dump cannot reset anyone's password.
      tokenHash: sha256(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
      ipAddress: meta.ipAddress,
    },
  });

  const link = `${publicAppUrl()}/reset-password?token=${token}`;

  // Delivery failure must not change what the caller sees. Returning an error
  // only for addresses that exist would tell a stranger which emails are
  // registered — the exact oracle this endpoint is written to avoid.
  try {
    await getEmailProvider().send({
      to: user.email,
      subject: `Reset your ${BRAND.name} password`,
      text: [
        "Someone asked to reset the password for this account.",
        "",
        `Open this link within ${ttlMinutes} minutes to choose a new one:`,
        link,
        "",
        "If it wasn't you, ignore this message — your password has not changed,",
        "and the link can only be used once.",
        "",
        `— ${BRAND.name}`,
      ].join("\n"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    logErrorEvent({ event: "PASSWORD_RESET_EMAIL_FAILED", userId: user.id, reason: message });

    // Silence towards the caller must not mean silence towards the operator:
    // a broken mail configuration locks every member out of recovery.
    await prisma.systemError
      .create({
        data: {
          code: "EMAIL_SEND_FAILED",
          severity: "CRITICAL",
          source: "api",
          message: `Password reset email could not be sent: ${message}`,
        },
      })
      .catch(() => undefined);
  }

  await recordAudit({
    action: AuditAction.PASSWORD_RESET_REQUESTED,
    userId: user.id,
    resourceType: "User",
    resourceId: user.id,
    ...meta,
  });

  logEvent({ event: "PASSWORD_RESET_REQUESTED", userId: user.id });
}

/** Whether a link is still usable, so the page can say so before asking for a password. */
export async function isResetTokenValid(token: string): Promise<boolean> {
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  return Boolean(record && !record.usedAt && record.expiresAt > new Date());
}

/**
 * Completes a reset: sets the new password, consumes the token, and revokes
 * every session — if the account was taken over, the attacker's session dies
 * with the password that let them in.
 */
export async function completePasswordReset(
  token: string,
  newPassword: string,
  meta: RequestMeta,
): Promise<void> {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: { id: true, status: true } } },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "This reset link is no longer valid. Request a new one.");
  }

  if (record.user.status !== "ACTIVE") {
    throw new AppError(ErrorCode.FORBIDDEN, "This account is not active");
  }

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
    }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.session.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await recordAudit({
    action: AuditAction.PASSWORD_RESET_COMPLETED,
    userId: record.userId,
    resourceType: "User",
    resourceId: record.userId,
    ...meta,
  });

  logEvent({ event: "PASSWORD_RESET_COMPLETED", userId: record.userId });
}
