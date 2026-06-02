import type { PoolYield, ScoredPool, RiskTolerance } from "./types.js";

const MIN_TVL: Record<RiskTolerance, bigint> = {
  conservative: 50_000_0000000n, // 50k USDC (conservative floor)
  balanced: 0n,                  // no hard TVL floor; risk score governs
  aggressive: 0n,
};
const MAX_RISK: Record<RiskTolerance, number> = {
  conservative: 35, balanced: 65, aggressive: 100,
};

export function scorePools(pools: PoolYield[], tolerance: RiskTolerance): ScoredPool[] {
  return pools.map((p) => {
    const utilRisk = Math.round((p.utilizationBps / 10000) * 70);
    const tvlRef = 100_000_0000000n; // 100k USDC reference
    const tvlRatio = p.tvlUsdc >= tvlRef ? 1 : Number(p.tvlUsdc) / Number(tvlRef);
    const tvlRisk = Math.round((1 - tvlRatio) * 30);
    const riskScore = Math.min(100, utilRisk + tvlRisk);

    let eligible = true;
    let reason: string | undefined;
    if (!p.oracleHealthy) { eligible = false; reason = "oracle unhealthy / flagged"; }
    else if (p.tvlUsdc < MIN_TVL[tolerance]) { eligible = false; reason = "TVL below tolerance floor"; }
    else if (riskScore > MAX_RISK[tolerance]) { eligible = false; reason = "risk score above tolerance"; }

    return { ...p, riskScore, eligible, reason };
  });
}

/** Best eligible pool by APY, or null. */
export function bestPool(scored: ScoredPool[]): ScoredPool | null {
  const eligible = scored.filter((p) => p.eligible);
  if (eligible.length === 0) return null;
  return eligible.reduce((a, b) => (b.apyBps > a.apyBps ? b : a));
}
