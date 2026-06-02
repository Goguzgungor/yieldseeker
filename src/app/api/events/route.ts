import { getSerializedPosition, getRecentLog } from "../../../lib/runtime";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events stream. Pushes `{ position, log }` every 2s. The interval
 * is cleaned up when the client cancels the stream (closes the connection).
 */
export async function GET() {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = () => {
        const payload = { position: getSerializedPosition(), log: getRecentLog(5) };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };
      push(); // emit immediately so a fresh client isn't blank for 2s
      timer = setInterval(push, 2000);
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
