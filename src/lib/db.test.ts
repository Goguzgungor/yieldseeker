import { describe, it, expect } from "vitest";
import { createDb } from "./db";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

describe("db", () => {
  it("persists position and appends activity log", () => {
    const db = createDb(":memory:");
    db.setPosition({ poolId: "C_A", amountUsdc: 1000_0000000n });
    expect(db.getPosition()).toEqual({ poolId: "C_A", amountUsdc: 1000_0000000n });

    db.log("info", "scanned 2 pools");
    db.log("rebalance", "moved A->B", { hash: "abc" });
    const events = db.recentLog(10);
    expect(events.length).toBe(2);
    expect(events[0].message).toBe("moved A->B"); // newest first
  });

  it("sums rebalanced amount in the last 24h for daily cap", () => {
    const db = createDb(":memory:");
    db.recordRebalance(1000_0000000n, 1_000_000);
    db.recordRebalance(500_0000000n, 1_000_100);
    expect(db.rebalancedSince(0)).toBe(1500_0000000n);
  });

  it("setKV / getKV round-trips arbitrary JSON strings", () => {
    const db = createDb(":memory:");
    // Not yet set → null
    expect(db.getKV("lastScan")).toBeNull();

    // Write a JSON array (simulating scan snapshot)
    const snapshot = JSON.stringify([{ poolId: "C_POOL", apyBps: 860 }]);
    db.setKV("lastScan", snapshot);
    expect(db.getKV("lastScan")).toBe(snapshot);

    // Overwrite (upsert) with a new value
    const updated = JSON.stringify([{ poolId: "C_POOL", apyBps: 900 }]);
    db.setKV("lastScan", updated);
    expect(db.getKV("lastScan")).toBe(updated);

    // Independent key is unaffected
    expect(db.getKV("lastDecision")).toBeNull();

    // Write a decision JSON object
    const decision = JSON.stringify({ action: "hold", chosenPoolId: null, rationale: "ok" });
    db.setKV("lastDecision", decision);
    expect(db.getKV("lastDecision")).toBe(decision);
    // Scan key still has its own value
    expect(db.getKV("lastScan")).toBe(updated);
  });
});

// NOTE: the per-user registry (users + positions) was moved OUT of SQLite into
// the in-memory `globalThis` store — its tests now live in `registry.test.ts`.

describe("cross-instance kv round-trip (file-backed SQLite)", () => {
  it("value written by one db handle is visible to a fresh handle on the same file", () => {
    // Write to a temp file via one handle, then open a second handle and read.
    const tmpFile = path.join(os.tmpdir(), `ys-test-${process.pid}-${Date.now()}.sqlite`);
    try {
      const poolIds = ["C_POOL_A", "C_POOL_B", "C_POOL_C"];
      const serialized = JSON.stringify(poolIds);

      // Writer: first db instance
      const writer = createDb(tmpFile);
      writer.setKV("discoveredPools", serialized);
      writer.setKV("discoveredAt", String(Date.now()));

      // Reader: fresh db instance on the same file (simulates process restart)
      const reader = createDb(tmpFile);
      const rawPools = reader.getKV("discoveredPools");
      const rawAt = reader.getKV("discoveredAt");

      expect(rawPools).toBe(serialized);
      expect(JSON.parse(rawPools!)).toEqual(poolIds);
      expect(rawAt).not.toBeNull();
      expect(Number(rawAt)).toBeGreaterThan(0);
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* best-effort cleanup */ }
    }
  });
});
