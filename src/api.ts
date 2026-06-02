import Fastify from "fastify";
import type { Db } from "./db.js";

export interface SharedState { lastScan: unknown[]; }

export function createApi(db: Db, state: SharedState) {
  const app = Fastify();
  app.get("/position", async () => {
    const p = db.getPosition();
    return { poolId: p.poolId, amountUsdc: p.amountUsdc.toString() };
  });
  app.get("/scan", async () => state.lastScan);
  app.get("/activity", async () => db.recentLog(50));
  app.get("/events", (req, reply) => {
    (reply.raw as any).writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const timer = setInterval(() => {
      (reply.raw as any).write(`data: ${JSON.stringify({ position: { ...db.getPosition(), amountUsdc: db.getPosition().amountUsdc.toString() }, log: db.recentLog(5) })}\n\n`);
    }, 2000);
    (req.raw as any).on("close", () => clearInterval(timer));
  });
  return app;
}
