import { requireAdmin } from "@/lib/auth/session";
import { userRepository } from "@/repositories/user.repository";
import { Table, Td, Th } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MemberActions } from "@/components/admin/member-actions";

export const dynamic = "force-dynamic";

export default async function AdminMembersPage() {
  const admin = await requireAdmin();
  const members = await userRepository.list({ take: 200 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
        <p className="text-sm text-muted">
          {members.length} account(s). Suspending stops a member trading immediately; deleting is
          permanent and cascades to their accounts and history.
        </p>
      </div>

      {members.length === 0 ? (
        <EmptyState title="No members yet" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Email</Th>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th className="text-right">Accounts</Th>
              <Th className="text-right">Subscriptions</Th>
              <Th>Last login</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const locked = member.lockedUntil && member.lockedUntil > new Date();
              return (
                <tr key={member.id}>
                  <Td>
                    {member.email}
                    {member.id === admin.id && <span className="ml-2 text-xs text-muted">(you)</span>}
                  </Td>
                  <Td>{member.name ?? "—"}</Td>
                  <Td>{member.role}</Td>
                  <Td>
                    <StatusBadge status={member.status} />
                    {locked && <span className="mt-1 block text-xs text-amber-500">locked out</span>}
                  </Td>
                  <Td className="text-right tabular-nums">{member._count.tradingAccounts}</Td>
                  <Td className="text-right tabular-nums">{member._count.subscriptions}</Td>
                  <Td className="whitespace-nowrap text-xs">
                    {member.lastLoginAt ? member.lastLoginAt.toLocaleString() : "never"}
                  </Td>
                  <Td>
                    <MemberActions
                      member={{
                        id: member.id,
                        email: member.email,
                        name: member.name,
                        role: member.role,
                        status: member.status,
                        lockedUntil: member.lockedUntil ? member.lockedUntil.toISOString() : null,
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
