import { requireAdmin } from "@/lib/api-client/auth";
import { loadPageData } from "@/lib/api-client/page-data";
import { Table, Td, Th } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MemberActions } from "@/components/admin/member-actions";
import { getDictionary } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminMembersPage() {
  const admin = await requireAdmin();
  const [{ members }, t] = await Promise.all([loadPageData("admin/members"), getDictionary()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.admin.membersTitle}</h1>
        <p className="text-sm text-muted">
          {t.admin.membersSubtitle.replace("{count}", String(members.length))}
        </p>
      </div>

      {members.length === 0 ? (
        <EmptyState title={t.admin.noMembers} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t.admin.thEmail}</Th>
              <Th>{t.admin.thName}</Th>
              <Th>{t.admin.thRole}</Th>
              <Th>{t.admin.thStatus}</Th>
              <Th className="text-right">{t.admin.thAccounts}</Th>
              <Th className="text-right">{t.admin.thSubscriptions}</Th>
              <Th>{t.admin.thLastLogin}</Th>
              <Th className="text-right">{t.admin.thActions}</Th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const locked = Boolean(member.lockedUntil && new Date(member.lockedUntil) > new Date());
              return (
                <tr key={member.id}>
                  <Td>
                    {member.email}
                    {member.id === admin.id && <span className="ml-2 text-xs text-muted">{t.admin.you}</span>}
                  </Td>
                  <Td>{member.name ?? "—"}</Td>
                  <Td>{member.role}</Td>
                  <Td>
                    <StatusBadge status={member.status} />
                    {locked && <span className="mt-1 block text-xs text-amber-500">{t.admin.lockedOut}</span>}
                  </Td>
                  <Td className="text-right tabular-nums">{member._count.tradingAccounts}</Td>
                  <Td className="text-right tabular-nums">{member._count.subscriptions}</Td>
                  <Td className="whitespace-nowrap text-xs">
                    {formatDateTime(member.lastLoginAt) ?? t.admin.never}
                  </Td>
                  <Td>
                    <MemberActions
                      member={{
                        id: member.id,
                        email: member.email,
                        name: member.name,
                        role: member.role,
                        status: member.status,
                        lockedUntil: member.lockedUntil,
                        accounts: member._count.tradingAccounts,
                        subscriptions: member._count.subscriptions,
                      }}
                      isSelf={member.id === admin.id}
                    />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
