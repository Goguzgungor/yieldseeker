/**
 * Verify mainnet Blend pool scanning using the project's createBlendReader + scanYields.
 * Usage: npx tsx scripts/verify-mainnet-scan.ts
 *
 * Mainnet pool IDs sourced from:
 *   - https://docs-v1.blend.capital/mainnet-deployments  (v1 Fixed + YieldBlox pools)
 *   - https://raw.githubusercontent.com/blend-capital/blend-utils/main/mainnet.contracts.json
 *     (FixedV2 = CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD,
 *      YieldBloxV2 = CCCCIQSDILITHMM7PBSLVDT5MISSY7R26MNZXCX4H7J5JQ5FPIYOGYFS)
 *
 * Mainnet USDC SAC: CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75
 *   (confirmed in blend-utils mainnet.contracts.json; asset issuer GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN)
 *
 * Mainnet RPC: https://mainnet.sorobanrpc.com  (confirmed healthy, ledger ~62845982)
 */

import { createBlendReader, scanYields } from "../src/lib/scanner";

const MAINNET_RPC = "https://mainnet.sorobanrpc.com";
const MAINNET_PASSPHRASE = "Public Global Stellar Network ; September 2015";
const MAINNET_USDC = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";

// Mainnet Blend pool IDs (V2)
const POOL_IDS = [
  "CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD", // Fixed V2
  "CCCCIQSDILITHMM7PBSLVDT5MISSY7R26MNZXCX4H7J5JQ5FPIYOGYFS", // YieldBlox V2
];

async function main() {
  console.log("=== Mainnet Blend Scan Verification ===");
  console.log(`RPC:      ${MAINNET_RPC}`);
  console.log(`Network:  ${MAINNET_PASSPHRASE}`);
  console.log(`USDC SAC: ${MAINNET_USDC}`);
  console.log(`Pools:    ${POOL_IDS.join(", ")}`);
  console.log();

  const reader = createBlendReader(MAINNET_RPC, MAINNET_PASSPHRASE, MAINNET_USDC);

  console.log("Scanning yields...");
  const yields = await scanYields(reader, POOL_IDS);

  if (yields.length === 0) {
    console.error("ERROR: No pools returned — check pool IDs and RPC");
    process.exit(1);
  }

  console.log(`\nPoolYield[] (${yields.length} pools):\n`);
  for (const py of yields) {
    const apyPct = (py.apyBps / 100).toFixed(2);
    const tvlUsdc = (Number(py.tvlUsdc) / 1e7).toLocaleString(undefined, { maximumFractionDigits: 2 });
    const utilPct = (py.utilizationBps / 100).toFixed(2);
    console.log(`  Pool: ${py.name} (${py.poolId.slice(0, 12)}...)`);
    console.log(`    asset:        ${py.asset}`);
    console.log(`    apyBps:       ${py.apyBps}  (${apyPct}% APY)`);
    console.log(`    tvlUsdc:      ${py.tvlUsdc} raw  (~${tvlUsdc} USDC)`);
    console.log(`    utilizationBps: ${py.utilizationBps}  (${utilPct}%)`);
    console.log(`    oracleHealthy:  ${py.oracleHealthy}`);
    console.log();
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
