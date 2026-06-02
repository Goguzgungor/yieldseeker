/**
 * Blend Testnet Spike Verifier
 * Usage: BLEND_POOL_IDS="<id1>,<id2>" npx tsx scripts/verify-blend-testnet.ts
 *
 * Confirmed SDK API (blend-sdk@3.2.2):
 *   - Pool load: PoolV2.load(Network, poolId) where Network = { rpc: string, passphrase: string }
 *   - reserves: Map<string, Reserve>  (keyed by assetId)
 *   - reserve.supplyApr: number (fraction, e.g. 0.086)
 *   - reserve.estSupplyApy: number
 *   - reserve.totalSupply(): bigint
 *   - reserve.totalSupplyFloat(): number
 *   - reserve.getUtilizationFloat(): number
 *   - reserve.config.decimals: number
 *   - reserve.assetId: string
 *   - pool.metadata.name: string
 *   - pool.metadata.reserveList: string[]
 *   - oracle staleness: PoolOracle.load() then oracle.prices (Map<string, PriceData>)
 *     PriceData.timestamp (seconds) — compare to Date.now()/1000 for staleness
 *   - TokenMetadata.load(network, assetId) gives .symbol
 */

import { PoolV2, PoolOracle, TokenMetadata } from "@blend-capital/blend-sdk";
import type { Network } from "@blend-capital/blend-sdk";

const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";

// Known testnet contracts from blend-utils testnet.contracts.json
const TESTNET_USDC = "CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU";

// Two pool IDs from testnet.contracts.json
const DEFAULT_POOL_IDS = [
  "CA5UTUUPHYL5K22UBRUVC37EARZUGYOSGK3IKIXG2JLCC5ZZLI4BDWDM", // Comet
  "CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF", // Testnet V2
];

const ORACLE_STALE_THRESHOLD_SEC = 3600; // 1 hour

async function verifyPool(network: Network, poolId: string): Promise<void> {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Pool: ${poolId}`);
  console.log(`${"=".repeat(60)}`);

  const pool = await PoolV2.load(network, poolId);
  console.log(`  name:         ${pool.metadata.name}`);
  console.log(`  oracle:       ${pool.metadata.oracle}`);
  console.log(`  backstopRate: ${pool.metadata.backstopRate}`);
  console.log(`  status:       ${pool.metadata.status}`);
  console.log(`  reserves:     ${pool.metadata.reserveList.length} total`);

  // Load oracle for staleness
  let oracle: PoolOracle | undefined;
  try {
    oracle = await pool.loadOracle();
    console.log(`  oracleId:     ${oracle.oracleId}`);
    console.log(`  oracle decimals: ${oracle.decimals}`);
  } catch (e) {
    console.warn(`  WARNING: could not load oracle: ${(e as Error).message}`);
  }

  const nowSec = Math.floor(Date.now() / 1000);

  // Iterate all reserves
  for (const [assetId, reserve] of pool.reserves) {
    // Try to get token symbol
    let symbol = assetId.slice(0, 8);
    try {
      const meta = await TokenMetadata.load(network, assetId);
      symbol = meta.symbol;
    } catch {
      // fallback to truncated assetId
    }

    // Check oracle staleness
    let oracleStale = false;
    if (oracle) {
      const priceData = oracle.prices.get(assetId);
      if (!priceData) {
        oracleStale = true;
      } else {
        oracleStale = nowSec - priceData.timestamp > ORACLE_STALE_THRESHOLD_SEC;
      }
    }

    const totalSupplyBigint = reserve.totalSupply();
    const utilization = reserve.getUtilizationFloat();

    console.log(`\n  Reserve: ${symbol} (${assetId})`);
    console.log(`    supplyApr:       ${(reserve.supplyApr * 100).toFixed(4)}%`);
    console.log(`    estSupplyApy:    ${(reserve.estSupplyApy * 100).toFixed(4)}%`);
    console.log(`    borrowApr:       ${(reserve.borrowApr * 100).toFixed(4)}%`);
    console.log(`    totalSupply:     ${totalSupplyBigint.toString()} (raw)`);
    console.log(`    totalSupplyFloat:${reserve.totalSupplyFloat().toFixed(4)}`);
    console.log(`    utilization:     ${(utilization * 100).toFixed(2)}%`);
    console.log(`    decimals:        ${reserve.config.decimals}`);
    console.log(`    oracleStale:     ${oracleStale}`);

    if (assetId === TESTNET_USDC) {
      console.log(`    *** USDC reserve found ***`);
    }
  }
}

async function main() {
  const poolIdsRaw = process.env.BLEND_POOL_IDS ?? DEFAULT_POOL_IDS.join(",");
  const poolIds = poolIdsRaw.split(",").map((s) => s.trim()).filter(Boolean);

  const network: Network = {
    rpc: RPC_URL,
    passphrase: NETWORK_PASSPHRASE,
  };

  console.log(`Stellar Testnet RPC: ${RPC_URL}`);
  console.log(`Network passphrase: ${NETWORK_PASSPHRASE}`);
  console.log(`USDC SAC (testnet): ${TESTNET_USDC}`);
  console.log(`Pools to verify: ${poolIds.join(", ")}`);

  for (const poolId of poolIds) {
    try {
      await verifyPool(network, poolId);
    } catch (e) {
      console.error(`\nERROR loading pool ${poolId}:`);
      console.error(`  ${(e as Error).message}`);
      if ((e as Error).stack) {
        console.error((e as Error).stack?.split("\n").slice(1, 4).join("\n"));
      }
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("Spike run complete.");
  console.log(`\nFor .env:`);
  console.log(`USDC_CONTRACT_ID=${TESTNET_USDC}`);
  console.log(`BLEND_POOL_IDS=${poolIds.join(",")}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
