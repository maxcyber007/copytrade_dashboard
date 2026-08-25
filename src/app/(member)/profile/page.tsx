import { requireUser } from "@/lib/api-client/auth";
import { loadPageData } from "@/lib/api-client/page-data";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { getDictionary } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  const [{ profile }, t] = await Promise.all([loadPageData("profile"), getDictionary()]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.profile.title}</h1>
        <p className="mt-1 text-sm text-muted">{t.profile.subtitle}</p>
      </div>

      <ProfileEditor
        labels={t.profile}
        profile={{
          email: profile.email,
          name: profile.name,
          role: profile.role,
          createdAt: profile.createdAt,
          lastLoginAt: profile.lastLoginAt,
          avatarUpdatedAt: profile.avatarUpdatedAt,
        }}
      />
    </div>
  );
}
