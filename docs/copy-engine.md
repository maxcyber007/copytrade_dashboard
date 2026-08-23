# Copy engine

```
Master EA
   │  POST /api/master/events   (API key + HMAC + timestamp + eventId)
   ▼
Trade Event API ──► TradeEvent  (eventId UNIQUE)
   │                    │
   │                    ▼
   │              BullMQ copy queue      jobId = eventId
   ▼                    │
 202 Accepted           ▼
                   Copy worker (own process, concurrency 5)
                        │
        ┌───────────────┼────────────────┬──────────────────┐
        ▼               ▼                ▼                  ▼
  Symbol mapping   Lot calculator    Risk engine      ITradeProvider
        │               │                │                  │
        └───────────────┴────────────────┴──────────────────┘
                        ▼
              CopyTrade + PositionMapping
```

## Accepting an event

`POST /api/master/events` verifies four things before the body is even parsed,
because a forged event moves member money:

| Guard | Failure |
|---|---|
| `X-Api-Key` resolves to a live, unrevoked `StrategyApiKey` | 401 |
| `X-Signature` = `HMAC_SHA256(secret, "<timestamp>.<raw body>")`, compared in constant time | 401 `INVALID_SIGNATURE` |
| `X-Timestamp` within `MASTER_EVENT_MAX_SKEW_SECONDS` | 400 `STALE_REQUEST` |
| `eventId` not seen before (Redis nonce, then the unique index) | 200 `DUPLICATE` |

The signature covers the **raw** body. Verifying a re-serialised object would
prove nothing about what was actually sent.

**The key decides the strategy**, not the payload: a provider's key can only ever
write into that provider's strategy. The platform-wide `MASTER_API_KEY` is
accepted only for `PLATFORM`-owned strategies.

The endpoint stores the event and returns `202` — it never waits for member
execution. A duplicate returns `200` with `status: "DUPLICATE"`, because retrying
is the correct behaviour for an EA that did not see a response.

## Fan-out

The worker loads subscriptions that are `ACTIVE`, `COPYING`, and whose account is
`CONNECTED`, then for each member:

1. **Establish a provider session.** Sessions live in the provider client, not the
   database, so the worker — a different process — may hold none. It reconnects
   from the stored credentials instead of failing the copy.
2. **Create the `CopyTrade` row first.** This is the idempotency lock: the unique
   `(eventId, accountId)` constraint means a duplicate insert proves the work is
   already done or in flight, and **no order is sent**.
3. **Resolve the symbol** (account → strategy → global mapping).
4. **Size the trade** with the lot calculator, clamped to the member's bounds,
   then the broker's, then rounded **down** to the broker's step.
5. **Ask the risk engine.** A breach either skips this trade or pauses copying.
6. **Send the order** and record the request, the provider response, the broker
   ticket, the latency and the execution status.
7. **Write the `PositionMapping`** so a later MODIFY or CLOSE resolves.

## Lot calculation

| Mode | Formula |
|---|---|
| `FIXED` | `fixedLot` |
| `MULTIPLIER` | `masterVolume × multiplier` |
| `BALANCE_RATIO` | `masterVolume × (memberBalance ÷ masterBalance) × balanceRatio` |
| `RISK_PERCENT` | volume such that the distance to the stop risks `riskPercent` of equity |

Every mode ends the same way: clamp to `[minLot, maxLot]`, then to the broker's
`[brokerMinLot, brokerMaxLot]`, then round down to `brokerLotStep`. Rounding down
matters — rounding up could push a member past their own maximum.

Two modes refuse rather than guess: `BALANCE_RATIO` without a reported master
balance, and `RISK_PERCENT` without a stop loss. If rounding leaves less than the
broker minimum, the copy is skipped as `INVALID_VOLUME` instead of sending an
order the broker would reject.

## Risk engine

Pure functions over a snapshot, so they are exhaustively unit-tested and reusable
by any pre-trade check. Zero means *disabled* for every limit.

**Per-trade skips:** direction filters, pending-order opt-in, allowed symbols,
max open trades, max lot per trade, max total exposure.

**Account breaches** — these pause copying, notify the member and record
`RiskState.breached`: maximum daily loss (absolute or percent) and maximum
drawdown from peak equity. Copying stays paused until the member restarts it;
the engine never re-arms itself.

## Modify, close and partial close

A MODIFY or CLOSE resolves through `PositionMapping (accountId, masterTicket)`.
A member with no mapping — they subscribed after the position opened — is skipped,
never guessed at.

**Partial closes are proportional, and the fraction is computed at ingest.** The
event carries the volume the master closed, which is only meaningful against the
volume that was open before it. The worker runs later, by which time the master
trade already holds the remainder, so `TradeEvent.closeFraction` is computed and
stored while the pre-close volume is still known. A master closing half its
position closes half of the member's, whatever size theirs is.

**MT4 remaps the ticket.** A partial close on MT4 closes the original ticket and
opens a new one for the remainder, returned as `OrderResult.remainderTicket`. The
mapping moves to the new ticket and keeps the old one in `ticketHistory`; without
that the leftover position would be orphaned.

## Retries

Three attempts with exponential backoff (1s, 2s, 4s). The job id is the event id,
so the queue holds one job per event. Two things make a retry safe:

- The `CopyTrade` row already exists, so a retry cannot create a second copy.
- Before opening, the worker reads live positions and looks for one carrying this
  copy's id as its comment. If the previous attempt did land, the result is
  recorded as a success instead of sending a second order.

## Success

**An HTTP 200 from a provider is not a fill.** A copy is `SUCCESS` only when the
provider returns `executed: true` with a broker ticket. Anything else is `FAILED`
with an error code, `RETRYING` while attempts remain, or `SKIPPED` with a reason
the member can read.

## Demo mode

```bash
npm run demo
```

Signs a master event exactly as an EA would and drives OPEN → MODIFY →
PARTIAL_CLOSE → CLOSE through the whole chain, including a replayed event, a
forged signature and a stale timestamp. Requires the app and `npm run worker`.
