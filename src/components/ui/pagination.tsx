import Link from "next/link";
import { getDictionary } from "@/lib/i18n/server";

export const PAGE_SIZES = [25, 50, 100, 200] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export const DEFAULT_PAGE_SIZE: PageSize = 50;

/** Reads a page size from a query string, ignoring anything not offered. */
export function parsePageSize(value: string | undefined): PageSize {
  const size = Number(value);
  return PAGE_SIZES.includes(size as PageSize) ? (size as PageSize) : DEFAULT_PAGE_SIZE;
}

/**
 * Clamps a page number to what actually exists.
 *
 * A page past the end would otherwise render an empty table that looks like a
 * history with nothing in it.
 */
export function parsePage(value: string | undefined, total: number, size: number): number {
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Number(value);
  if (!Number.isInteger(page) || page < 1) return 1;
  return Math.min(page, pages);
}

export function paginate<T>(rows: T[], page: number, size: number): T[] {
  return rows.slice((page - 1) * size, page * size);
}

/**
 * Page size and page controls, as links.
 *
 * Links rather than a client component: the page is server-rendered, so a
 * choice is a URL — shareable, bookmarkable, and surviving a reload.
 */
export async function Pagination({
  total,
  page,
  size,
  hrefFor,
}: {
  total: number;
  page: number;
  size: number;
  /** Builds the URL for a given page and size, keeping the other filters. */
  hrefFor: (params: { page: number; size: number }) => string;
}) {
  const t = await getDictionary();
  const pages = Math.max(1, Math.ceil(total / size));
  const first = total === 0 ? 0 : (page - 1) * size + 1;
  const last = Math.min(page * size, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted">
        {total === 0
          ? t.common.nothingToShow
          : t.common.showingRange
              .replace("{first}", String(first))
              .replace("{last}", String(last))
              .replace("{total}", String(total))}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs uppercase tracking-wide text-muted">{t.common.rows}</span>
          {PAGE_SIZES.map((option) => (
            <Link
              key={option}
              // Changing the page size changes which rows page 2 holds, so the
              // reader is put back at the start rather than somewhere arbitrary.
              href={hrefFor({ page: 1, size: option })}
              aria-current={option === size ? "true" : undefined}
              className={`rounded-md border px-2 py-1 text-xs tabular-nums transition-colors ${
                option === size ? "border-[var(--gold-line)] text-gold" : "text-muted hover:text-gold"
              }`}
              style={option === size ? undefined : { borderColor: "var(--panel-border)" }}
            >
              {option}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <PageLink href={hrefFor({ page: page - 1, size })} disabled={page <= 1} label={t.common.previous} />
          <span className="px-1 text-sm tabular-nums text-muted">
            {page} / {pages}
          </span>
          <PageLink href={hrefFor({ page: page + 1, size })} disabled={page >= pages} label={t.common.next} />
        </div>
      </div>
    </div>
  );
}

function PageLink({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  const className = "rounded-md border px-2.5 py-1 text-xs transition-colors";

  // A dead link is worse than no link: at the first or last page there is
  // nowhere to go, and a span cannot be clicked or tabbed to by mistake.
  if (disabled) {
    return (
      <span
        className={`${className} cursor-not-allowed opacity-40`}
        style={{ borderColor: "var(--panel-border)" }}
        aria-disabled="true"
      >
        {label}
      </span>
    );
  }

  return (
    <Link href={href} className={`${className} text-muted hover:text-gold`} style={{ borderColor: "var(--panel-border)" }}>
      {label}
    </Link>
  );
}
