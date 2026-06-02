// Usage: npx tsx scripts/verify-defindex-scan.ts
// Scans the 4 real DeFindex strategies via the multi-asset source against mainnet
// and prints each row (asset / APY / util / risk), confirming EURC + XLM read the
// correct reserve of the underlying Blend pool (not USDC).
import { createBlendReader, scanSource, type BlendReader } from "../src/lib/scanner";
import { createDefindexSource } from "../src/lib/defindex";
import { scorePools } from "../src/lib/risk";
import type { DefindexStrategyConfig } from "../src/lib/config";

const RPC = "https://mainnet.sorobanrpc.com";
const PASSPHRASE = "Public Global Stellar Network ; September 2015";
const FIXED = "CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD";
const ETHERFUSE = "CDMAVJPFXPADND3YRL4BSM3AKZWCTFMX27GLLXCML3PD62HEQS5FPVAI";
const USDC = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";
const EURC = "CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV";
const XLM = "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA";

const strategies: DefindexStrategyConfig[] = [
  { strategyId: "CDB2WMKQQNVZMEBY7Q7GZ5C7E7IAFSNMZ7GGVD6WKTCEWK7XOIAVZSAP", blendPoolId: FIXED, name: "DeFindex USDC Fixed", asset: "USDC", assetContractId: USDC, fallbackTvlUsdc: 200000_0000000n },
  { strategyId: "CC5CE6MWISDXT3MLNQ7R3FVILFVFEIH3COWGH45GJKL6BD2ZHF7F7JVI", blendPoolId: FIXED, name: "DeFindex EURC Fixed", asset: "EURC", assetContractId: EURC, fallbackTvlUsdc: 80000_0000000n },
  { strategyId: "CDPWNUW7UMCSVO36VAJSQHQECISPJLCVPDASKHRC5SEROAAZDUQ5DG2Z", blendPoolId: FIXED, name: "DeFindex XLM Fixed", asset: "XLM", assetContractId: XLM, fallbackTvlUsdc: 60000_0000000n },
  { strategyId: "CCBTSHPUVNKCT5V675AAVYNANHXBU26PTZK2QLS7ZLFNYRJZT5HW3VL6", blendPoolId: ETHERFUSE, name: "DeFindex USDC Etherfuse", asset: "USDC", assetContractId: USDC, fallbackTvlUsdc: 120000_0000000n },
];

const cache = new Map<string, BlendReader>();
const readerFor = (a: string): BlendReader => {
  if (!cache.has(a)) cache.set(a, createBlendReader(RPC, PASSPHRASE, a));
  return cache.get(a)!;
};

(async () => {
  const src = createDefindexSource(readerFor, strategies);
  const rows = await scanSource(src, strategies.map((s) => s.strategyId));
  const scored = scorePools(rows, "balanced");
  console.log(`Scanned ${scored.length}/${strategies.length} DeFindex strategies:`);
  for (const p of scored) {
    const status = p.eligible ? "ELIGIBLE" : `ineligible (${p.reason})`;
    console.log(
      `  ${p.name.padEnd(26)} ${p.asset.padEnd(4)} APY ${(p.apyBps / 100).toFixed(2)}%  util ${(p.utilizationBps / 100).toFixed(1)}%  risk ${String(p.riskScore).padStart(2)}  ${status}`,
    );
  }
})();
