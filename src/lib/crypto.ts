import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual, createHmac } from "node:crypto";
import { getEnv } from "./env";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;

function key(): Buffer {
  const raw = getEnv().ENCRYPTION_KEY;
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes (base64 of 32 random bytes)");
  }
  return buf;
}

/** Encrypts a secret for storage. Output: base64(iv).base64(tag).base64(ciphertext) */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted payload");
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export function hmacSha256Hex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

/** Constant-time comparison that never throws on length mismatch. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
