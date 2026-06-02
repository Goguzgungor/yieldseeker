import { describe, it, expect } from "vitest";
import { createDefindexSource, type StrategyTvlReader } from "./defindex";
import type { BlendReader, RawReserve } from "./scanner";
import type { DefindexStrategyConfig } from "./config";

const blendReader: BlendReader = {
  async readReserve(poolId: string): Promise<RawReserve> {
    return { poolId, name: "Blend Fixed", supplyApr: 0.086, totalSupplyUsdc: 155_000_0000000n, utilization: 0.62, oracleStale: false };
  },
};
const strategies: DefindexStrategyConfig[] = [
  { strategyId: "C_STRAT_USDC", blendPoolId: "C_BLEND_FIXED", name: "DeFindex USDC · Blend Fixed", fallbackTvlUsdc: 1_000_0000000n },
];

describe("createDefindexSource", () => {
  it("derives APY/utilization/oracle from the underlying Blend pool, tagged defindex", async () => {
    const src = createDefindexSource(blendReader, strategies);
    expect(src.protocol).toBe("defindex");
    expect(await src.readPool("C_STRAT_USDC")).toMatchObject({
      protocol: "defindex", poolId: "C_STRAT_USDC", name: "DeFindex USDC · Blend Fixed",
      apyBps: 860, utilizationBps: 6200, oracleHealthy: true,
    });
  });

  it("uses configured fallback TVL when no on-chain reader is provided", async () => {
    const src = createDefindexSource(blendReader, strategies);
    expect((await src.readPool("C_STRAT_USDC"))?.tvlUsdc).toBe(1_000_0000000n);
  });

  it("prefers live on-chain strategy TVL when a reader returns a value", async () => {
    const tvlReader: StrategyTvlReader = { async readTotalManagedFunds() { return 7_500_0000000n; } };
    const src = createDefindexSource(blendReader, strategies, tvlReader);
    expect((await src.readPool("C_STRAT_USDC"))?.tvlUsdc).toBe(7_500_0000000n);
  });

  it("falls back to config TVL when the on-chain reader returns null or throws", async () => {
    const nullReader: StrategyTvlReader = { async readTotalManagedFunds() { return null; } };
    const throwReader: StrategyTvlReader = { async readTotalManagedFunds() { throw new Error("rpc"); } };
    expect((await createDefindexSource(blendReader, strategies, nullReader).readPool("C_STRAT_USDC"))?.tvlUsdc).toBe(1_000_0000000n);
    expect((await createDefindexSource(blendReader, strategies, throwReader).readPool("C_STRAT_USDC"))?.tvlUsdc).toBe(1_000_0000000n);
  });

  it("returns null for an unknown strategy id", async () => {
    const src = createDefindexSource(blendReader, strategies);
    expect(await src.readPool("C_UNKNOWN")).toBeNull();
  });
});
