import Database from "better-sqlite3";
import type { Position } from "./types.js";

export function createDb(path = "yieldseeker.sqlite") {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS position (id INTEGER PRIMARY KEY CHECK (id=1), poolId TEXT, amount TEXT);
    CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, kind TEXT, message TEXT, meta TEXT);
    CREATE TABLE IF NOT EXISTS rebalances (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, amount TEXT);
  `);

  return {
    setPosition(p: Position) {
      db.prepare(`INSERT INTO position (id,poolId,amount) VALUES (1,?,?)
                  ON CONFLICT(id) DO UPDATE SET poolId=excluded.poolId, amount=excluded.amount`)
        .run(p.poolId, p.amountUsdc.toString());
    },
    getPosition(): Position {
      const row = db.prepare(`SELECT poolId, amount FROM position WHERE id=1`).get() as any;
      if (!row) return { poolId: null, amountUsdc: 0n };
      return { poolId: row.poolId, amountUsdc: BigInt(row.amount) };
    },
    log(kind: string, message: string, meta?: unknown, now = Math.floor(Date.now() / 1000)) {
      db.prepare(`INSERT INTO activity (ts,kind,message,meta) VALUES (?,?,?,?)`)
        .run(now, kind, message, meta ? JSON.stringify(meta) : null);
    },
    recentLog(limit = 50) {
      return db.prepare(`SELECT ts,kind,message,meta FROM activity ORDER BY id DESC LIMIT ?`)
        .all(limit) as { ts: number; kind: string; message: string; meta: string | null }[];
    },
    recordRebalance(amount: bigint, now = Math.floor(Date.now() / 1000)) {
      db.prepare(`INSERT INTO rebalances (ts,amount) VALUES (?,?)`).run(now, amount.toString());
    },
    rebalancedSince(sinceTs: number): bigint {
      const rows = db.prepare(`SELECT amount FROM rebalances WHERE ts >= ?`).all(sinceTs) as { amount: string }[];
      return rows.reduce((s, r) => s + BigInt(r.amount), 0n);
    },
  };
}
export type Db = ReturnType<typeof createDb>;
