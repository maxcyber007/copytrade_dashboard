# Copy engine (Phase 8–9 design)

```
Master EA --> POST /api/master/events --> TradeEvent (unique eventId)
                                            |
                                     BullMQ copy queue
                                            |
                                       Copy worker
                                            |
                    +-----------------------+------------------------+
                    |                       |                        |
             Copy settings            Risk engine            Symbol mapping
                    |                       |                        |
                    +----------> ITradeProvider.openPosition --------+
                                            |
                                CopyTrade + PositionMapping
```

## Worker steps

1. Load the event; stop if it is already `PROCESSED`.
2. Load active subscriptions for the strategy whose account is `CONNECTED` and whose
   copy status is `COPYING`.
3. For each subscription, create the `CopyTrade` row first, inside the
   `(eventId, accountId)` unique constraint. A duplicate insert means the work is
   already done or in flight — the job stops there instead of sending an order.
4. Resolve the member symbol via symbol mapping; `SKIPPED` with `INVALID_SYMBOL` if
   there is no mapping and the raw symbol is unknown to the account.
5. Calculate volume (below), clamp to the member's copy settings and then to the
   broker's own `brokerMinLot` / `brokerMaxLot` / `brokerLotStep`, which differ
   between an MT4 and an MT5 broker.
6. Ask the risk engine; a breach records `SKIPPED` with `RISK_LIMIT_REACHED` and,
   when configured, pauses copying for that subscription.
7. Send the order through `ITradeProvider` and store request, response, provider
   ticket, latency and execution status.
8. On success write the `PositionMapping` so later MODIFY/CLOSE events resolve.

## Lot calculation

| Mode | Formula |
|---|---|
| `FIXED` | `fixedLot` |
| `MULTIPLIER` | `masterVolume * multiplier` |
| `BALANCE_RATIO` | `masterVolume * (memberBalance / masterBalance) * balanceRatio` |
| `RISK_PERCENT` | volume such that the distance to SL risks `riskPercent` of member equity |

The result is always clamped to `[minLot, maxLot]` and rounded down to the broker's
lot step. `RISK_PERCENT` requires a stop loss; without one the trade is skipped
rather than sized on a guess.

## Retry

Three attempts with exponential backoff (1s, 2s, 4s). Before every retry the worker
re-reads live positions from the provider: if a position matching this
`(eventId, accountId)` already exists, the attempt is recorded as success instead of
sending a second order. This is what makes a retry safe on a real money account.

## Success definition

An HTTP 200 from a provider is not a fill. A copy counts as `SUCCESS` only when the
provider returns an execution result carrying a broker ticket. Anything else is
`FAILED` with an error code, or `RETRYING` while attempts remain.

## Position and symbol resolution

`PositionMapping` is keyed on `(accountId, masterTicket)`. A `MODIFY` event looks up
each member's ticket through it before sending a modification; a member with no
mapping (they subscribed after the position opened) is skipped, not guessed at.

## MT4 and MT5 members on the same strategy

The strategy's master may run on either platform, and members of both platforms can
subscribe to it. Two platform differences reach the engine:

**MT4 partial close remaps the ticket.** MT4 closes the original ticket and opens a
new one for the remaining volume. On a `PARTIAL_CLOSE`, the engine reads
`OrderResult.remainderTicket`, moves the old id into `PositionMapping.ticketHistory`
and stores the new one as `memberTicket`, so the next `MODIFY` or `CLOSE` still
resolves. Without this the remainder would be orphaned on the member account.

**MT5 netting merges positions.** On a netting account the broker keeps one net
position per symbol, so a second copied order on the same symbol does not create a
second ticket. The worker reads `TradingAccount.positionMode` first: for netting
accounts a close is sent *by volume* against the net position instead of by ticket,
and the mapping records the net position's ticket. MT4 accounts are always hedging,
so the by-ticket path always applies there.

Volume is clamped per account, so an MT4 broker with a 0.1 lot step and an MT5
broker with a 0.01 step both receive a volume they can actually fill.
