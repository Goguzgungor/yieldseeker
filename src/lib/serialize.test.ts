import { describe, it, expect } from "vitest";
import { serializePosition, serializeScoredPools } from "./serialize";
import type { ScoredPool } from "./types";

describe("serializePosition", () => {
  it("renders the BigInt stroop amount as a decimal string", () => {
    expect(serializePosition({ poolId: "C_A", amountUsdc: 1000_0000000n })).toEqual({
      poolId: "C_A",
      amountUsdc: "10000000000",
    });
  });

  it("handles an idle (null pool) zero position", () => {
    expect(serializePosition({ poolId: null, amountUsdc: 0n })).toEqual({
      poolId: null,
      amountUsdc: "0",
    });
  });
});

describe("serializeScoredPools", () => {
  const scored: ScoredPool[] = [
    {
      protocol: "blend",
      poolId: "C_A", name: "A", asset: "USDC", apyBps: 820, tvlUsdc: 100_000_0000000n,
      utilizationBps: 5000, oracleHealthy: true, riskScore: 35, eligible: true,
    },
    {
      protocol: "blend",
      poolId: "C_B", name: "B", asset: "USDC", apyBps: 444, tvlUsdc: 1_0000000n,
      utilizationBps: 9000, oracleHealthy: false, riskScore: 93, eligible: false,
      reason: "oracle unhealthy / flagged",
    },
  ];

  it("renders each pool's BigInt tvlUsdc as a decimal string, preserving scoring fields", () => {
    expect(serializeScoredPools(scored)).toEqual([
      {
        protocol: "blend",
        poolId: "C_A", name: "A", asset: "USDC", apyBps: 820, tvlUsdc: "1000000000000",
        utilizationBps: 5000, oracleHealthy: true, riskScore: 35, eligible: true,
      },
      {
        protocol: "blend",
        poolId: "C_B", name: "B", asset: "USDC", apyBps: 444, tvlUsdc: "10000000",
        utilizationBps: 9000, oracleHealthy: false, riskScore: 93, eligible: false,
        reason: "oracle unhealthy / flagged",
      },
    ]);
  });

  it("returns an empty array for no pools", () => {
    expect(serializeScoredPools([])).toEqual([]);
  });
});
