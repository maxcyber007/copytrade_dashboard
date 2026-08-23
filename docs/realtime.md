# Real-time updates

The copy worker runs in its own process and cannot reach a browser. It publishes
to Redis; whichever web instance holds that member's connection relays the event.

```
Copy worker ──publish──► Redis  live:user:{userId} ──► Web instance ──SSE──► Browser
```

## Why server-sent events

The traffic is one-way (server → browser), SSE survives ordinary HTTP proxies,
and the browser reconnects on its own. A WebSocket would add a second protocol
and its own reconnection handling for no gain here.

`GET /api/stream` resolves the member from **the session cookie, never the
request**, so a member can only ever receive their own channel. Each connection
opens its own Redis subscriber, because a subscribed client cannot issue other
commands.

## Events

| Event | Sent when |
|---|---|
| `COPY_TRADE` | A copy succeeded or failed on the member's account |
| `RISK_BREACH` | A risk limit paused copying |
| `ACCOUNT_UPDATED` | Cached account metrics changed |
| `COPY_STATUS` | A subscription started, paused or stopped |
| `PING` | Every 25s, so idle proxies do not close the connection |

Publishing is best-effort: a failed publish is logged and never fails a trade.

## On the client

`<LiveUpdates />` subscribes and calls `router.refresh()`, so server components
re-render with fresh data. Refreshes are **debounced by 600ms** — a master
closing ten positions produces a burst, and rendering once is both cheaper and
less jarring than ten times.

Nginx buffers responses by default, which would hold events back, so the route
sets `X-Accel-Buffering: no` and the proxy config disables buffering on `/api/`.
