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

**`MetaApiProvider` (Phase 11)** — MetaApi serves both MT4 and MT5 accounts. It will
be written against the official documentation as it stands at implementation time;
no method names or payload shapes are assumed in advance, and nothing in the
codebase depends on them today.

Selection is by `TRADING_PROVIDER` (`mock` | `metaapi`) through a factory, so
switching providers is a configuration change. `supportedPlatforms` lets the account
service reject a platform a configured provider cannot serve
(`PLATFORM_NOT_SUPPORTED`) instead of failing at order time.

## Credential handling

The provider layer is the only code that ever handles credentials. They are
encrypted at rest with AES-256-GCM (`ENCRYPTION_KEY`), decrypted only in memory when
a connection is established, never logged, never sent to the frontend, and never
returned by any API response.
