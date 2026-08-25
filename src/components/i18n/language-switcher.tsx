"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { LocaleFlag } from "./locale-flag";
import {
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALE_LABELS,
  LOCALE_SHORT,
  type Locale,
} from "@/lib/i18n/config";

/**
 * Language picker for the header.
 *
 * The choice lives in a cookie because the copy is rendered on the server —
 * writing it then calling router.refresh() re-renders the page in the new
 * language, so there is no second copy of the text in the client bundle and no
 * flash of the wrong language on load.
 */
export function LanguageSwitcher({ locale, label }: { locale: Locale; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const choose = (next: Locale) => {
    setOpen(false);
    if (next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
    router.refresh();
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="panel inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 transition hover:opacity-80"
      >
        <LocaleFlag locale={locale} className="h-3.5 w-[21px] rounded-[2px]" />
        <span className="text-xs font-medium">{LOCALE_SHORT[locale]}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="panel absolute right-0 top-11 z-50 min-w-36 overflow-hidden rounded-lg shadow-xl"
        >
          {LOCALES.map((code) => (
            <button
              key={code}
              type="button"
              role="menuitemradio"
              aria-checked={code === locale}
              onClick={() => choose(code)}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition hover:opacity-70"
              style={code === locale ? { color: "var(--gold)" } : undefined}
            >
              <LocaleFlag locale={code} className="h-3.5 w-[21px] shrink-0 rounded-[2px]" />
              <span>{LOCALE_LABELS[code]}</span>
              <Check className={code === locale ? "ml-auto h-3.5 w-3.5" : "ml-auto h-3.5 w-3.5 opacity-0"} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
