import { describe, it, expect } from "vitest";
import { createDb } from "./db.js";

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
});
