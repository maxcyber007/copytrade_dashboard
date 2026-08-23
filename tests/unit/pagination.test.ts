import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, paginate, parsePage, parsePageSize } from "@/components/ui/pagination";

/**
 * Page and size come from the query string, so they are whatever someone typed
 * or an old link still carries. Every one of these has to land somewhere real.
 */
describe("page size", () => {
  it("takes the offered sizes and nothing else", () => {
    expect(parsePageSize("25")).toBe(25);
    expect(parsePageSize("200")).toBe(200);

    // A size nobody offered would let one link ask for the whole table.
    expect(parsePageSize("5000")).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize("abc")).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize("-10")).toBe(DEFAULT_PAGE_SIZE);
  });
});

describe("page number", () => {
  it("clamps to a page that exists", () => {
    // 120 rows at 50 a page is three pages.
    expect(parsePage("2", 120, 50)).toBe(2);
    expect(parsePage("3", 120, 50)).toBe(3);

    // Past the end would render an empty table, which reads as a history with
    // nothing in it rather than a page that does not exist.
    expect(parsePage("9", 120, 50)).toBe(3);
    expect(parsePage("0", 120, 50)).toBe(1);
    expect(parsePage("-4", 120, 50)).toBe(1);
    expect(parsePage("two", 120, 50)).toBe(1);
    expect(parsePage(undefined, 120, 50)).toBe(1);
  });

  it("stays on page one when there is nothing to page through", () => {
    expect(parsePage("3", 0, 50)).toBe(1);
  });

  it("does not lose the last, partly filled page", () => {
    // 101 rows at 50 is three pages, the last holding one row.
    expect(parsePage("3", 101, 50)).toBe(3);
    expect(paginate(Array.from({ length: 101 }, (_, i) => i), 3, 50)).toEqual([100]);
  });
});

describe("slicing", () => {
  const rows = Array.from({ length: 10 }, (_, index) => index);

  it("returns the rows the page covers", () => {
    expect(paginate(rows, 1, 4)).toEqual([0, 1, 2, 3]);
    expect(paginate(rows, 2, 4)).toEqual([4, 5, 6, 7]);
    expect(paginate(rows, 3, 4)).toEqual([8, 9]);
  });
});
