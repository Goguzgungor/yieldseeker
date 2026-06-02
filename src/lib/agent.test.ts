import { describe, it, expect } from "vitest";
import { decide, type LlmClient } from "./agent";
import type { ScoredPool, Position } from "./types";

const pools: ScoredPool[] = [
  { poolId: "C_A", name: "A", asset: "USDC", apyBps: 820, tvlUsdc: 100_000_0000000n, utilizationBps: 5000, oracleHealthy: true, riskScore: 20, eligible: true },
  { poolId: "C_B", name: "B", asset: "USDC", apyBps: 880, tvlUsdc: 100_000_0000000n, utilizationBps: 5200, oracleHealthy: true, riskScore: 22, eligible: true },
];
const position: Position = { poolId: "C_A", amountUsdc: 1000_0000000n };

it("returns a rebalance decision when the llm calls the rebalance tool", async () => {
  const llm: LlmClient = {
    async runToolLoop(_sys, _user, tools) {
      const t = tools.find((x) => x.name === "rebalance")!;
      return { toolName: "rebalance", input: t.validate({ toPool: "C_B", amountUsdc: "10000000000" }), text: "Moving to B for +0.6%." };
    },
  };
  const d = await decide(llm, { pools, position, tolerance: "balanced" });
  expect(d.action).toBe("rebalance");
  expect(d.toPool).toBe("C_B");
  expect(d.amountUsdc).toBe(10000000000n);
  expect(d.rationale).toMatch(/B/);
});

it("returns hold when the llm produces no tool call", async () => {
  const llm: LlmClient = { async runToolLoop() { return { toolName: null, input: null, text: "Staying put." }; } };
  const d = await decide(llm, { pools, position, tolerance: "balanced" });
  expect(d.action).toBe("hold");
});
