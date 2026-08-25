import "server-only";
import { apiGet } from "./server";
import type { PageData, PageView } from "@/server/page-data";

/**
 * How a page reads its data.
 *
 * The import of `PageData` is a type-only import, erased at compile time, so
 * naming the loaders here does not pull the database client into a page bundle.
 * What it buys is that a page's props are checked against what the API actually
 * returns, with dates already narrowed to strings — the mismatch that would
 * otherwise only appear as a runtime error in the browser.
 */
export async function loadPageData<V extends PageView>(
  view: V,
  params: Record<string, string | number | undefined> = {},
): Promise<PageData[V]> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return apiGet<PageData[V]>(`/api/page-data/${view}${suffix}`);
}
