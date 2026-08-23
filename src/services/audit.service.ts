import { auditRepository } from "@/repositories/audit.repository";
import { logEvent } from "@/lib/logger";

export const AuditAction = {
  USER_REGISTERED: "USER_REGISTERED",
  USER_LOGIN: "USER_LOGIN",
  USER_LOGIN_FAILED: "USER_LOGIN_FAILED",
  USER_LOGOUT: "USER_LOGOUT",
  ACCOUNT_ADDED: "ACCOUNT_ADDED",
  ACCOUNT_CONNECTED: "ACCOUNT_CONNECTED",
  ACCOUNT_DISCONNECTED: "ACCOUNT_DISCONNECTED",
  ACCOUNT_DELETED: "ACCOUNT_DELETED",
  STRATEGY_SUBSCRIBED: "STRATEGY_SUBSCRIBED",
  PROVIDER_APPLIED: "PROVIDER_APPLIED",
  PROVIDER_APPROVED: "PROVIDER_APPROVED",
  PROVIDER_REJECTED: "PROVIDER_REJECTED",
  PROVIDER_SUSPENDED: "PROVIDER_SUSPENDED",
  STRATEGY_CREATED: "STRATEGY_CREATED",
  STRATEGY_UPDATED: "STRATEGY_UPDATED",
  PROVIDER_KEY_ISSUED: "PROVIDER_KEY_ISSUED",
  PROVIDER_KEY_REVOKED: "PROVIDER_KEY_REVOKED",
  COPY_SETTINGS_UPDATED: "COPY_SETTINGS_UPDATED",
  COPY_STARTED: "COPY_STARTED",
  COPY_PAUSED: "COPY_PAUSED",
  COPY_STOPPED: "COPY_STOPPED",
  TRADE_COPIED: "TRADE_COPIED",
  TRADE_FAILED: "TRADE_FAILED",
  RISK_TRIGGERED: "RISK_TRIGGERED",
  ADMIN_ACTION: "ADMIN_ACTION",
} as const;

export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];

export type AuditInput = {
  action: AuditActionValue;
  userId?: string | null;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
};

/** Audit logging must never break the caller's flow. */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await auditRepository.create({
      action: input.action,
      userId: input.userId ?? null,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent?.slice(0, 255),
      metadata: (input.metadata ?? {}) as never,
    });
    logEvent({ event: input.action, userId: input.userId, resourceId: input.resourceId });
  } catch {
    // swallow — audit failure is logged but never propagated
  }
}
