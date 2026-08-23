# Trading provider layer (MT4 + MT5)

Business logic never imports a vendor SDK. It depends on one interface,
`src/providers/trading/ITradeProvider.ts`:

```ts
interface ITradeProvider {
  readonly supportedPlatforms: readonly Platform[]; // MT4, MT5

  connectAccount(input): Promise<ConnectionResult>;
  disconnectAccount(providerAccountId): Promise<void>;
  getAccountInfo(providerAccountId): Promise<AccountInfo>;
  getPositions(providerAccountId): Promise<ProviderPosition[]>;
  getSymbolSpec(providerAccountId, symbol): Promise<SymbolSpec | null>;
  openPosition(providerAccountId, request): Promise<OrderResult>;
  modifyPosition(providerAccountId, request): Promise<OrderResult>;
  closePosition(providerAccountId, request): Promise<OrderResult>;
}
```

**The platform is a property of the account, not of the code path.** There is no
separate MT4 service and MT5 service in the business layer: a member's
`TradingAccount.platform` decides which behaviour the provider applies, and every
result comes back in the same shape.

## Platform differences the provider must absorb

| Concern | MT4 | MT5 | Handled by |
|---|---|---|---|
| Position model | Hedging only — every order is its own ticket | Hedging **or netting**, per broker | `TradingAccount.positionMode`, set on connect |
| Partial close | Closes the ticket and opens a **new ticket** for the remainder | Keeps the same position ticket | `OrderResult.remainderTicket` → `PositionMapping.memberTicket` remap, superseded ids kept in `ticketHistory` |
| Volume rules | Broker min/max/step | Broker min/max/step | `brokerMinLot`, `brokerMaxLot`, `brokerLotStep`, read on connect |
| Symbol names | Broker suffixes (`XAUUSD`, `GOLD`) | Broker suffixes (`XAUUSD.a`, `XAUUSDm`) | `SymbolMapping`, scoped global → strategy → account |
| Order types | BUY/SELL + 4 pending types | Same set | Shared `OrderType` enum |

**Netting is the case to be careful with.** On a netting MT5 account the broker
keeps one net position per symbol, so a second copied order on the same symbol
merges into the existing position instead of creating a second ticket. The copy
worker reads `positionMode` before mapping tickets: for netting accounts a close
event closes *by volume* against the net position rather than by ticket, and the
mapping row records the net position's ticket.

A master on one platform can be copied to members on the other — nothing in the
schema ties a strategy's `masterPlatform` to a member's `platform`.

## Implementations

**`MockTradingProvider` (default)** — an in-memory broker simulation covering both
platforms. It is not a stub: it reproduces the behaviour that breaks naive copy
implementations, and the unit tests assert each one.

- MT4 keeps same-symbol orders as separate tickets, and a partial close closes the
  original ticket and returns a **new** `remainderTicket` for what is left.
- A netting MT5 account merges a same-symbol order into the open position and
  returns the **same** ticket, so mapping by ticket alone would point two copies at
  one position.
- MT4 accounts report a coarser lot step than MT5 ones, so volume clamping is
  exercised on both.
- Orders are rejected with real error codes (`INVALID_SYMBOL`, `INVALID_VOLUME`,
  `POSITION_NOT_FOUND`) rather than throwing, and a login ending in `0000` is
  refused at connect so the failure path is testable.
- Prices drift with the clock, so dashboards show movement without a live feed.

No real money can move through it, which is what makes the whole system testable
before a broker is involved.

**`MetaApiProvider` (Phase 11)** — the production adapter. MetaApi serves both MT4
and MT5 accounts. It is written against the official `metaapi.cloud-sdk` typings,
which are mirrored in `src/providers/trading/metaapi-sdk.ts`; every field name used
comes from there, and nothing is assumed.

### Installing the SDK

The SDK is an **optional dependency** — around 47 MB that a deployment running the
mock has no use for. A deployment that sets `TRADING_PROVIDER=metaapi` installs it
explicitly:

```bash
npm install metaapi.cloud-sdk
```

It is loaded through a dynamic import on first use. If it is missing, the provider
fails with a message naming the install command rather than at order time.

### What the adapter does

| Interface method | MetaApi call |
| --- | --- |
| `connectAccount` | reuse the account matching this login and server, else `createAccount` (`magic: 0`), then `deploy()`, `waitConnected()`, `getRPCConnection()`, `connect()`, `waitSynchronized()` |
| `getAccountInfo` | `getAccountInformation()` |
| `getPositions` | `getPositions()` |
| `getSymbolSpec` | `getSymbolSpecification(symbol)` — a symbol the broker does not offer returns `null`, which the copy engine treats as a skip |
| `openPosition` | `createMarketBuyOrder` / `createMarketSellOrder`, then `getPosition` to record the member's own fill price |
| `modifyPosition` | `modifyPosition(positionId, sl, tp)` |
| `closePosition` | `closePosition` or, with a volume, `closePositionPartially` |
| `disconnectAccount` | closes the socket only — the MetaApi account stays deployed |

Four details decide whether a copy is correct, and each is easy to get wrong:

- **A rejected order is thrown, not returned.** The SDK returns the response only
  for the success codes (`ERR_NO_ERROR`, `TRADE_RETCODE_PLACED`,
  `TRADE_RETCODE_DONE`, `TRADE_RETCODE_DONE_PARTIAL`, `TRADE_RETCODE_NO_CHANGES`)
  and throws `TradeError` for everything else. A returned response *is* the fill;
  no HTTP status is ever read as success. Rejections become
  `executed: false` with a mapped `errorCode` (recorded as FAILED, not retried);
  socket and timeout failures are thrown so the queue retries them.
- **`comment` + `clientId` may not exceed 26 characters.** The copy correlation id
  travels as `clientId` alone and is read back into `ProviderPosition.comment`,
  which is where the copy engine looks for an order that already landed. Losing it
  would mean a duplicate order on retry.
- **A partial close can answer with a different ticket.** On MT4 that is the
  remainder, returned as `remainderTicket` so the position mapping is remapped
  onto it instead of pointing at a ticket that no longer exists.
- **Volume limits are per symbol, not per account.** `connectAccount` reports a
  permissive account-level floor (0.01 / 100 / 0.01); the per-symbol specification
  is the authority, and the copy engine takes the stricter of the two.

### Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `METAAPI_TOKEN` | — | required when `TRADING_PROVIDER=metaapi`; the app refuses to start without it |
| `METAAPI_REGION` | `new-york` | one of the regions MetaApi lists for your account |
| `METAAPI_ACCOUNT_TYPE` | `cloud-g2` | MetaApi's own default — "faster and cheaper" than `cloud-g1` |
| `METAAPI_RELIABILITY` | `regular` | `high` is a **paid** option billed at two resource slots; asking for it on a subscription that does not include it fails account creation |

A failed MetaApi call is reported with its HTTP status and, for a validation
failure, the `details` object naming the field it rejected — the `message` alone
is often just a request id. Anything credential-shaped in those details is
redacted before it reaches a log, because a rejected `createAccount` echoes back
the payload, and that payload carries the member's trading password.

Error codes are mapped from `stringCode` first (identical on MT4 and MT5), then
from `numericCode` — MT5 trade return codes (10004–10040) and MT4 error codes
(129–148) occupy disjoint ranges, so one table serves both.

### Verifying it

`tests/unit/metaapi-provider.test.ts` exercises the adapter against a fake SDK that
reproduces the thrown rejection and the MT4 remainder ticket. That proves the
mapping, not the broker. Before trading real money, run it against a **demo**
account with your own token:

```bash
npm install metaapi.cloud-sdk
TRADING_PROVIDER=metaapi METAAPI_TOKEN=... METAAPI_REGION=new-york npm run dev
```

then connect a demo account in the dashboard and copy one trade end to end. This
container has no egress to `metaapi.cloud`, so that step belongs to the operator.

Selection is by `TRADING_PROVIDER` (`mock` | `metaapi`) through a factory, so
switching providers is a configuration change. `supportedPlatforms` lets the account
service reject a platform a configured provider cannot serve
(`PLATFORM_NOT_SUPPORTED`) instead of failing at order time.

## Credential handling

The provider layer is the only code that ever handles credentials. They are
encrypted at rest with AES-256-GCM (`ENCRYPTION_KEY`), decrypted only in memory when
a connection is established, never logged, never sent to the frontend, and never
returned by any API response.
