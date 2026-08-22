import { argon2id, hash, verify, type HashOptions } from "argon2";

const OPTIONS: HashOptions = {
  type: argon2id,
  memoryCost: 19456, // 19 MiB — OWASP baseline
  timeCost: 2,
  parallelism: 1,
};

export const hashPassword = (plain: string): Promise<string> => hash(plain, OPTIONS);

export async function verifyPassword(digest: string, plain: string): Promise<boolean> {
  try {
    return await verify(digest, plain);
  } catch {
    return false;
  }
}
