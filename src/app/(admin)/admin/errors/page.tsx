import { requireAdmin } from "@/lib/api-client/auth";
import { loadPageData } from "@/lib/api-client/page-data";
import { Table, Td, Th } from "@/components/ui/table";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getDictionary } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminErrorsPage() {
  await requireAdmin();
  const [{ errors }, t] = await Promise.all([loadPageData("admin/errors"), getDictionary()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.admin.errorsTitle}</h1>
        <p className="text-sm text-muted">
          {t.admin.errorsSubtitle}
        </p>
      </div>

      {errors.length === 0 ? (
        <EmptyState title={t.admin.noErrors} description={t.admin.noErrorsBody} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t.admin.thTime}</Th>
              <Th>{t.admin.thCode}</Th>
              <Th>{t.admin.thSeverity}</Th>
              <Th>{t.admin.thSource}</Th>
              <Th>{t.admin.thMessage}</Th>
              <Th>{t.admin.thResolved}</Th>
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
                <Td className="text-xs">{error.resolvedAt ? error.resolvedAt.toLocaleString() : t.admin.open}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
