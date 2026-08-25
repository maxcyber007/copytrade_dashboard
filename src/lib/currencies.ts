/**
 * Deposit currencies offered by retail MT4/MT5 brokers.
 *
 * Ordered by how often they are actually picked here rather than
 * alphabetically, so the common choice is the first one reached.
 *
 * `USC` and `EUC` are cent accounts. They are not ISO 4217 codes, but brokers
 * do issue them and `Intl.NumberFormat` renders an unknown three-letter code
 * as the code itself rather than failing, so they display correctly.
 */
export const ACCOUNT_CURRENCIES = [
  "USD",
  "THB",
  "EUR",
  "GBP",
  "JPY",
  "AUD",
  "CAD",
  "CHF",
  "NZD",
  "SGD",
  "HKD",
  "CNH",
  "INR",
  "AED",
  "SAR",
  "ZAR",
  "TRY",
  "MXN",
  "PLN",
  "CZK",
  "HUF",
  "NOK",
  "SEK",
  "DKK",
  "USC",
  "EUC",
] as const;

export const DEFAULT_ACCOUNT_CURRENCY = "USD";
