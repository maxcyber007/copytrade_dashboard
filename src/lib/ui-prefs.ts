/**
 * Small UI preferences that the server needs to know before first paint.
 *
 * The sidebar state lives in a cookie rather than localStorage so the server
 * can render it already collapsed — reading it on the client instead would
 * render the wide sidebar first and snap it shut after hydration.
 */
export const SIDEBAR_COOKIE = "sidebar";

/** One year — a layout preference should outlive the session. */
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isSidebarCollapsed(value: string | undefined): boolean {
  return value === "collapsed";
}
