import { describe, it, expect } from "vitest";
import { scorePools } from "./risk";
import type { PoolYield } from "./types";

const base: PoolYield = {
  poolId: "P", name: "x", asset: "USDC",
  apyBps: 800, tvlUsdc: 100_000_0000000n, utilizationBps: 5000, oracleHealthy: true,
};

describe("scorePools", () => {
  it("flags unhealthy-oracle pools ineligible regardless of tolerance", () => {
    const out = scorePools([{ ...base, oracleHealthy: false }], "aggressive");
    expect(out[0].eligible).toBe(false);
    expect(out[0].reason).toMatch(/oracle/i);
  });

  it("conservative rejects low-TVL pools, balanced accepts them", () => {
    const lowTvl = { ...base, tvlUsdc: 1_000_0000000n }; // 1k USDC
    expect(scorePools([lowTvl], "conservative")[0].eligible).toBe(false);
    expect(scorePools([lowTvl], "balanced")[0].eligible).toBe(true);
  });

  it("higher utilization and lower TVL increase risk score", () => {
    const safe = scorePools([base], "balanced")[0];
    const risky = scorePools([{ ...base, utilizationBps: 9500, tvlUsdc: 5_000_0000000n }], "balanced")[0];
    expect(risky.riskScore).toBeGreaterThan(safe.riskScore);
  });
});
