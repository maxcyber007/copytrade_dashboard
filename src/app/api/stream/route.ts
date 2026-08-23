import { requireUser } from "@/lib/auth/session";
import { subscribeUserEvents, type LiveEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

/**
 * Server-sent events for the signed-in member.
 *
 * SSE rather than WebSockets: the traffic is one-way, it survives ordinary HTTP
 * proxies, and the browser reconnects on its own. A member only ever receives
 * their own channel — the user id comes from the session, never the request.
 */
export async function GET(request: Request) {
  const user = await requireUser();

  let unsubscribe: (() => Promise<void>) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (event: LiveEvent) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // The client went away between the check and the write.
        }
      };

      send({ type: "PING", at: new Date().toISOString() });
      unsubscribe = subscribeUserEvents(user.id, send);

      // Keeps proxies from closing an idle connection.
      heartbeat = setInterval(() => send({ type: "PING", at: new Date().toISOString() }), HEARTBEAT_MS);

      request.signal.addEventListener("abort", () => {
        if (heartbeat) clearInterval(heartbeat);
        void unsubscribe?.();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      void unsubscribe?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Nginx buffers responses by default, which would hold events back.
      "X-Accel-Buffering": "no",
    },
  });
}
