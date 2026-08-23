import type { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { logErrorEvent } from "@/lib/logger";
import { getEmailProvider } from "@/providers/email/factory";
import { publishUserEvent } from "@/lib/events";
import { BRAND } from "@/lib/brand";

export type NotifyInput = {
  userId: string;
  type?: NotificationType;
  title: string;
  message: string;
  link?: string;
  /** Also deliver by email — for things a member must know while away. */
  email?: boolean;
};

/**
 * One place that records a notification, pushes it to an open session and
 * optionally emails it. Delivery failures are logged, never propagated: a
 * notification must not fail the action that produced it.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const notification = await prisma.notification
    .create({
      data: {
        userId: input.userId,
        type: input.type ?? "INFO",
        title: input.title,
        message: input.message,
        link: input.link,
      },
    })
    .catch((error) => {
      logErrorEvent({ event: "NOTIFICATION_STORE_FAILED", userId: input.userId, reason: String(error) });
      return null;
    });

  if (notification) {
    await publishUserEvent(input.userId, {
      type: "NOTIFICATION",
      title: input.title,
      message: input.message,
      at: notification.createdAt.toISOString(),
    });
  }

  if (!input.email) return;

  try {
    const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } });
    if (!user) return;

    await getEmailProvider().send({
      to: user.email,
      subject: input.title,
      text: `${input.message}\n\n${input.link ? `${getEnv().APP_URL}${input.link}\n\n` : ""}— ${BRAND.name}`,
    });
  } catch (error) {
    logErrorEvent({
      event: "NOTIFICATION_EMAIL_FAILED",
      userId: input.userId,
      reason: error instanceof Error ? error.message : "unknown",
    });
  }
}

export const listNotifications = (userId: string, take = 50) =>
  prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });

export const countUnread = (userId: string) =>
  prisma.notification.count({ where: { userId, readAt: null } });

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}
