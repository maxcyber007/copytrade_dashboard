import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { loginSchema, registerSchema } from "@/lib/validation/auth";

describe("password hashing", () => {
  it("stores an argon2id digest, not the password", async () => {
    const digest = await hashPassword("StrongPass123");
    expect(digest.startsWith("$argon2id$")).toBe(true);
    expect(digest).not.toContain("StrongPass123");
  });

  it("verifies the correct password only", async () => {
    const digest = await hashPassword("StrongPass123");
    expect(await verifyPassword(digest, "StrongPass123")).toBe(true);
    expect(await verifyPassword(digest, "StrongPass124")).toBe(false);
  });

  it("returns false instead of throwing on a malformed digest", async () => {
    expect(await verifyPassword("not-a-hash", "StrongPass123")).toBe(false);
  });
});

describe("auth validation", () => {
  it("rejects weak passwords", () => {
    expect(registerSchema.safeParse({ email: "a@b.com", password: "short" }).success).toBe(false);
    expect(registerSchema.safeParse({ email: "a@b.com", password: "alllowercase1" }).success).toBe(false);
    expect(registerSchema.safeParse({ email: "a@b.com", password: "StrongPass123" }).success).toBe(true);
  });

  it("normalises the email", () => {
    const parsed = loginSchema.parse({ email: "  USER@Example.COM ", password: "x" });
    expect(parsed.email).toBe("user@example.com");
  });
});
