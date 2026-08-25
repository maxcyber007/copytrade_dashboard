import Link from "next/link";
import { Logo } from "./logo";
import { BRAND } from "@/lib/brand";
import { getDictionary } from "@/lib/i18n/server";
import { apiUrl } from "@/lib/api-client/browser";

export async function SiteFooter() {
  const t = await getDictionary();

  const columns = [
    {
      title: t.footer.platform,
      links: [
        { href: "#how", label: t.footer.linkHow },
        { href: "#features", label: t.footer.linkFeatures },
        { href: "#pricing", label: t.footer.linkPricing },
        { href: apiUrl("/api/health"), label: t.footer.linkStatus },
      ],
    },
    {
      title: t.footer.providers,
      links: [
        { href: "#providers", label: t.footer.linkProgram },
        { href: "/provider/apply", label: t.footer.linkApply },
        { href: "/login", label: t.footer.linkProviderSignIn },
      ],
    },
    {
      title: t.footer.account,
      links: [
        { href: "/register", label: t.footer.linkCreate },
        { href: "/login", label: t.footer.linkSignIn },
      ],
    },
  ];

  return (
    <footer className="border-t" style={{ borderColor: "var(--panel-border)", background: "var(--bg-deep)" }}>
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Link href="/" className="flex items-center gap-2.5">
              <Logo />
              <span className="text-[15px] font-semibold tracking-tight">
                {BRAND.wordmark.lead} <span className="text-gold">{BRAND.wordmark.accent}</span> {BRAND.wordmark.trail}
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              {t.footer.blurb}
            </p>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{column.title}</p>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="text-sm text-muted transition-colors hover:text-gold">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          className="mt-12 flex flex-col gap-4 border-t pt-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: "var(--panel-border)" }}
        >
          <p>© {new Date().getFullYear()} {BRAND.name}. {t.footer.rights}</p>
          <p className="max-w-xl leading-relaxed">
            {t.footer.risk}
          </p>
        </div>
      </div>
    </footer>
  );
}
