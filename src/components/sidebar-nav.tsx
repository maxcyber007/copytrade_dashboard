"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  BadgeCheck,
  Bell,
  ChevronLeft,
  ChevronRight,
  Compass,
  CreditCard,
  Gauge,
  History,
  LayoutDashboard,
  LineChart,
  Radio,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { Logo } from "@/components/landing/logo";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { SIDEBAR_COOKIE, SIDEBAR_COOKIE_MAX_AGE } from "@/lib/ui-prefs";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/**
 * The dashboard sidebar, collapsible down to an icon rail.
 *
 * The whole <aside> lives here, not just the links: its width reacts to the
 * collapsed state, so it has to sit on the client side of the boundary.
 *
 * The nav structure and its icons are defined here for a second reason —
 * icons are component references, and those cannot be handed from a server
 * component to a client one. Only the translated labels, which are plain
 * strings, cross that boundary.
 *
 * The initial collapsed value comes from the server via a cookie, so the rail
 * never flashes open before hydration.
 *
 * Collapsing applies from `lg` up only. Below that the sidebar is a horizontal
 * strip where the labels are the only thing making it readable.
 */

type Labels = Dictionary["app"];

export function SidebarNav({
  role,
  labels,
  defaultCollapsed,
}: {
  role: string;
  labels: Labels;
  defaultCollapsed: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; samesite=lax`;
    } catch {
      /* storage blocked — the choice simply will not persist */
    }
  };

  const memberNav = [
    { href: "/dashboard", label: labels.navDashboard, icon: LayoutDashboard },
    { href: "/account", label: labels.navAccounts, icon: Wallet },
    { href: "/strategies", label: labels.navStrategies, icon: Compass },
    { href: "/history", label: labels.navHistory, icon: History },
    { href: "/performance", label: labels.navPerformance, icon: TrendingUp },
    { href: "/notifications", label: labels.navNotifications, icon: Bell },
    { href: "/billing", label: labels.navBilling, icon: CreditCard },
  ];

  const providerNav = [
    { href: "/provider/strategies", label: labels.navMyStrategies, icon: Radio },
    { href: "/provider/apply", label: labels.navProviderProfile, icon: UserCog },
  ];

  const adminNav = [
    { href: "/admin/dashboard", label: labels.navOverview, icon: LayoutDashboard },
    { href: "/admin/members", label: labels.navMembers, icon: Users },
    { href: "/admin/accounts", label: labels.navAdminAccounts, icon: Wallet },
    { href: "/admin/providers", label: labels.navProviders, icon: BadgeCheck },
    { href: "/admin/strategies", label: labels.navAdminStrategies, icon: LineChart },
    { href: "/admin/copy-trades", label: labels.navCopyTrades, icon: ArrowLeftRight },
    { href: "/admin/errors", label: labels.navErrors, icon: AlertTriangle },
    { href: "/admin/metaapi", label: labels.navMetaApi, icon: Gauge },
  ];

  const sections =
    role === "ADMIN"
      ? [{ label: labels.sectionAdministration, items: adminNav }]
      : [
          { label: labels.sectionCopying, items: memberNav },
          { label: labels.sectionPublishing, items: providerNav },
        ];

  const toggleLabel = collapsed ? labels.expandSidebar : labels.collapseSidebar;

  return (
    <aside
      className={cn(
        "panel relative shrink-0 border-b transition-[width] duration-300 lg:min-h-screen lg:border-b-0 lg:border-r",
        collapsed ? "lg:w-[72px]" : "lg:w-60",
      )}
    >
      <div className={cn("px-5 py-5", collapsed && "lg:px-0")}>
        <Link href="/" className={cn("flex items-center gap-2.5", collapsed && "lg:justify-center")}>
          <Logo className="h-7 w-7 shrink-0" />
          <span className={cn("text-[15px] font-semibold tracking-tight", collapsed && "lg:hidden")}>
            {BRAND.wordmark.lead} <span className="text-gold">{BRAND.wordmark.accent}</span>{" "}
            {BRAND.wordmark.trail}
          </span>
        </Link>
      </div>

      <nav className="flex gap-4 overflow-x-auto px-3 pb-3 lg:flex-col lg:gap-2 lg:overflow-visible">
        {sections.map((section, index) => (
          <div
            key={section.label}
            className={cn(
              "flex gap-1 lg:flex-col",
              // The heading is hidden on the narrow horizontal nav, so the
              // groups need a rule of their own to stay distinguishable.
              index > 0 && "border-l pl-4 lg:mt-3 lg:border-l-0 lg:pl-0 lg:border-t lg:pt-4",
            )}
            style={index > 0 ? { borderColor: "var(--panel-border)" } : undefined}
          >
            <p
              className={cn(
                // Same size and letterform rendering as the links below, so the
                // heading reads as the same typeface. `uppercase` does nothing
                // to Thai and wide `tracking` pulls its glyphs apart.
                "hidden items-center gap-2 px-3 pb-1.5 text-sm font-semibold",
                collapsed ? "lg:hidden" : "lg:flex",
              )}
              style={{ color: "var(--gold)" }}
            >
              <span className="h-3.5 w-[3px] rounded-full" style={{ background: "var(--gold)" }} />
              {section.label}
            </p>

            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                // With the label hidden there is nothing left to say what the
                // icon means, so the native tooltip carries it.
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-black/5 hover:text-gold dark:hover:bg-white/5",
                  collapsed && "lg:justify-center lg:px-0",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0 opacity-70 transition group-hover:opacity-100" />
                <span className={cn(collapsed && "lg:hidden")}>{item.label}</span>
              </Link>
            ))}
          </div>
        ))}
      </nav>

      {/* On the sidebar's edge, so it never competes with the nav for room */}
      <button
        type="button"
        onClick={toggle}
        aria-label={toggleLabel}
        aria-expanded={!collapsed}
        title={toggleLabel}
        className="panel absolute -right-3 top-7 z-20 hidden h-6 w-6 items-center justify-center rounded-full shadow-md transition hover:text-gold lg:inline-flex"
      >
        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
      </button>
    </aside>
  );
}
