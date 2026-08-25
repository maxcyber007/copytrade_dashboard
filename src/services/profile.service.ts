import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { sha256 } from "@/lib/crypto";
import { AppError, ErrorCode } from "@/lib/errors";
import { logEvent } from "@/lib/logger";
import { AuditAction, recordAudit } from "@/services/audit.service";
import { sniffImageType, AVATAR_MAX_BYTES, type AvatarType } from "@/lib/validation/profile";

type RequestMeta = { ipAddress?: string; userAgent?: string };

export type ProfileView = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: Date;
  lastLoginAt: Date | null;
  /** Null when no avatar is set; doubles as the cache-busting version. */
  avatarUpdatedAt: Date | null;
};

export async function getProfile(userId: string): Promise<ProfileView> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      lastLoginAt: true,
      avatarUpdatedAt: true,
    },
  });
  if (!user) throw new AppError(ErrorCode.NOT_FOUND);
  return user;
}

export async function updateProfile(
  userId: string,
  input: { name: string },
  meta: RequestMeta = {},
): Promise<ProfileView> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: { name: input.name },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      lastLoginAt: true,
      avatarUpdatedAt: true,
    },
  });

  await recordAudit({
    action: AuditAction.PROFILE_UPDATED,
    userId,
    resourceType: "User",
    resourceId: userId,
    ...meta,
  });

  return user;
}

/**
 * Changes the password after re-checking the current one.
 *
 * Every other session is revoked, because a password change is how someone
 * locks out a device they no longer control. The session making the change is
 * deliberately kept, so the member is not signed out of the page they are on.
 */
export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
  currentSessionToken: string | undefined,
  meta: RequestMeta = {},
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) throw new AppError(ErrorCode.NOT_FOUND);

  const valid = await verifyPassword(user.passwordHash, input.currentPassword);
  if (!valid) {
    throw new AppError(ErrorCode.INVALID_CREDENTIALS, "The current password is not correct");
  }

  if (await verifyPassword(user.passwordHash, input.newPassword)) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "The new password must be different from the current one");
  }

  const passwordHash = await hashPassword(input.newPassword);
  const keepTokenHash = currentSessionToken ? sha256(currentSessionToken) : null;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
    }),
    prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(keepTokenHash ? { tokenHash: { not: keepTokenHash } } : {}),
      },
      data: { revokedAt: new Date() },
    }),
  ]);

  await recordAudit({
    action: AuditAction.PASSWORD_CHANGED,
    userId,
    resourceType: "User",
    resourceId: userId,
    ...meta,
  });

  logEvent({ event: "PASSWORD_CHANGED", userId });
}

export async function setAvatar(
  userId: string,
  bytes: Uint8Array,
  meta: RequestMeta = {},
): Promise<{ contentType: AvatarType; updatedAt: Date }> {
  if (bytes.byteLength === 0) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "The image file is empty");
  }
  if (bytes.byteLength > AVATAR_MAX_BYTES) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `The image must be ${Math.floor(AVATAR_MAX_BYTES / 1024)} KB or smaller`,
    );
  }

  // The declared content type is not trusted: these bytes are served back from
  // our own origin, so the format is confirmed from the file itself.
  const contentType = sniffImageType(bytes);
  if (!contentType) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "Only PNG, JPEG or WebP images are accepted");
  }

  const data = Buffer.from(bytes);
  const updatedAt = new Date();

  await prisma.$transaction([
    prisma.userAvatar.upsert({
      where: { userId },
      create: { userId, data, contentType },
      update: { data, contentType },
    }),
    prisma.user.update({ where: { id: userId }, data: { avatarUpdatedAt: updatedAt } }),
  ]);

  await recordAudit({
    action: AuditAction.AVATAR_UPDATED,
    userId,
    resourceType: "User",
    resourceId: userId,
    ...meta,
  });

  return { contentType, updatedAt };
}

export async function removeAvatar(userId: string, meta: RequestMeta = {}): Promise<void> {
  await prisma.$transaction([
    prisma.userAvatar.deleteMany({ where: { userId } }),
    prisma.user.update({ where: { id: userId }, data: { avatarUpdatedAt: null } }),
  ]);

  await recordAudit({
    action: AuditAction.AVATAR_UPDATED,
    userId,
    resourceType: "User",
    resourceId: userId,
    ...meta,
  });
}

export async function readAvatar(
  userId: string,
): Promise<{ data: Buffer; contentType: string; updatedAt: Date } | null> {
  const avatar = await prisma.userAvatar.findUnique({ where: { userId } });
  if (!avatar) return null;
  return { data: Buffer.from(avatar.data), contentType: avatar.contentType, updatedAt: avatar.updatedAt };
}
