import { userRepository } from "@/repositories/user.repository";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, type SessionUser } from "@/lib/auth/session";
import { AppError, ErrorCode } from "@/lib/errors";
import { AuditAction, recordAudit } from "./audit.service";
import type { LoginInput, RegisterInput } from "@/lib/validation/auth";

const MAX_FAILED_ATTEMPTS = 8;
const LOCK_DURATION_MS = 15 * 60 * 1000;

export type RequestMeta = { ipAddress?: string; userAgent?: string };

export async function registerUser(input: RegisterInput, meta: RequestMeta) {
  const existing = await userRepository.findByEmail(input.email);
  if (existing) {
    // Do not reveal which emails exist — generic conflict only.
    throw new AppError(ErrorCode.CONFLICT, "Email already registered");
  }

  // The very first account bootstraps the platform administrator.
  const isFirstUser = (await userRepository.countAll()) === 0;

  const user = await userRepository.create({
    email: input.email,
    name: input.name,
    passwordHash: await hashPassword(input.password),
    role: isFirstUser ? "ADMIN" : "MEMBER",
  });

  await recordAudit({
    action: AuditAction.USER_REGISTERED,
    userId: user.id,
    resourceType: "User",
    resourceId: user.id,
    ...meta,
  });

  return toSessionUser(user);
}

export async function authenticate(input: LoginInput, meta: RequestMeta): Promise<SessionUser> {
  const user = await userRepository.findByEmail(input.email);

  if (!user) {
    // Constant-ish work regardless of user existence to limit enumeration.
    await verifyPassword("$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$0000000000000000000000000000000000000000000", input.password);
    throw new AppError(ErrorCode.INVALID_CREDENTIALS);
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(ErrorCode.ACCOUNT_LOCKED);
  }

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_DURATION_MS) : null;
    await userRepository.registerFailedLogin(user.id, attempts, lockedUntil);
    await recordAudit({
      action: AuditAction.USER_LOGIN_FAILED,
      userId: user.id,
      resourceType: "User",
      resourceId: user.id,
      metadata: { attempts },
      ...meta,
    });
    throw new AppError(ErrorCode.INVALID_CREDENTIALS);
  }

  if (user.status !== "ACTIVE") throw new AppError(ErrorCode.FORBIDDEN, "Account is not active");

  await userRepository.registerSuccessfulLogin(user.id);
  await recordAudit({
    action: AuditAction.USER_LOGIN,
    userId: user.id,
    resourceType: "User",
    resourceId: user.id,
    ...meta,
  });

  return toSessionUser(user);
}

export async function startSession(userId: string, meta: RequestMeta) {
  return createSession(userId, meta);
}

function toSessionUser(user: { id: string; email: string; name: string | null; role: "ADMIN" | "MEMBER" }): SessionUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
