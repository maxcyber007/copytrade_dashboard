/**
 * Plural forms live in the dictionary as plain data, never as functions: the
 * dictionary is handed to client components as a prop, and a function cannot
 * cross the server/client boundary. Formatting happens here instead.
 */
export type PluralForms = { one: string; other: string };

export function plural(forms: PluralForms, n: number): string {
  return (n === 1 ? forms.one : forms.other).replace("{n}", String(n));
}
