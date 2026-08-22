import { describe, expect, it } from "vitest";
import { providerApplicationSchema, providerReviewSchema, slugify } from "@/lib/validation/provider";

const validApplication = {
  displayName: "Gold Desk Capital",
  headline: "Intraday gold scalping with fixed stops",
  bio: "London and New York session gold scalping with fixed stops, no martingale and no grid.",
  performanceFeePct: 20,
  subscriptionPriceMonthly: 49,
};

describe("provider slug", () => {
  it("builds a url-safe handle", () => {
    expect(slugify("Gold Desk Capital")).toBe("gold-desk-capital");
    expect(slugify("  FX  Pro//Trader ")).toBe("fx-pro-trader");
  });

  it("returns empty for names with no usable characters", () => {
    expect(slugify("###")).toBe("");
  });
});

describe("provider application validation", () => {
  it("accepts a complete application", () => {
    expect(providerApplicationSchema.safeParse(validApplication).success).toBe(true);
  });

  it("requires a substantial description", () => {
    const result = providerApplicationSchema.safeParse({ ...validApplication, bio: "too short" });
    expect(result.success).toBe(false);
  });

  it("caps the performance fee", () => {
    expect(providerApplicationSchema.safeParse({ ...validApplication, performanceFeePct: 80 }).success).toBe(false);
    expect(providerApplicationSchema.safeParse({ ...validApplication, performanceFeePct: 50 }).success).toBe(true);
  });

  it("rejects a negative price", () => {
    expect(
      providerApplicationSchema.safeParse({ ...validApplication, subscriptionPriceMonthly: -1 }).success,
    ).toBe(false);
  });

  it("defaults commercial terms to free", () => {
    const parsed = providerApplicationSchema.parse({
      displayName: validApplication.displayName,
      headline: validApplication.headline,
      bio: validApplication.bio,
    });
    expect(parsed.performanceFeePct).toBe(0);
    expect(parsed.subscriptionPriceMonthly).toBe(0);
  });
});

describe("provider review validation", () => {
  it("accepts the three decisions", () => {
    for (const decision of ["APPROVE", "REJECT", "SUSPEND"] as const) {
      expect(providerReviewSchema.safeParse({ decision }).success).toBe(true);
    }
  });

  it("rejects an unknown decision", () => {
    expect(providerReviewSchema.safeParse({ decision: "DELETE" }).success).toBe(false);
  });
});
