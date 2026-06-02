// Usage: npx tsx scripts/verify-defindex-assets.ts
// Lists the Blend "Fixed" pool reserves (asset contract id + symbol + supply APR)
// on mainnet, so we know the USDC/EURC/XLM SAC ids the DeFindex multi-asset
// strategies (fixed-pool) read from. Confirms which assets are actually present.
import { PoolV2, TokenMetadata } from "@blend-capital/blend-sdk";
import type { Network } from "@blend-capital/blend-sdk";

const RPC = "https://mainnet.sorobanrpc.com";
const PASSPHRASE = "Public Global Stellar Network ; September 2015";
// Blend "Fixed" pool (DeFindex fixed-pool strategies autocompound here).
const FIXED_POOL = "CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD";

(async () => {
  const network: Network = { rpc: RPC, passphrase: PASSPHRASE };
  const pool = await PoolV2.load(network, FIXED_POOL);
  console.log(`Pool: ${pool.metadata.name}  (${FIXED_POOL})`);
  console.log(`Reserves: ${pool.reserves.size}`);
  for (const [assetId, reserve] of pool.reserves) {
    let symbol = "?";
    try {
      symbol = (await TokenMetadata.load(network, assetId)).symbol;
    } catch {
      /* symbol best-effort */
    }
    const apr = (reserve.supplyApr * 100).toFixed(2);
    const util = (reserve.getUtilizationFloat() * 100).toFixed(1);
    console.log(`  ${symbol.padEnd(6)} ${assetId}  supplyApr=${apr}%  util=${util}%`);
  }
})();
