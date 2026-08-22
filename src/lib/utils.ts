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
