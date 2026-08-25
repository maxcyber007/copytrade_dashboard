import { cookies } from "next/headers";
import type { SessionUser } from "@/lib/api-client/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { SidebarNav } from "@/components/sidebar-nav";
import { UserMenu } from "@/components/profile/user-menu";
import { SIDEBAR_COOKIE, isSidebarCollapsed } from "@/lib/ui-prefs";
import { getDictionary, getLocale } from "@/lib/i18n/server";

export async function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const [locale, t, store] = await Promise.all([getLocale(), getDictionary(), cookies()]);

  // Read on the server so a collapsed sidebar renders collapsed from the first
  // byte, rather than opening and snapping shut once the client takes over.
  const collapsed = isSidebarCollapsed(store.get(SIDEBAR_COOKIE)?.value);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <SidebarNav role={user.role} labels={t.app} defaultCollapsed={collapsed} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="panel flex items-center justify-between gap-4 border-b px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{user.name ?? user.email}</p>
            <p className="text-xs text-muted">{user.role}</p>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher locale={locale} label={t.nav.language} />
            <ThemeToggle label={t.nav.toggleTheme} />
            <UserMenu
              name={user.name}
              email={user.email}
              role={user.role}
              avatarUpdatedAt={user.avatarUpdatedAt}
              labels={t.profile}
              signOutLabel={t.app.signOut}
            />
          </div>
        </header>
        <main className="flex-1 px-5 py-6">{children}</main>
      </div>
    </div>
  );
}
