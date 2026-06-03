import type { Position } from "./types";
import { getCollection } from "./mongo";

/**
 * Async, MongoDB-backed state for the SHARED agent (the single legacy position,
 * the activity log, the rebalance ledger, and the cross-instance KV cache used
 * for scan snapshots / decisions / pool discovery).
 *
 * WHY async + Mongo (was sync better-sqlite3): on Vercel the filesystem is
 * read-only and nothing is shared across function invocations, so a local
 * SQLite file cannot hold state. Mongo is an external store every invocation can
 * reach. The trade-off is that every method is now a Promise — callers await.
 *
 * `createDb()` returns the Mongo implementation when MONGODB_URI is set, and an
 * in-memory implementation otherwise (used by the test suite, which runs with no
 * connection string). Both satisfy the same {@link Db} interface.
 *
 * NOTE: the PER-USER registry (users + positions) lives in `src/lib/registry.ts`
 * (also Mongo-backed now) — not here.
 */

/** Amounts are stored as decimal strings (Mongo has no native BigInt). */
type PositionDoc = { _id: string; poolId: string | null; amount: string };
type ActivityDoc = { ts: number; seq: number; kind: string; message: string; meta: string | null };
type RebalanceDoc = { ts: number; amount: string };
type KvDoc = { _id: string; value: string };

export interface ActivityRow {
  ts: number;
  kind: string;
  message: string;
  meta: string | null;
}

export interface Db {
  setPosition(p: Position): Promise<void>;
  getPosition(): Promise<Position>;
  log(kind: string, message: string, meta?: unknown, now?: number): Promise<void>;
  recentLog(limit?: number): Promise<ActivityRow[]>;
  recordRebalance(amount: bigint, now?: number): Promise<void>;
  rebalancedSince(sinceTs: number): Promise<bigint>;
  setKV(key: string, value: string): Promise<void>;
  getKV(key: string): Promise<string | null>;
}

const POSITION_ID = "singleton";
const nowSec = () => Math.floor(Date.now() / 1000);

// ── Mongo implementation ──────────────────────────────────────────────────────

function createMongoDb(): Db {
  // A process-wide monotonic counter so logs written within the same wall-clock
  // second still order deterministically (ts has 1s granularity).
  let seq = 0;
  return {
    async setPosition(p: Position) {
      const coll = await getCollection<PositionDoc>("position");
      await coll.updateOne(
        { _id: POSITION_ID },
        { $set: { poolId: p.poolId, amount: p.amountUsdc.toString() } },
        { upsert: true },
      );
    },
    async getPosition(): Promise<Position> {
      const coll = await getCollection<PositionDoc>("position");
      const row = await coll.findOne({ _id: POSITION_ID });
      if (!row) return { poolId: null, amountUsdc: 0n };
      return { poolId: row.poolId, amountUsdc: BigInt(row.amount) };
    },
    async log(kind, message, meta, now = nowSec()) {
      const coll = await getCollection<ActivityDoc>("activity");
      await coll.insertOne({
        ts: now,
        seq: seq++,
        kind,
        message,
        meta: meta != null ? JSON.stringify(meta) : null,
      });
    },
    async recentLog(limit = 50): Promise<ActivityRow[]> {
      const coll = await getCollection<ActivityDoc>("activity");
      const rows = await coll
        .find({}, { projection: { _id: 0, ts: 1, kind: 1, message: 1, meta: 1 } })
        .sort({ ts: -1, seq: -1 })
        .limit(limit)
        .toArray();
      return rows.map((r) => ({ ts: r.ts, kind: r.kind, message: r.message, meta: r.meta }));
    },
    async recordRebalance(amount, now = nowSec()) {
      const coll = await getCollection<RebalanceDoc>("rebalances");
      await coll.insertOne({ ts: now, amount: amount.toString() });
    },
    async rebalancedSince(sinceTs): Promise<bigint> {
      const coll = await getCollection<RebalanceDoc>("rebalances");
      const rows = await coll.find({ ts: { $gte: sinceTs } }).toArray();
      return rows.reduce((s, r) => s + BigInt(r.amount), 0n);
    },
    async setKV(key, value) {
      const coll = await getCollection<KvDoc>("kv");
      await coll.updateOne({ _id: key }, { $set: { value } }, { upsert: true });
    },
    async getKV(key): Promise<string | null> {
      const coll = await getCollection<KvDoc>("kv");
      const row = await coll.findOne({ _id: key });
      return row ? row.value : null;
    },
  };
}

// ── In-memory implementation (tests / no MONGODB_URI) ─────────────────────────

export function createMemoryDb(): Db {
  let position: Position = { poolId: null, amountUsdc: 0n };
  const activity: ActivityRow[] = []; // newest pushed at the front
  const rebalances: { ts: number; amount: bigint }[] = [];
  const kv = new Map<string, string>();
  return {
    async setPosition(p) {
      position = { poolId: p.poolId, amountUsdc: p.amountUsdc };
    },
    async getPosition() {
      return { poolId: position.poolId, amountUsdc: position.amountUsdc };
    },
    async log(kind, message, meta, now = nowSec()) {
      activity.unshift({ ts: now, kind, message, meta: meta != null ? JSON.stringify(meta) : null });
    },
    async recentLog(limit = 50) {
      return activity.slice(0, limit);
    },
    async recordRebalance(amount, now = nowSec()) {
      rebalances.push({ ts: now, amount });
    },
    async rebalancedSince(sinceTs) {
      return rebalances.filter((r) => r.ts >= sinceTs).reduce((s, r) => s + r.amount, 0n);
    },
    async setKV(key, value) {
      kv.set(key, value);
    },
    async getKV(key) {
      return kv.has(key) ? kv.get(key)! : null;
    },
  };
}

/**
 * Build the state DB. Mongo-backed when MONGODB_URI is configured (prod/Vercel),
 * in-memory otherwise (the test suite + any local run without a connection
 * string). Construction is cheap and does NOT connect — the first awaited method
 * call opens the shared connection.
 */
export function createDb(): Db {
  return process.env.MONGODB_URI ? createMongoDb() : createMemoryDb();
}
