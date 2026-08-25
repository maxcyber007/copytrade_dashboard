import { requireAdmin } from "@/lib/api-client/auth";
import { loadPageData } from "@/lib/api-client/page-data";
import { MetaApiUsage } from "@/components/admin/metaapi-usage";
import { getDictionary } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AdminMetaApiPage() {
  await requireAdmin();
  const [{ usage }, t] = await Promise.all([loadPageData("admin/metaapi"), getDictionary()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.metaapi.title}</h1>
        <p className="text-sm text-muted">{t.metaapi.subtitle}</p>
      </div>

      <MetaApiUsage initial={usage} />
    </div>
  );
}
