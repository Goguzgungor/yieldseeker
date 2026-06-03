import { describe, it, expect } from "vitest";
import { createMemoryDb } from "./db";

// These exercise the in-memory implementation (the offline shape of the async
// Db interface). The production path is the same interface backed by MongoDB
// (`createDb()` when MONGODB_URI is set), so cross-invocation sharing — which the
// old file-backed-SQLite test covered — is now Mongo's responsibility.

describe("db (in-memory async impl)", () => {
  it("persists position and appends activity log", async () => {
    const db = createMemoryDb();
    await db.setPosition({ poolId: "C_A", amountUsdc: 1000_0000000n });
    expect(await db.getPosition()).toEqual({ poolId: "C_A", amountUsdc: 1000_0000000n });

    await db.log("info", "scanned 2 pools");
    await db.log("rebalance", "moved A->B", { hash: "abc" });
    const events = await db.recentLog(10);
    expect(events.length).toBe(2);
    expect(events[0].message).toBe("moved A->B"); // newest first
  });

  it("sums rebalanced amount in the last 24h for daily cap", async () => {
    const db = createMemoryDb();
    await db.recordRebalance(1000_0000000n, 1_000_000);
    await db.recordRebalance(500_0000000n, 1_000_100);
    expect(await db.rebalancedSince(0)).toBe(1500_0000000n);
  });

  it("rebalancedSince respects the lower-bound timestamp", async () => {
    const db = createMemoryDb();
    await db.recordRebalance(10n, 1_000);
    await db.recordRebalance(20n, 2_000);
    expect(await db.rebalancedSince(1_500)).toBe(20n); // only the second counts
  });

  it("setKV / getKV round-trips arbitrary JSON strings", async () => {
    const db = createMemoryDb();
    // Not yet set → null
    expect(await db.getKV("lastScan")).toBeNull();

    // Write a JSON array (simulating scan snapshot)
    const snapshot = JSON.stringify([{ poolId: "C_POOL", apyBps: 860 }]);
    await db.setKV("lastScan", snapshot);
    expect(await db.getKV("lastScan")).toBe(snapshot);

    // Overwrite (upsert) with a new value
    const updated = JSON.stringify([{ poolId: "C_POOL", apyBps: 900 }]);
    await db.setKV("lastScan", updated);
    expect(await db.getKV("lastScan")).toBe(updated);

    // Independent key is unaffected
    expect(await db.getKV("lastDecision")).toBeNull();

    // Write a decision JSON object
    const decision = JSON.stringify({ action: "hold", chosenPoolId: null, rationale: "ok" });
    await db.setKV("lastDecision", decision);
    expect(await db.getKV("lastDecision")).toBe(decision);
    // Scan key still has its own value
    expect(await db.getKV("lastScan")).toBe(updated);
  });
});
