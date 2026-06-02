import Database from "better-sqlite3";
import type { Position, UserRegistration } from "./types";

export function createDb(path = "yieldseeker.sqlite") {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS position (id INTEGER PRIMARY KEY CHECK (id=1), poolId TEXT, amount TEXT);
    CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, kind TEXT, message TEXT, meta TEXT);
    CREATE TABLE IF NOT EXISTS rebalances (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, amount TEXT);
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    -- Per-user smart-account registry (ARMA model): one row per onboarded user.
    CREATE TABLE IF NOT EXISTS users (
      owner       TEXT PRIMARY KEY,
      smartWallet TEXT NOT NULL,
      poolRuleId  INTEGER NOT NULL,
      usdcRuleId  INTEGER NOT NULL,
      createdAt   INTEGER NOT NULL
    );
    -- Per-user position, keyed by the smart wallet contract id.
    CREATE TABLE IF NOT EXISTS positions (
      smartWallet TEXT PRIMARY KEY,
      poolId      TEXT,
      amount      TEXT NOT NULL
    );
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
    /**
     * Persist an arbitrary JSON string under `key`. Used to share scan snapshots
     * and agent decisions between the instrumentation process (agent loop) and the
     * Next.js route handlers, which may resolve separate in-memory module instances.
     */
    setKV(key: string, value: string): void {
      db.prepare(`INSERT INTO kv (key,value) VALUES (?,?)
                  ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
        .run(key, value);
    },
    /** Returns the stored value for `key`, or `null` if not yet set. */
    getKV(key: string): string | null {
      const row = db.prepare(`SELECT value FROM kv WHERE key=?`).get(key) as { value: string } | undefined;
      return row ? row.value : null;
    },

    // ── Per-user smart-account registry (ARMA model) ────────────────────────
    /**
     * Register (or upsert) a user's smart account + the two agent context-rule
     * ids. `owner` is the primary key, so re-registering the same owner updates
     * its wallet/rule ids in place. `createdAt` defaults to now (epoch seconds).
     */
    registerUser(u: UserRegistration): void {
      db.prepare(
        `INSERT INTO users (owner, smartWallet, poolRuleId, usdcRuleId, createdAt)
         VALUES (?,?,?,?,?)
         ON CONFLICT(owner) DO UPDATE SET
           smartWallet=excluded.smartWallet,
           poolRuleId=excluded.poolRuleId,
           usdcRuleId=excluded.usdcRuleId`,
      ).run(u.owner, u.smartWallet, u.poolRuleId, u.usdcRuleId, u.createdAt);
    },
    /** All registered users, oldest first (deterministic loop order). */
    listUsers(): UserRegistration[] {
      const rows = db
        .prepare(
          `SELECT owner, smartWallet, poolRuleId, usdcRuleId, createdAt
           FROM users ORDER BY createdAt ASC, owner ASC`,
        )
        .all() as UserRegistration[];
      return rows;
    },
    /** Look up one user by owner G-address, or null if not registered. */
    getUser(owner: string): UserRegistration | null {
      const row = db
        .prepare(
          `SELECT owner, smartWallet, poolRuleId, usdcRuleId, createdAt
           FROM users WHERE owner=?`,
        )
        .get(owner) as UserRegistration | undefined;
      return row ?? null;
    },

    // ── Per-user positions (keyed by smart wallet) ──────────────────────────
    /** Persist the position for a specific smart wallet (upsert). */
    setUserPosition(smartWallet: string, p: Position): void {
      db.prepare(
        `INSERT INTO positions (smartWallet, poolId, amount) VALUES (?,?,?)
         ON CONFLICT(smartWallet) DO UPDATE SET poolId=excluded.poolId, amount=excluded.amount`,
      ).run(smartWallet, p.poolId, p.amountUsdc.toString());
    },
    /** Read a smart wallet's position; idle (null pool, 0) if none stored. */
    getUserPosition(smartWallet: string): Position {
      const row = db
        .prepare(`SELECT poolId, amount FROM positions WHERE smartWallet=?`)
        .get(smartWallet) as { poolId: string | null; amount: string } | undefined;
      if (!row) return { poolId: null, amountUsdc: 0n };
      return { poolId: row.poolId, amountUsdc: BigInt(row.amount) };
    },
  };
}
export type Db = ReturnType<typeof createDb>;
