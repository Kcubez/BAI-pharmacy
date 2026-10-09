import { auth } from "@/lib/auth";
import { subscribeLocal, upstash, type BusEvent } from "@/lib/upstash";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
// Hobby cap is 300s — stop just under it; EventSource reconnects silently.
export const maxDuration = 280;

// GET /api/events — Server-Sent Events stream for live dashboard updates.
// Auth via session cookie (Better Auth). Query: ?since=<ms epoch> for
// missed-event catch-up after reconnects.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = session.user.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string, event = "message") => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch {
          // client disconnected
        }
      };
      const onEvent = (e: BusEvent) => {
        send(JSON.stringify(e), "data-changed");
      };

      // Local subscribers (dev / same-instance delivery).
      const unsubLocal = subscribeLocal(userId, onEvent);

      // Redis inbox drain (production — instances don't share memory).
      // Producers LPUSH rare events; each drain is ~1 command when empty.
      const r = upstash();
      const drainInbox = async () => {
        if (!r || closed) return;
        try {
          for (let i = 0; i < 10; i++) {
            const msg = await r.rpop<string>(`bai:inbox:${userId}`);
            if (!msg) break;
            try {
              onEvent(JSON.parse(msg) as BusEvent);
            } catch {
              // malformed payload — drop
            }
          }
        } catch {
          // Redis unreachable — local delivery still works same-instance
        }
      };

      let closed = false;
      // Heartbeat keeps proxies/load-balancers from idling the stream out.
      // Each tick also drains the Redis inbox (cross-instance delivery).
      const heartbeat = setInterval(() => {
        send("ping", "ping");
        void drainInbox();
      }, 25_000);
      // Catch up on anything published while disconnected, then start.
      await drainInbox();
      // Hard stop under the Hobby 300s cap — client reconnects silently.
      const cap = setTimeout(() => cleanup(), 280_000);

      const cleanup = () => {
        closed = true;
        clearInterval(heartbeat);
        clearTimeout(cap);
        unsubLocal();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
