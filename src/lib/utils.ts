import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const formatCurrency = (value: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);

export const formatPercent = (value: number, digits = 2) => `${value.toFixed(digits)}%`;

export const formatLot = (value: number) => value.toFixed(2);

/** Prisma Decimal | number | string -> number (safe for display math only). */
export const toNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "object" && "toNumber" in (value as Record<string, unknown>)) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value);
};

/**
 * Timestamps, formatted the same way everywhere.
 *
 * Dates now arrive as ISO strings, and `toLocaleString()` would render them in
 * whichever timezone and locale the renderer happens to have — which differs
 * between the server and the visitor's browser, and is precisely what React
 * reports as a hydration mismatch. Slicing the ISO string instead gives one
 * answer, on both sides, in UTC.
 */
export const formatDateTime = (iso: string | null | undefined): string | null =>
  iso ? `${iso.slice(0, 10)} ${iso.slice(11, 16)}` : null;

export const formatDate = (iso: string | null | undefined): string | null =>
  iso ? iso.slice(0, 10) : null;
