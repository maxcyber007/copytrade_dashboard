import { requireUser } from "@/lib/auth/session";
import { listNotifications, markAllRead } from "@/services/notification.service";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await listNotifications(user.id);

  // Opening the page is what "read" means here.
  await markAllRead(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="mt-1 text-sm text-muted">
          Risk limits, copy failures and account changes. Anything you need to know while away is
          also emailed.
        </p>
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          title="Nothing to report"
          description="Notifications appear here when a risk limit pauses copying, a copy fails, or an administrator changes your account."
        />
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <Card key={notification.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{notification.title}</p>
                  <p className="mt-1 text-sm text-muted">{notification.message}</p>
                </div>
                <div className="text-right">
                  <StatusBadge status={notification.type} />
                  <p className="mt-1 text-xs text-muted">{notification.createdAt.toLocaleString()}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
