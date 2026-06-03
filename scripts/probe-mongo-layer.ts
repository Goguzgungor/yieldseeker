/**
 * Integration probe for the MongoDB-backed db + registry layers (the real Mongo
 * impl, not the in-memory test double). Round-trips a position, KV, activity log,
 * a rebalance, and a per-user registration, then cleans up. Run:
 *   npx tsx scripts/probe-mongo-layer.ts
 */
import "dotenv/config";
import { createDb } from "../src/lib/db";
import * as registry from "../src/lib/registry";

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI not set — would hit in-memory, not Mongo");
  const db = createDb();

  // KV round-trip
  await db.setKV("__probe", "v1");
  if ((await db.getKV("__probe")) !== "v1") throw new Error("kv round-trip failed");
  await db.setKV("__probe", "v2");
  if ((await db.getKV("__probe")) !== "v2") throw new Error("kv upsert failed");

  // position round-trip (BigInt as string)
  await db.setPosition({ poolId: "C_PROBE", amountUsdc: 1234_0000000n });
  const pos = await db.getPosition();
  if (pos.poolId !== "C_PROBE" || pos.amountUsdc !== 1234_0000000n) throw new Error("position round-trip failed");

  // activity + rebalance ledger
  await db.log("probe", "hello", { x: 1 });
  const log = await db.recentLog(3);
  if (!log.some((l) => l.message === "hello")) throw new Error("activity log failed");
  await db.recordRebalance(50n, Math.floor(Date.now() / 1000));
  if ((await db.rebalancedSince(0)) < 50n) throw new Error("rebalance ledger failed");

  // registry: register → list (sorted) → get (projection strips _id) → remove
  await registry.clearRegistry();
  await registry.registerUser({ owner: "G_PROBE_B", smartWallet: "C_SB", poolRuleId: 1, usdcRuleId: 2, createdAt: 200 });
  await registry.registerUser({ owner: "G_PROBE_A", smartWallet: "C_SA", poolRuleId: 3, usdcRuleId: 4, createdAt: 100 });
  const users = await registry.listUsers();
  if (users.map((u) => u.owner).join(",") !== "G_PROBE_A,G_PROBE_B") throw new Error("registry ordering failed");
  const a = await registry.getUser("G_PROBE_A");
  if (!a || (a as any)._id !== undefined || a.smartWallet !== "C_SA") throw new Error("getUser projection failed");
  await registry.setUserPosition("C_SA", { poolId: "C_POOL", amountUsdc: 7n });
  if ((await registry.getUserPosition("C_SA")).amountUsdc !== 7n) throw new Error("user position failed");
  const removed = await registry.clearRegistry();
  if (removed < 2) throw new Error("clearRegistry count wrong");

  console.log("OK — Mongo db + registry layer round-trips clean");
  process.exit(0);
}

main().catch((e) => {
  console.error("MONGO LAYER PROBE FAILED:", e?.message ?? e);
  process.exit(1);
});
