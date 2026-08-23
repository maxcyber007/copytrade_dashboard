import { requireAdmin } from "@/lib/auth/session";
import { userRepository } from "@/repositories/user.repository";
import { Table, Td, Th } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function AdminMembersPage() {
  await requireAdmin();
  const members = await userRepository.list({ take: 200 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
        <p className="text-sm text-muted">{members.length} account(s)</p>
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
              <Th>Registered</Th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id}>
                <Td>{member.email}</Td>
                <Td>{member.name ?? "—"}</Td>
                <Td>{member.role}</Td>
                <Td>
                  <StatusBadge status={member.status} />
                </Td>
                <Td className="text-right tabular-nums">{member._count.tradingAccounts}</Td>
                <Td className="text-right tabular-nums">{member._count.subscriptions}</Td>
                <Td className="whitespace-nowrap text-xs">
                  {member.lastLoginAt ? member.lastLoginAt.toLocaleString() : "never"}
                </Td>
                <Td className="whitespace-nowrap text-xs">{member.createdAt.toLocaleDateString()}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
