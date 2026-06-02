import { describe, it, expect } from "vitest";
import { scanYields, type RawReserve } from "./scanner.js";

const reader = {
  async readReserve(poolId: string): Promise<RawReserve> {
    const map: Record<string, RawReserve> = {
      C_A: { poolId: "C_A", name: "Fixed Pool", supplyApr: 0.086, totalSupplyUsdc: 155_000_0000000n, utilization: 0.62, oracleStale: false },
      C_B: { poolId: "C_B", name: "YBX Pool", supplyApr: 0.094, totalSupplyUsdc: 40_000_0000000n, utilization: 0.71, oracleStale: true },
    };
    return map[poolId];
  },
};

describe("scanYields", () => {
  it("maps reserves to PoolYield with bps APY and oracle health", async () => {
    const out = await scanYields(reader, ["C_A", "C_B"]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ poolId: "C_A", apyBps: 860, oracleHealthy: true, utilizationBps: 6200 });
    expect(out[1]).toMatchObject({ poolId: "C_B", apyBps: 940, oracleHealthy: false });
  });

  it("skips pools that fail to read instead of throwing", async () => {
    const flaky = { async readReserve(id: string) { if (id === "BAD") throw new Error("rpc"); return reader.readReserve(id); } };
    const out = await scanYields(flaky as any, ["C_A", "BAD"]);
    expect(out.map((p) => p.poolId)).toEqual(["C_A"]);
  });
});
