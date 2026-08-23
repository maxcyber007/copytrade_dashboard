import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { encryptSecret } from "@/lib/crypto";
import { connectAccount } from "@/services/account.service";

/**
 * Refusing to retry credentials the broker already rejected.
 *
 * MetaApi reserves the right to charge for each repeated authentication
 * failure, so a Connect button that keeps sending the same wrong password is a
 * bill, not a retry.
 */
const prisma = new PrismaClient();

let databaseAvailable = false;
const suffix = randomUUID().slice(0, 8);
const ids = { user: "", account: "" };
const meta = { ip: "127.0.0.1", userAgent: "vitest" };

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseAvailable = true;
  } catch {
    return;
  }

  const user = await prisma.user.create({
    data: {
      email: `atest-${suffix}@example.com`,
      passwordHash: await hashPassword("AccountTest123"),
      role: "MEMBER",
    },
  });
  ids.user = user.id;

  const account = await prisma.tradingAccount.create({
    data: {
      userId: user.id,
      label: "Rejected credentials",
      broker: "Atest Broker",
      login: `71${suffix.slice(0, 6)}`,
      server: "Atest-Server",
      platform: "MT5",
      provider: "mock",
      encryptedPassword: encryptSecret("wrongpassword"),
      connectionStatus: "ERROR",
      lastError: "We failed to authenticate to your broker using credentials provided.",
      lastErrorCode: "BROKER_AUTH_FAILED",
    },
  });
  ids.account = account.id;
}, 60_000);

afterAll(async () => {
  if (databaseAvailable && ids.user) {
    await prisma.user.deleteMany({ where: { id: ids.user } });
  }
  await prisma.$disconnect();
});

describe("connecting an account the broker already rejected", () => {
  it("refuses without reaching the provider, and says what to fix", async () => {
    if (!databaseAvailable) return;

    await expect(connectAccount(ids.account, ids.user, meta)).rejects.toMatchObject({
      code: "BROKER_AUTH_FAILED",
    });

    // Nothing was attempted, so the stored reason still stands and the account
    // was not walked through CONNECTING back to ERROR.
    const account = await prisma.tradingAccount.findUniqueOrThrow({ where: { id: ids.account } });
    expect(account.connectionStatus).toBe("ERROR");
    expect(account.lastErrorCode).toBe("BROKER_AUTH_FAILED");
  }, 30_000);

  it("lets the attempt through once the failure was something else", async () => {
    if (!databaseAvailable) return;

    // A connection error is transient by nature: the broker may be reachable
    // again, so retrying is exactly right.
    await prisma.tradingAccount.update({
      where: { id: ids.account },
      data: { lastErrorCode: "PLATFORM_CONNECTION_ERROR", login: `72${suffix.slice(0, 6)}` },
    });

    // The mock provider accepts any login that does not end in 0000.
    const connected = await connectAccount(ids.account, ids.user, meta);
    expect(connected.connectionStatus).toBe("CONNECTED");
    expect(connected.lastErrorCode).toBeNull();
  }, 30_000);
});
