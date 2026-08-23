# Background jobs

Two recurring jobs run in the worker process alongside the copy queue. They are
registered with `upsertJobScheduler`, keyed by name, so restarting the worker —
or running several of them — reuses the one schedule instead of stacking copies.

| Job | Default cadence | What it does |
|---|---|---|
| `account-sync` | `SYNC_INTERVAL_SECONDS` (60s) | Reconciles every connected account with its broker |
| `strategy-stats` | `STATS_INTERVAL_SECONDS` (300s) | Recomputes the figures shown in the marketplace |

## Why reconciliation exists

Trade events describe **the master**. They say nothing about what happened to a
member's own position afterwards: a stop loss firing, a take profit hitting, or
the member closing by hand all happen at the broker with no event reaching the
platform.

Without the sweep, `PositionMapping` rows stay `OPEN` forever, `openTrades`
drifts upward, and the risk engine's "maximum open trades" check counts
positions that closed hours ago.

Each pass, per account:

1. Re-establishes a provider session if this process has none.
2. Reads account info and live positions.
3. Marks every mapping whose ticket the broker no longer reports as `CLOSED`.
4. Writes balance, equity, margin, floating P/L, peak equity and **the broker's
   own open-position count** — the broker is the authority, not our running total.
5. Publishes `ACCOUNT_UPDATED` when something actually changed, so an open
   dashboard updates without a reload.

**An account that cannot be reached is marked `ERROR` with the reason.** Leaving
it `CONNECTED` would show the member stale numbers and make the copy engine
attempt an order on it for every master event. `ERROR` accounts stay in the
sweep, so a broker outage or an expired session heals itself once the account
answers again — the member does not have to reconnect by hand.

## Strategy statistics

Return, win rate, drawdown, trade count and subscriber count are recomputed from
**closed master trades whose profit the EA actually reported**.

Nothing is inferred from open and close prices: contract size, swap and
commission are not ours to guess, and a wrong return figure is worse than none
because members choose a strategy by it. A strategy with trades but no reported
profit shows a trade count and zeros, not an estimate.

The return is an equity curve from a notional 100, so strategies are comparable
without publishing the master's balance. Provider subscriber counts are
**distinct members**, so one person following two of a provider's strategies is
one subscriber.

## Running them

```bash
npm run worker        # copy queue + both scheduled jobs
npm run worker:dev    # same, reloading on change
```

Both live in the worker service in `docker-compose.yml`. Scale it with
`--scale worker=N`: the copy queue distributes, and the schedulers deduplicate.
