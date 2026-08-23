import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { countUnread, listNotifications, markAllRead } from "@/services/notification.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await requireUser();
  const [notifications, unread] = await Promise.all([listNotifications(user.id), countUnread(user.id)]);
  return ok({ notifications, unread });
});

/** Marks everything read — the member has just looked at the list. */
export const POST = handler(async () => {
  const user = await requireUser();
  await markAllRead(user.id);
  return ok({ read: true });
});
