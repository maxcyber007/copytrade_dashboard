import type { ProviderProfile } from "@prisma/client";
import { providerRepository } from "@/repositories/provider.repository";
import { AppError, ErrorCode } from "@/lib/errors";
import { slugify, type ProviderApplicationInput, type ProviderReviewInput } from "@/lib/validation/provider";
import { AuditAction, recordAudit } from "./audit.service";
import type { RequestMeta } from "./auth.service";

/** What the applicant themselves may see, including review feedback. */
export type OwnProviderView = {
  id: string;
  displayName: string;
  slug: string;
  headline: string | null;
  bio: string | null;
  website: string | null;
  country: string | null;
  status: ProviderProfile["status"];
  appliedAt: Date;
  reviewedAt: Date | null;
  /** Member-facing reason only. The internal review note is never included. */
  publicReason: string | null;
  performanceFeePct: number;
  subscriptionPriceMonthly: number;
  totalStrategies: number;
  totalSubscribers: number;
};

function toOwnView(profile: ProviderProfile): OwnProviderView {
  return {
    id: profile.id,
    displayName: profile.displayName,
    slug: profile.slug,
    headline: profile.headline,
    bio: profile.bio,
    website: profile.website,
    country: profile.country,
    status: profile.status,
    appliedAt: profile.appliedAt,
    reviewedAt: profile.reviewedAt,
    publicReason: profile.publicReason,
    performanceFeePct: Number(profile.performanceFeePct),
    subscriptionPriceMonthly: Number(profile.subscriptionPriceMonthly),
    totalStrategies: profile.totalStrategies,
    totalSubscribers: profile.totalSubscribers,
  };
}

export async function getOwnProviderProfile(userId: string): Promise<OwnProviderView | null> {
  const profile = await providerRepository.findByUserId(userId);
  return profile ? toOwnView(profile) : null;
}

/**
 * A member applies to publish signals. Applications always start as PENDING —
 * nothing a member submits can approve their own listing.
 */
export async function applyAsProvider(
  userId: string,
  input: ProviderApplicationInput,
  meta: RequestMeta,
): Promise<OwnProviderView> {
  const existing = await providerRepository.findByUserId(userId);
  if (existing) {
    if (existing.status === "REJECTED") {
      // A rejected applicant may reapply; the review fields are cleared so the
      // old decision cannot linger on the new application.
      const updated = await providerRepository.update(existing.id, {
        ...buildProfileFields(input),
        status: "PENDING",
        appliedAt: new Date(),
        reviewedAt: null,
        reviewedById: null,
        reviewNote: null,
        publicReason: null,
      });
      await recordAudit({
        action: AuditAction.PROVIDER_APPLIED,
        userId,
        resourceType: "ProviderProfile",
        resourceId: updated.id,
        metadata: { reapplied: true },
        ...meta,
      });
      return toOwnView(updated);
    }
    throw new AppError(ErrorCode.CONFLICT, "A provider application already exists for this account");
  }

  const slug = slugify(input.displayName);
  if (!slug) throw new AppError(ErrorCode.VALIDATION_ERROR, "Display name must contain letters or numbers");

  const taken = await providerRepository.displayNameTaken(input.displayName, slug);
  if (taken) throw new AppError(ErrorCode.CONFLICT, "That display name is already taken");

  const profile = await providerRepository.create({
    userId,
    slug,
    status: "PENDING",
    ...buildProfileFields(input),
  });

  await recordAudit({
    action: AuditAction.PROVIDER_APPLIED,
    userId,
    resourceType: "ProviderProfile",
    resourceId: profile.id,
    ...meta,
  });

  return toOwnView(profile);
}

/** Admin decision on an application. Only an admin can reach this. */
export async function reviewProviderApplication(
  providerId: string,
  reviewerId: string,
  input: ProviderReviewInput,
  meta: RequestMeta,
): Promise<OwnProviderView> {
  const profile = await providerRepository.findById(providerId);
  if (!profile) throw new AppError(ErrorCode.NOT_FOUND, "Provider application not found");

  if (input.decision !== "APPROVE" && !input.publicReason) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, "A reason is required when rejecting or suspending");
  }

  const status = input.decision === "APPROVE" ? "APPROVED" : input.decision === "REJECT" ? "REJECTED" : "SUSPENDED";

  const updated = await providerRepository.update(providerId, {
    status,
    reviewedAt: new Date(),
    reviewedById: reviewerId,
    reviewNote: input.reviewNote ?? null,
    publicReason: input.publicReason ?? null,
  });

  await recordAudit({
    action:
      input.decision === "APPROVE"
        ? AuditAction.PROVIDER_APPROVED
        : input.decision === "REJECT"
          ? AuditAction.PROVIDER_REJECTED
          : AuditAction.PROVIDER_SUSPENDED,
    userId: reviewerId,
    resourceType: "ProviderProfile",
    resourceId: providerId,
    metadata: { applicantId: profile.userId, decision: input.decision },
    ...meta,
  });

  return toOwnView(updated);
}

/**
 * Guard used wherever a provider acts on their own strategies. A suspended or
 * pending provider can sign in and see their dashboard, but cannot publish.
 */
export async function requireApprovedProvider(userId: string): Promise<ProviderProfile> {
  const profile = await providerRepository.findByUserId(userId);
  if (!profile) throw new AppError(ErrorCode.FORBIDDEN, "No provider application on file");
  if (profile.status !== "APPROVED") {
    throw new AppError(ErrorCode.FORBIDDEN, `Provider status is ${profile.status}`);
  }
  return profile;
}

function buildProfileFields(input: ProviderApplicationInput) {
  return {
    displayName: input.displayName,
    headline: input.headline,
    bio: input.bio,
    website: input.website || null,
    country: input.country || null,
    yearsTrading: input.yearsTrading ?? null,
    performanceFeePct: input.performanceFeePct,
    subscriptionPriceMonthly: input.subscriptionPriceMonthly,
  };
}
