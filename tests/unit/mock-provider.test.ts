import { beforeEach, describe, expect, it } from "vitest";
import { MockTradingProvider } from "@/providers/trading/MockTradingProvider";

const provider = new MockTradingProvider();

async function connect(platform: "MT4" | "MT5", login: string) {
  return provider.connectAccount({
    accountId: `acc-${login}`,
    platform,
    login,
    server: "Test-Server",
    broker: "Test Broker",
    password: "secret123",
  });
}

let counter = 0;
const uniqueLogin = () => `9${(counter += 1)}${Date.now() % 100_000}`;

describe("connection", () => {
  it("reports platform-appropriate broker limits", async () => {
    const mt4 = await connect("MT4", uniqueLogin());
    const mt5 = await connect("MT5", uniqueLogin());

    // MT4 brokers in the simulation trade in coarser lot steps than MT5 ones.
    expect(mt4.lotStep).toBeGreaterThan(mt5.lotStep);
    expect(mt4.positionMode).toBe("HEDGING");
  });

  it("rejects credentials the simulation is set up to refuse", async () => {
    await expect(connect("MT5", "12340000")).rejects.toThrow();
  });

  it("requires a password", async () => {
    await expect(
      provider.connectAccount({
        accountId: "a",
        platform: "MT5",
        login: uniqueLogin(),
        server: "s",
        broker: "b",
        password: "",
      }),
    ).rejects.toThrow();
  });
});

describe("MT4 hedging behaviour", () => {
  let providerAccountId: string;

  beforeEach(async () => {
    providerAccountId = (await connect("MT4", uniqueLogin())).providerAccountId;
  });

  it("keeps same-symbol orders as separate tickets", async () => {
    const first = await provider.openPosition(providerAccountId, {
      symbol: "XAUUSD",
      orderType: "BUY",
      volume: 0.1,
      clientId: "copy-1",
    });
    const second = await provider.openPosition(providerAccountId, {
      symbol: "XAUUSD",
      orderType: "BUY",
      volume: 0.2,
      clientId: "copy-2",
    });

    expect(first.ticket).not.toBe(second.ticket);
    expect(await provider.getPositions(providerAccountId)).toHaveLength(2);
  });

  it("issues a new ticket for the remainder of a partial close", async () => {
    const opened = await provider.openPosition(providerAccountId, {
      symbol: "EURUSD",
      orderType: "BUY",
      volume: 1,
      clientId: "copy-3",
    });

    const closed = await provider.closePosition(providerAccountId, { ticket: opened.ticket!, volume: 0.4 });

    // This is the case that orphans a member position when it is not remapped.
    expect(closed.executed).toBe(true);
    expect(closed.remainderTicket).toBeDefined();
    expect(closed.remainderTicket).not.toBe(opened.ticket);

    const positions = await provider.getPositions(providerAccountId);
    const remainder = positions.find((position) => position.ticket === closed.remainderTicket);
    expect(remainder?.volume).toBeCloseTo(0.6, 2);
    expect(positions.some((position) => position.ticket === opened.ticket)).toBe(false);
  });
});

describe("MT5 netting behaviour", () => {
  /** Netting is derived from the login, so search for one the simulation makes netting. */
  async function connectNetting() {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const result = await connect("MT5", uniqueLogin());
      if (result.positionMode === "NETTING") return result.providerAccountId;
    }
    throw new Error("no netting account produced");
  }

  it("merges same-symbol orders into one net position", async () => {
    const providerAccountId = await connectNetting();

    const first = await provider.openPosition(providerAccountId, {
      symbol: "XAUUSD",
      orderType: "BUY",
      volume: 0.1,
      clientId: "copy-4",
    });
    const second = await provider.openPosition(providerAccountId, {
      symbol: "XAUUSD",
      orderType: "BUY",
      volume: 0.3,
      clientId: "copy-5",
    });

    // The second order returns the SAME ticket: mapping by ticket alone would
    // silently point two copies at one position.
    expect(second.ticket).toBe(first.ticket);

    const positions = await provider.getPositions(providerAccountId);
    expect(positions).toHaveLength(1);
    expect(positions[0]!.volume).toBeCloseTo(0.4, 2);
  });

  it("keeps the same ticket on a partial close", async () => {
    const providerAccountId = await connectNetting();
    const opened = await provider.openPosition(providerAccountId, {
      symbol: "GBPUSD",
      orderType: "SELL",
      volume: 1,
      clientId: "copy-6",
    });

    const closed = await provider.closePosition(providerAccountId, { ticket: opened.ticket!, volume: 0.25 });

    expect(closed.remainderTicket).toBeUndefined();
    const positions = await provider.getPositions(providerAccountId);
    expect(positions[0]!.ticket).toBe(opened.ticket);
    expect(positions[0]!.volume).toBeCloseTo(0.75, 2);
  });
});

describe("order rejections", () => {
  it("rejects an unknown symbol and an out-of-range volume without throwing", async () => {
    const { providerAccountId } = await connect("MT5", uniqueLogin());

    const badSymbol = await provider.openPosition(providerAccountId, {
      symbol: "NOTREAL",
      orderType: "BUY",
      volume: 0.1,
      clientId: "copy-7",
    });
    expect(badSymbol.executed).toBe(false);
    expect(badSymbol.errorCode).toBe("INVALID_SYMBOL");

    const badVolume = await provider.openPosition(providerAccountId, {
      symbol: "XAUUSD",
      orderType: "BUY",
      volume: 999,
      clientId: "copy-8",
    });
    expect(badVolume.executed).toBe(false);
    expect(badVolume.errorCode).toBe("INVALID_VOLUME");
  });

  it("reports a missing position instead of pretending to close it", async () => {
    const { providerAccountId } = await connect("MT5", uniqueLogin());
    const result = await provider.closePosition(providerAccountId, { ticket: "does-not-exist" });

    expect(result.executed).toBe(false);
    expect(result.errorCode).toBe("POSITION_NOT_FOUND");
  });
});
