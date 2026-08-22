# MT5 provider layer

Business logic never imports a vendor SDK. It depends on one interface:

```ts
interface IMT5Provider {
  connectAccount(input): Promise<ConnectionResult>;
  disconnectAccount(providerAccountId): Promise<void>;
  getAccountInfo(providerAccountId): Promise<AccountInfo>;
  getPositions(providerAccountId): Promise<Position[]>;
  openPosition(providerAccountId, request): Promise<OrderResult>;
  modifyPosition(providerAccountId, request): Promise<OrderResult>;
  closePosition(providerAccountId, request): Promise<OrderResult>;
}
```

Every result carries the provider's own response and a ticket, so the caller can
distinguish "request accepted" from "order filled".

## Implementations

**`MockMT5Provider` (Phase 6, default)** — an in-memory broker simulation used for
development, demo mode and tests. It simulates latency, fills, rejections
(`MARKET_CLOSED`, `INVALID_VOLUME`, `INSUFFICIENT_MARGIN`) and position state, so the
whole copy path can be exercised without a live account or real money.

**`MetaApiProvider` (Phase 11)** — will be written against the official MetaApi
documentation as it stands at implementation time. No method names or payload shapes
are assumed in advance; nothing in the codebase depends on them.

Selection is by `MT5_PROVIDER` (`mock` | `metaapi`) through a factory, so switching
providers is a configuration change.

## Credential handling

The provider layer is the only code that ever handles credentials. They are
encrypted at rest with AES-256-GCM (`ENCRYPTION_KEY`), decrypted only in memory when
a connection is established, never logged, never sent to the frontend, and never
returned by any API response.
