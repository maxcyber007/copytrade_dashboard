import { cookies } from "next/headers";
import { cache } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";
import { dictionaries, type Dictionary } from "./dictionaries";

/**
 * Locale for the current request, read from the cookie the switcher sets.
 *
 * Wrapped in React's `cache` so the many server components that ask for it in a
 * single render only touch the cookie store once.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
});

export async function getDictionary(): Promise<Dictionary> {
  return dictionaries[await getLocale()];
}
