import { describe, expect, it } from "vitest";

describe("credential encryption", () => {
  it("round-trips a secret", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto");
    const secret = "Tr4ding-P@ssw0rd";
    const stored = encryptSecret(secret);

    expect(stored).not.toContain(secret);
    expect(decryptSecret(stored)).toBe(secret);
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    const { encryptSecret } = await import("@/lib/crypto");
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("rejects a tampered payload", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto");
    const [iv, tag, data] = encryptSecret("secret").split(".");
    const tampered = [iv, tag, Buffer.from("evil").toString("base64")].join(".");

    expect(() => decryptSecret(tampered)).toThrow();
    expect(decryptSecret([iv, tag, data].join("."))).toBe("secret");
  });
});

describe("hmac + constant time compare", () => {
  it("verifies a matching signature and rejects a modified body", async () => {
    const { hmacSha256Hex, safeEqual } = await import("@/lib/crypto");
    const secret = "master-secret";
    const signature = hmacSha256Hex(secret, "1700000000.{\"eventId\":\"A\"}");

    expect(safeEqual(signature, hmacSha256Hex(secret, "1700000000.{\"eventId\":\"A\"}"))).toBe(true);
    expect(safeEqual(signature, hmacSha256Hex(secret, "1700000000.{\"eventId\":\"B\"}"))).toBe(false);
    expect(safeEqual(signature, "short")).toBe(false);
  });
});
