export const LOCALES = ["th", "en"] as const;

export type Locale = (typeof LOCALES)[number];

/** Thai is the product's primary language. */
export const DEFAULT_LOCALE: Locale = "th";

export const LOCALE_COOKIE = "locale";

/** One year — the choice should outlive the session. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const LOCALE_LABELS: Record<Locale, string> = {
  th: "ไทย",
  en: "English",
};

/** Short form for the switcher button. */
export const LOCALE_SHORT: Record<Locale, string> = {
  th: "TH",
  en: "EN",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
