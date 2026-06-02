import * as Blend from "@blend-capital/blend-sdk";
import type { PoolYield } from "./types.js";

export interface RawReserve {
  poolId: string;
  name: string;
  supplyApr: number;        // fraction, e.g. 0.086
  totalSupplyUsdc: bigint;  // stroops
  utilization: number;      // 0..1
  oracleStale: boolean;
}

export interface BlendReader {
  readReserve(poolId: string): Promise<RawReserve>;
}

export async function scanYields(reader: BlendReader, poolIds: string[]): Promise<PoolYield[]> {
  const out: PoolYield[] = [];
  for (const id of poolIds) {
    try {
      const r = await reader.readReserve(id);
      out.push({
        poolId: r.poolId,
        name: r.name,
        asset: "USDC",
        apyBps: Math.round(r.supplyApr * 10000),
        tvlUsdc: r.totalSupplyUsdc,
        utilizationBps: Math.round(r.utilization * 10000),
        oracleHealthy: !r.oracleStale,
      });
    } catch {
      // Skip unreadable pool; orchestrator logs the gap.
    }
  }
  return out;
}

// Spike-gated network adapter. CONFIRM field access against Task-5 spike output later.
export function createBlendReader(rpcUrl: string, networkPassphrase: string): BlendReader {
  return {
    async readReserve(poolId: string): Promise<RawReserve> {
      const pool: any = await (Blend as any).PoolV2.load({ rpc: rpcUrl, network: networkPassphrase } as any, poolId); // CONFIRM loader
      const usdcReserve: any = Object.values(pool.reserves).find((r: any) =>
        (r.tokenMetadata?.symbol ?? r.symbol) === "USDC"); // CONFIRM symbol field
      return {
        poolId,
        name: pool.metadata?.name ?? poolId.slice(0, 6),
        supplyApr: Number(usdcReserve.supplyApr ?? usdcReserve.estSupplyApy),
        totalSupplyUsdc: BigInt(Math.round(Number(usdcReserve.totalSupply ?? 0))),
        utilization: Number(usdcReserve.getUtilization?.() ?? usdcReserve.utilization ?? 0),
        oracleStale: Boolean(usdcReserve.oracleStale ?? false),
      };
    },
  };
}
