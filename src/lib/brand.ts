/**
 * The product's name, in one place.
 *
 * It was spelled out in eight files — three wordmarks, two layouts, the page
 * metadata and two email templates — so renaming it meant finding all eight and
 * missing one. Everything user-facing reads it from here instead.
 */
export const BRAND = {
  /** Full name, for titles, emails and anywhere prose refers to the product. */
  name: "TrendX Synex Platform",
  /** The wordmark, split so the middle word can carry the gold accent. */
  wordmark: { lead: "TrendX", accent: "Synex", trail: "Platform" },
  tagline: "Cloud copy trading for MetaTrader 4 and MetaTrader 5. No VPS, no EA installation.",
} as const;
