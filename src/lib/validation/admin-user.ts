import { z } from "zod";

export const adminUserUpdateSchema = z.object({
  name: z.string().trim().max(80).optional().or(z.literal("")),
  role: z.enum(["ADMIN", "MEMBER"]),
  status: z.enum(["ACTIVE", "SUSPENDED", "PENDING_VERIFICATION"]),
  /** Clears a lockout from repeated failed logins. */
  unlock: z.boolean().default(false),
});

export const adminUserDeleteSchema = z.object({
  /**
   * The admin must type the member's email. Deletion cascades to their
   * accounts, subscriptions and copy history, so a mis-click is unrecoverable.
   */
  confirmEmail: z.string().trim().toLowerCase().email(),
});

export type AdminUserUpdateInput = z.infer<typeof adminUserUpdateSchema>;
export type AdminUserDeleteInput = z.infer<typeof adminUserDeleteSchema>;
