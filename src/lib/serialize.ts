/**
 * Turning database records into something that survives the wire.
 *
 * Once pages read their data over HTTP instead of from Prisma directly, every
 * value has to pass through JSON. Two types do not survive that trip intact:
 * `Date`, which JSON.stringify renders as an ISO string with no way back, and
 * Prisma's `Decimal`, which stringifies to `{}` and would silently become an
 * empty object in the browser — a balance that renders as nothing.
 *
 * So both are converted explicitly, and the matching type `Serialized<T>`
 * describes the result, which means a page that forgets a date is now a string
 * fails to compile rather than printing `[object Object]`.
 */

/** Anything exposing Prisma's `Decimal.toNumber()`. */
type DecimalLike = { toNumber: () => number };

function isDecimalLike(value: object): value is DecimalLike {
  return typeof (value as DecimalLike).toNumber === "function";
}

export type Serialized<T> = T extends Date
  ? string
  : T extends DecimalLike
    ? number
    : T extends (infer U)[]
      ? Serialized<U>[]
      : T extends object
        ? { [K in keyof T]: Serialized<T[K]> }
        : T;

/**
 * Deep-converts dates to ISO strings and decimals to numbers.
 *
 * Decimals become numbers because everything here is displayed, not settled:
 * balances and lot sizes are rendered, and the money arithmetic that must stay
 * exact happens in the services, on the Decimal itself, before it ever reaches
 * a page.
 */
export function serialize<T>(value: T): Serialized<T> {
  return convert(value) as Serialized<T>;
}

function convert(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(convert);

  if (typeof value === "object") {
    if (isDecimalLike(value)) return value.toNumber();

    // Buffers and typed arrays are never page data; passing one through would
    // serialise it as an object of numbered keys, which is worth catching.
    if (ArrayBuffer.isView(value)) return undefined;

    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = convert(item);
    return out;
  }

  return value;
}
