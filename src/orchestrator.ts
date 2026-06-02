import { scorePools, bestPool } from "./risk.js";
import type { PoolYield, Position, Decision, TxResult, RiskTolerance } from "./types.js";

export interface TickDeps {
  scan: () => Promise<PoolYield[]>;
  tolerance: RiskTolerance;
  getPosition: () => Position;
  decide: (ctx: { pools: any; position: Position; tolerance: RiskTolerance }) => Promise<Decision>;
  rebalance: (from: string, to: string, amount: bigint) => Promise<TxResult>;
  commitPosition: (p: Position) => void;
  log: (kind: string, msg: string, meta?: unknown) => void;
  recordRebalance: (amount: bigint) => void;
  rebalancedSince: (sinceTs: number) => bigint;
  minYieldDeltaBps: number; perTxCapStroops: bigint; dailyCapStroops: bigint;
  cooldownSec: number; lastRebalanceAt: number; now: number;
}

export async function runTick(d: TickDeps): Promise<{ acted: boolean; reason: string }> {
  const raw = await d.scan();
  const scored = scorePools(raw, d.tolerance);
  d.log("scan", `scanned ${raw.length} pools, ${scored.filter((p) => p.eligible).length} eligible`);

  const pos = d.getPosition();
  const decision = await d.decide({ pools: scored, position: pos, tolerance: d.tolerance });
  if (decision.action !== "rebalance" || !decision.toPool) {
    d.log("decision", `hold: ${decision.rationale}`);
    return { acted: false, reason: "hold" };
  }

  if (d.now - d.lastRebalanceAt < d.cooldownSec) { d.log("skip", "cooldown active"); return { acted: false, reason: "cooldown" }; }

  const target = scored.find((p) => p.poolId === decision.toPool);
  const current = scored.find((p) => p.poolId === pos.poolId);
  const best = bestPool(scored);
  if (!target || !target.eligible) { d.log("skip", "target not eligible"); return { acted: false, reason: "ineligible-target" }; }
  const deltaBps = target.apyBps - (current?.apyBps ?? 0);
  if (deltaBps < d.minYieldDeltaBps) { d.log("skip", `delta ${deltaBps}bps < ${d.minYieldDeltaBps}`); return { acted: false, reason: "below-delta" }; }
  if (best && target.poolId !== best.poolId) { d.log("skip", "target not the best eligible"); return { acted: false, reason: "not-best" }; }

  let amount = decision.amountUsdc ?? pos.amountUsdc;
  if (amount > d.perTxCapStroops) amount = d.perTxCapStroops;
  const dayAgo = d.now - 86400;
  if (d.rebalancedSince(dayAgo) + amount > d.dailyCapStroops) { d.log("skip", "daily cap reached"); return { acted: false, reason: "daily-cap" }; }
  if (!pos.poolId) { d.log("skip", "no source position"); return { acted: false, reason: "no-source" }; }

  const res = await d.rebalance(pos.poolId, target.poolId, amount);
  if (!res.success) { d.log("error", `rebalance failed: ${res.error}`, res); return { acted: false, reason: "tx-failed" }; }

  d.recordRebalance(amount);
  d.commitPosition({ poolId: target.poolId, amountUsdc: amount });
  d.log("rebalance", `moved ${amount} stroops ${pos.poolId}->${target.poolId} (+${deltaBps}bps): ${decision.rationale}`, { hashes: res.hashes });
  return { acted: true, reason: "rebalanced" };
}
