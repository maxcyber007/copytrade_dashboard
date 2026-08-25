"use client";

import { createContext, useContext } from "react";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/**
 * Makes the active dictionary available to client components.
 *
 * Server components read it directly with getDictionary(); client components
 * cannot, and threading strings through props stopped scaling once most of the
 * app (forms, tables, admin panels) turned out to be client-side.
 *
 * The dictionary must stay plain data for this to work — it is serialized into
 * the RSC payload on its way here, and a function would fail to cross that
 * boundary. See lib/i18n/format.ts for why plurals are data, not functions.
 */
type LocaleContextValue = { locale: Locale; t: Dictionary };

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  locale,
  dictionary,
  children,
}: {
  locale: Locale;
  dictionary: Dictionary;
  children: React.ReactNode;
}) {
  return (
    <LocaleContext.Provider value={{ locale, t: dictionary }}>{children}</LocaleContext.Provider>
  );
}

function useLocaleContext(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error("useT/useLocale must be used inside <LocaleProvider>");
  }
  return value;
}

/** The active dictionary. */
export function useT(): Dictionary {
  return useLocaleContext().t;
}

/** The active locale code. */
export function useLocale(): Locale {
  return useLocaleContext().locale;
}
