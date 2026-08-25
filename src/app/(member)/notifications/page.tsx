import { requireUser } from "@/lib/api-client/auth";
import { loadPageData } from "@/lib/api-client/page-data";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getDictionary } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  await requireUser();
  const [{ notifications }, t] = await Promise.all([loadPageData("notifications"), getDictionary()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.member.notificationsTitle}</h1>
        <p className="mt-1 text-sm text-muted">
          {t.member.notificationsSubtitle}
        </p>
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          title={t.member.notificationsEmptyTitle}
          description={t.member.notificationsEmptyBody}
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
