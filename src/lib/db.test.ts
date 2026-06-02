import { describe, it, expect } from "vitest";
import { createDb } from "./db";

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
