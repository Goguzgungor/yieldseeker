import { describe, it, expect, vi } from "vitest";
import { runTick, type TickDeps } from "./orchestrator.js";
import type { PoolYield } from "./types.js";

const pools: PoolYield[] = [
  { poolId: "C_A", name: "A", asset: "USDC", apyBps: 820, tvlUsdc: 100_000_0000000n, utilizationBps: 5000, oracleHealthy: true },
  { poolId: "C_B", name: "B", asset: "USDC", apyBps: 900, tvlUsdc: 100_000_0000000n, utilizationBps: 5000, oracleHealthy: true },
];

function deps(over: Partial<TickDeps> = {}): TickDeps {
  return {
    scan: vi.fn(async () => pools),
    tolerance: "balanced",
    getPosition: () => ({ poolId: "C_A", amountUsdc: 1000_0000000n }),
    decide: vi.fn(async () => ({ action: "rebalance" as const, toPool: "C_B", amountUsdc: 1000_0000000n, rationale: "+0.8%" })),
    rebalance: vi.fn(async () => ({ hashes: ["h1", "h2"], success: true })),
    deposit: vi.fn(async () => ({ hashes: ["d"], success: true })),
    commitPosition: vi.fn(),
    log: vi.fn(),
    recordRebalance: vi.fn(),
    rebalancedSince: () => 0n,
    minYieldDeltaBps: 50, perTxCapStroops: 2000_0000000n, dailyCapStroops: 5000_0000000n,
    cooldownSec: 120, lastRebalanceAt: 0, now: 100000,
    ...over,
  };
}

describe("runTick guards", () => {
  it("executes rebalance when delta and caps pass", async () => {
    const d = deps();
    const r = await runTick(d);
    expect(d.rebalance).toHaveBeenCalledWith("C_A", "C_B", 1000_0000000n);
    expect(d.commitPosition).toHaveBeenCalledWith({ poolId: "C_B", amountUsdc: 1000_0000000n });
    expect(r.acted).toBe(true);
  });

  it("skips when yield delta below threshold", async () => {
    const d = deps({ decide: vi.fn(async () => ({ action: "rebalance" as const, toPool: "C_B", amountUsdc: 1000_0000000n, rationale: "tiny" })) });
    d.minYieldDeltaBps = 100;
    const r = await runTick(d);
    expect(d.rebalance).not.toHaveBeenCalled();
    expect(r.acted).toBe(false);
  });

  it("skips during cooldown", async () => {
    const r = await runTick(deps({ lastRebalanceAt: 99950, now: 100000, cooldownSec: 120 }));
    expect(r.acted).toBe(false);
  });

  it("clamps amount to per-tx cap", async () => {
    const d = deps({ getPosition: () => ({ poolId: "C_A", amountUsdc: 10_000_0000000n }),
      decide: vi.fn(async () => ({ action: "rebalance" as const, toPool: "C_B", amountUsdc: 10_000_0000000n, rationale: "big" })) });
    await runTick(d);
    expect(d.rebalance).toHaveBeenCalledWith("C_A", "C_B", 2000_0000000n);
  });

  it("deposits idle USDC into the best eligible pool (no rebalance)", async () => {
    const d = deps({
      getPosition: () => ({ poolId: null, amountUsdc: 1000_0000000n }),
      decide: vi.fn(async () => ({ action: "rebalance" as const, toPool: "C_B", amountUsdc: 1000_0000000n, rationale: "deploy idle" })),
      deposit: vi.fn(async () => ({ hashes: ["d1"], success: true })),
    });
    const r = await runTick(d);
    expect(d.deposit).toHaveBeenCalledWith("C_B", 1000_0000000n);
    expect(d.rebalance).not.toHaveBeenCalled();
    expect(d.commitPosition).toHaveBeenCalledWith({ poolId: "C_B", amountUsdc: 1000_0000000n });
    expect(r.acted).toBe(true);
    expect(r.reason).toBe("deposited");
  });
});
