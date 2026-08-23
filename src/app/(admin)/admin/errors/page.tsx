import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { Table, Td, Th } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";

export const dynamic = "force-dynamic";

export default async function AdminErrorsPage() {
  await requireAdmin();
  const errors = await prisma.systemError.findMany({ take: 100, orderBy: { createdAt: "desc" } });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">System errors</h1>
        <p className="text-sm text-muted">
          Technical detail for administrators. Members only ever see the mapped, non-technical message.
        </p>
      </div>

      {errors.length === 0 ? (
        <EmptyState title="No system errors recorded" description="Errors raised by the API, workers or providers land here." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Time</Th>
              <Th>Code</Th>
              <Th>Severity</Th>
              <Th>Source</Th>
              <Th>Message</Th>
              <Th>Resolved</Th>
            </tr>
          </thead>
          <tbody>
            {errors.map((error) => (
              <tr key={error.id}>
                <Td className="whitespace-nowrap text-xs">{error.createdAt.toLocaleString()}</Td>
                <Td className="text-xs font-medium">{error.code}</Td>
                <Td>
                  <StatusBadge status={error.severity} />
                </Td>
                <Td className="text-xs">{error.source}</Td>
                <Td className="max-w-md text-xs">{error.message}</Td>
                <Td className="text-xs">{error.resolvedAt ? error.resolvedAt.toLocaleString() : "open"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
