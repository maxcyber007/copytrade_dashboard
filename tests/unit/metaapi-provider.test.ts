import { beforeEach, describe, expect, it } from "vitest";
import { MetaApiProvider } from "@/providers/trading/MetaApiProvider";
import type {
  MetaApiAccountInformation,
  MetaApiConstructor,
  MetaApiPosition,
  MetaApiSymbolSpecification,
  MetaApiTradeOptions,
  MetaApiTradeResponse,
} from "@/providers/trading/metaapi-sdk";

/**
 * The MetaApi adapter against a fake SDK.
 *
 * The fake reproduces the two behaviours of the real SDK that the adapter is
 * built around and that a naive implementation gets wrong: a rejected order is
 * *thrown* as a TradeError rather than returned, and a partial close on MT4
 * answers with the ticket of the remainder rather than the one closed.
 *
 * Nothing here talks to MetaApi. Verifying the adapter against a live demo
 * account is a separate, manual step — see docs/trading-provider.md.
 */

class FakeTradeError extends Error {
  constructor(
    message: string,
    readonly numericCode: number,
    readonly stringCode: string,
  ) {
    super(message);
  }
}

type FakeState = {
  deployed: boolean;
  connected: boolean;
  synchronized: boolean;
  closed: boolean;
  createdAccounts: unknown[];
  trades: Array<{ method: string; args: unknown[] }>;
  reject?: FakeTradeError;
  positions: MetaApiPosition[];
  /** Ticket the fake reports for a partial close, standing in for MT4. */
  partialCloseRemainder?: string;
};

function makeSdk(overrides: Partial<FakeState> = {}) {
  const state: FakeState = {
    deployed: false,
    connected: false,
    synchronized: false,
    closed: false,
    createdAccounts: [],
    trades: [],
    positions: [],
    ...overrides,
  };

  const info: MetaApiAccountInformation = {
    platform: "mt5",
    broker: "Fake Broker",
    currency: "USD",
    server: "Fake-Server",
    balance: 10_000,
    equity: 10_250,
    margin: 300,
    freeMargin: 9_950,
    leverage: 100,
    marginLevel: 3416,
    tradeAllowed: true,
    marginMode: "retail-netting",
    name: "Fake",
    login: 123_456,
  };

  const spec: MetaApiSymbolSpecification = {
    symbol: "XAUUSD",
    minVolume: 0.05,
    maxVolume: 30,
    volumeStep: 0.05,
    contractSize: 100,
    digits: 2,
    tradeMode: "FULL",
  };

  const respond = (positionId: string): MetaApiTradeResponse => ({
    numericCode: 10009,
    stringCode: "TRADE_RETCODE_DONE",
    message: "Request completed",
    orderId: "order-1",
    positionId,
  });

  const trade = (method: string, args: unknown[], positionId: string) => {
    state.trades.push({ method, args });
    if (state.reject) throw state.reject;
    return respond(positionId);
  };

  const connection = {
    async connect() {
      state.connected = true;
    },
    async close() {
      state.closed = true;
    },
    async waitSynchronized() {
      state.synchronized = true;
      return undefined;
    },
    async getAccountInformation() {
      return info;
    },
    async getPositions() {
      return state.positions;
    },
    async getPosition(positionId: string) {
      const found = state.positions.find((position) => String(position.id) === positionId);
      if (!found) throw new Error("position not found");
      return found;
    },
    async getSymbolSpecification(symbol: string) {
      if (symbol !== "XAUUSD") throw new Error("symbol not found");
      return spec;
    },
    async createMarketBuyOrder(
      symbol: string,
      volume: number,
      stopLoss?: number,
      takeProfit?: number,
      options?: MetaApiTradeOptions,
    ) {
      return trade("buy", [symbol, volume, stopLoss, takeProfit, options], "pos-100");
    },
    async createMarketSellOrder(
      symbol: string,
      volume: number,
      stopLoss?: number,
      takeProfit?: number,
      options?: MetaApiTradeOptions,
    ) {
      return trade("sell", [symbol, volume, stopLoss, takeProfit, options], "pos-101");
    },
    async modifyPosition(positionId: string, stopLoss?: number, takeProfit?: number) {
      return trade("modify", [positionId, stopLoss, takeProfit], positionId);
    },
    async closePosition(positionId: string, options: MetaApiTradeOptions) {
      return trade("close", [positionId, options], positionId);
    },
    async closePositionPartially(positionId: string, volume: number, options: MetaApiTradeOptions) {
      return trade("closePartial", [positionId, volume, options], state.partialCloseRemainder ?? positionId);
    },
  };

  const account = {
    id: "meta-account-1",
    login: "123456",
    server: "Fake-Server",
    get state() {
      return state.deployed ? "DEPLOYED" : "CREATED";
    },
    connectionStatus: "CONNECTED",
    async deploy() {
      state.deployed = true;
    },
    async waitConnected() {},
    getRPCConnection() {
      return connection;
    },
  };

  const Sdk = class {
    constructor(
      readonly token: string,
      readonly opts?: Record<string, unknown>,
    ) {}

    metatraderAccountApi = {
      async getAccount() {
        return account;
      },
      async getAccountsWithInfiniteScrollPagination() {
        return [] as never[];
      },
      async createAccount(dto: unknown) {
        state.createdAccounts.push(dto);
        return account;
      },
    };

    close() {}
  } as unknown as MetaApiConstructor;

  return { state, Sdk, account, connection };
}

function makeProvider(sdk: ReturnType<typeof makeSdk>) {
  return new MetaApiProvider({
    token: "test-token",
    region: "london",
    connectTimeoutSeconds: 1,
    loadSdk: async () => sdk.Sdk,
  });
}

const globalForMetaApi = globalThis as unknown as {
  metaApiClient?: unknown;
  metaApiConnections?: unknown;
};

beforeEach(() => {
  // The client and its sockets are cached on globalThis so they survive a hot
  // reload; each test needs its own fake instead.
  globalForMetaApi.metaApiClient = undefined;
  globalForMetaApi.metaApiConnections = undefined;
});

describe("configuration", () => {
  it("refuses to start without a token", () => {
    expect(() => new MetaApiProvider({ token: "", region: "london" })).toThrow(/METAAPI_TOKEN/);
  });

  it("serves both platforms", () => {
    const provider = new MetaApiProvider({ token: "t", region: "london" });
    expect(provider.supportedPlatforms).toEqual(["MT4", "MT5"]);
  });
});

describe("connecting an account", () => {
  it("creates, deploys and synchronises the account, and reports the netting mode", async () => {
    const sdk = makeSdk();
    const result = await makeProvider(sdk).connectAccount({
      accountId: "acc-1",
      platform: "MT5",
      login: "123456",
      server: "Fake-Server",
      broker: "Fake Broker",
      password: "brokerpassword",
    });

    expect(result.providerAccountId).toBe("meta-account-1");
    expect(sdk.state.deployed).toBe(true);
    expect(sdk.state.connected).toBe(true);
    expect(sdk.state.synchronized).toBe(true);

    // A trading call before the terminal reached the broker would fail as a
    // connection error rather than say the account is still starting.
    expect(result.balance).toBe(10_000);
    expect(result.currency).toBe("USD");
    expect(result.positionMode).toBe("NETTING");

    // magic 0 keeps the member's own manual trades out of our way.
    expect(sdk.state.createdAccounts).toHaveLength(1);
    expect(sdk.state.createdAccounts[0]).toMatchObject({ magic: 0, platform: "mt5", login: "123456" });
  });

  it("reports MT4 as hedging whatever the margin mode says", async () => {
    const sdk = makeSdk();
    const result = await makeProvider(sdk).connectAccount({
      accountId: "acc-1",
      platform: "MT4",
      login: "123456",
      server: "Fake-Server",
      broker: "Fake Broker",
      password: "brokerpassword",
    });

    expect(result.positionMode).toBe("HEDGING");
  });

  it("requires a password", async () => {
    const sdk = makeSdk();
    await expect(
      makeProvider(sdk).connectAccount({
        accountId: "acc-1",
        platform: "MT5",
        login: "123456",
        server: "Fake-Server",
        broker: "Fake Broker",
        password: "",
      }),
    ).rejects.toThrow(/Password/);
  });
});

describe("reading state", () => {
  it("maps positions, and reads the correlation id back out of clientId", async () => {
    const sdk = makeSdk({
      positions: [
        {
          id: 4_711,
          type: "POSITION_TYPE_SELL",
          symbol: "XAUUSD",
          time: "2026-08-23T10:00:00.000Z",
          openPrice: 3345.2,
          currentPrice: 3340.1,
          stopLoss: 3360,
          takeProfit: 3300,
          volume: 0.2,
          profit: 102,
          clientId: "copytrade-abc",
        },
      ],
    });

    const [position] = await makeProvider(sdk).getPositions("meta-account-1");

    expect(position.ticket).toBe("4711");
    expect(position.orderType).toBe("SELL");
    expect(position.openedAt).toBeInstanceOf(Date);
    // The copy engine recognises an order that already landed by this field,
    // so a lost clientId would mean a duplicate order on retry.
    expect(position.comment).toBe("copytrade-abc");
  });

  it("maps a symbol specification and treats a disabled symbol as untradable", async () => {
    const sdk = makeSdk();
    const provider = makeProvider(sdk);

    const spec = await provider.getSymbolSpec("meta-account-1", "XAUUSD");
    expect(spec).toMatchObject({ minLot: 0.05, maxLot: 30, lotStep: 0.05, digits: 2, tradeAllowed: true });

    // A symbol the broker does not offer is a skip, not an outage.
    expect(await provider.getSymbolSpec("meta-account-1", "NOPE")).toBeNull();
  });
});

describe("orders", () => {
  it("sends the correlation id as clientId and reports the member's own fill price", async () => {
    const sdk = makeSdk({
      positions: [
        {
          id: "pos-100",
          type: "POSITION_TYPE_BUY",
          symbol: "XAUUSD",
          time: new Date(),
          openPrice: 3346.75,
          currentPrice: 3346.9,
          volume: 0.1,
          profit: 1.5,
          clientId: "copy-1",
        },
      ],
    });

    const result = await makeProvider(sdk).openPosition("meta-account-1", {
      symbol: "XAUUSD",
      orderType: "BUY",
      volume: 0.1,
      sl: 3330,
      tp: 3380,
      slippagePoints: 20,
      clientId: "copy-1",
    });

    expect(result.executed).toBe(true);
    expect(result.ticket).toBe("pos-100");
    // Recorded from the member's own position, not from the master's price.
    expect(result.price).toBe(3346.75);

    const sent = sdk.state.trades[0];
    expect(sent.method).toBe("buy");
    expect(sent.args.slice(0, 4)).toEqual(["XAUUSD", 0.1, 3330, 3380]);
    // comment + clientId may not exceed 26 characters, so only clientId is set.
    expect(sent.args[4]).toEqual({ clientId: "copy-1", slippage: 20 });
  });

  it("reports a rejected order as not executed, with a mapped error code", async () => {
    const sdk = makeSdk({
      reject: new FakeTradeError("Not enough money", 10_019, "TRADE_RETCODE_NO_MONEY"),
    });

    const result = await makeProvider(sdk).openPosition("meta-account-1", {
      symbol: "XAUUSD",
      orderType: "BUY",
      volume: 5,
      clientId: "copy-2",
    });

    // The SDK throws for every non-success code; treating "no exception" as
    // success is the whole point of this path.
    expect(result.executed).toBe(false);
    expect(result.errorCode).toBe("INSUFFICIENT_MARGIN");
    expect(result.ticket).toBeUndefined();
  });

  it("maps a rejection by numeric code when the string code is unknown", async () => {
    const sdk = makeSdk({ reject: new FakeTradeError("Market closed", 132, "ERR_SOMETHING_NEW") });

    const result = await makeProvider(sdk).closePosition("meta-account-1", { ticket: "pos-1" });

    expect(result.executed).toBe(false);
    expect(result.errorCode).toBe("MARKET_CLOSED");
  });

  it("keeps the closed ticket and records the MT4 remainder ticket on a partial close", async () => {
    const sdk = makeSdk({ partialCloseRemainder: "pos-900" });

    const result = await makeProvider(sdk).closePosition("meta-account-1", { ticket: "pos-1", volume: 0.05 });

    expect(result.executed).toBe(true);
    expect(result.ticket).toBe("pos-1");
    // MT4 issues a new ticket for what is left; the mapping is remapped onto it.
    expect(result.remainderTicket).toBe("pos-900");
    expect(result.volume).toBe(0.05);
  });

  it("leaves no remainder ticket when the platform closes in place", async () => {
    const sdk = makeSdk();

    const result = await makeProvider(sdk).closePosition("meta-account-1", { ticket: "pos-1", volume: 0.05 });

    expect(result.executed).toBe(true);
    expect(result.remainderTicket).toBeUndefined();
  });

  it("throws rather than reporting a failed order when the connection breaks", async () => {
    const sdk = makeSdk();
    const provider = makeProvider(sdk);
    await provider.getAccountInfo("meta-account-1");

    // A socket failure is not a broker rejection: the queue must retry it
    // instead of recording the copy as FAILED.
    sdk.state.reject = undefined;
    const connection = sdk.connection as unknown as { createMarketBuyOrder: () => Promise<never> };
    connection.createMarketBuyOrder = async () => {
      throw new Error("socket hang up");
    };

    await expect(
      provider.openPosition("meta-account-1", {
        symbol: "XAUUSD",
        orderType: "BUY",
        volume: 0.1,
        clientId: "copy-3",
      }),
    ).rejects.toThrow(/MetaApi connection failed/);
  });
});

describe("disconnecting", () => {
  it("closes the socket but leaves the MetaApi account deployed", async () => {
    const sdk = makeSdk();
    const provider = makeProvider(sdk);

    await provider.getAccountInfo("meta-account-1");
    await provider.disconnectAccount("meta-account-1");

    expect(sdk.state.closed).toBe(true);
    // Undeploying is a provisioning decision with a billing effect, and other
    // subscriptions may still be trading on this terminal.
    expect(sdk.state.deployed).toBe(true);
  });
});
