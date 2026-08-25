import type { Metadata } from "next";
import { Prompt } from "next/font/google";
import "./globals.css";
import { ThemeScript } from "@/components/theme-script";
import { BRAND } from "@/lib/brand";
import { getDictionary, getLocale } from "@/lib/i18n/server";
import { LocaleProvider } from "@/components/i18n/locale-provider";

/**
 * Prompt is not a variable font, so the weights the UI actually uses are listed
 * explicitly — anything not listed here silently falls back to a synthetic
 * weight in the browser. The thai subset is included because the product copy
 * is bilingual.
 */
const prompt = Prompt({
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-prompt",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${BRAND.name} — MT4 & MT5 Copy Trading`,
  description: BRAND.tagline,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, dictionary] = await Promise.all([getLocale(), getDictionary()]);

  return (
    // "dark" ships in the markup because dark is the default theme; ThemeScript
    // only removes it for visitors who picked light, which cannot flash.
    <html lang={locale} className={`dark ${prompt.variable}`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-screen antialiased">
        <LocaleProvider locale={locale} dictionary={dictionary}>
          {children}
        </LocaleProvider>
      </body>
    </html>
  );
}
