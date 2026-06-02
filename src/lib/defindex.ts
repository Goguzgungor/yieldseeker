import type { PoolYield, YieldSource } from "./types";
import type { BlendReader } from "./scanner";
import type { DefindexStrategyConfig } from "./config";

/** Reads a DeFindex strategy's total managed USDC (stroops) on-chain. */
export interface StrategyTvlReader {
  readTotalManagedFunds(strategyId: string): Promise<bigint | null>;
}

/**
 * DeFindex as a scan-only YieldSource. Each strategy autocompounds into a Blend
 * fixed pool, so APY / utilization / oracle health are read from that underlying
 * Blend pool (cfg.blendPoolId). TVL is read on-chain from the strategy when a
 * StrategyTvlReader is supplied, otherwise the configured fallback is used.
 */
export function createDefindexSource(
  blendReader: BlendReader,
  strategies: DefindexStrategyConfig[],
  tvlReader?: StrategyTvlReader,
): YieldSource {
  const byId = new Map(strategies.map((s) => [s.strategyId, s]));
  return {
    protocol: "defindex",
    async readPool(strategyId: string): Promise<PoolYield | null> {
      const cfg = byId.get(strategyId);
      if (!cfg) return null;

      const r = await blendReader.readReserve(cfg.blendPoolId);
      if (!r) return null;

      let tvlUsdc = cfg.fallbackTvlUsdc;
      if (tvlReader) {
        try {
          const live = await tvlReader.readTotalManagedFunds(strategyId);
          if (live !== null) tvlUsdc = live;
        } catch {
          // keep fallback TVL
        }
      }

      return {
        protocol: "defindex",
        poolId: strategyId,
        name: cfg.name,
        asset: "USDC",
        apyBps: Math.round(r.supplyApr * 10000),
        tvlUsdc,
        utilizationBps: Math.round(r.utilization * 10000),
        oracleHealthy: !r.oracleStale,
      };
    },
  };
}
