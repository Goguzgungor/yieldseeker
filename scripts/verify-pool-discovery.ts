/**
 * Verify dynamic on-chain Blend mainnet pool discovery.
 * Usage: npx tsx scripts/verify-pool-discovery.ts
 *
 * Builds the real on-chain PoolSource (backstop reward zone + factory deploy
 * events) against mainnet, wraps it with the curated fallback, and prints what
 * discoverPoolIds() returns — the pool ids, count, and whether the result came
 * from on-chain enumeration or the curated fallback.
 *
 * Mainnet contracts (blend-capital/blend-utils mainnet.contracts.json):
 *   poolFactoryV2 = CDSYOAVXFY7SM5S64IZPPPYB4GVGGLMQVFREPSQQEZVIWXX5R23G4QSU
 *   backstopV2    = CAQQR5SWBXKIGZKPBZDH3KM5GQ5GUTPKB7JAFCINLZBC5WXPJKRG3IM7
 * Known active V2 pools (expected in the set):
 *   FixedV2       = CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD
 *   YieldBloxV2   = CCCCIQSDILITHMM7PBSLVDT5MISSY7R26MNZXCX4H7J5JQ5FPIYOGYFS
 */

import { createBlendOnchainPoolSource, createPoolDiscovery } from "../src/lib/discovery";

const MAINNET_RPC = "https://mainnet.sorobanrpc.com";
const MAINNET_PASSPHRASE = "Public Global Stellar Network ; September 2015";
const POOL_FACTORY_ID = "CDSYOAVXFY7SM5S64IZPPPYB4GVGGLMQVFREPSQQEZVIWXX5R23G4QSU";
const BACKSTOP_ID = "CAQQR5SWBXKIGZKPBZDH3KM5GQ5GUTPKB7JAFCINLZBC5WXPJKRG3IM7";

// Curated fallback list (the previously-hardcoded mainnet pools).
const FALLBACK_POOL_IDS = [
  "CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD", // FixedV2
  "CCCCIQSDILITHMM7PBSLVDT5MISSY7R26MNZXCX4H7J5JQ5FPIYOGYFS", // YieldBloxV2
];

const KNOWN = new Set(FALLBACK_POOL_IDS);

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function main() {
  console.log("=== Blend Mainnet Pool Discovery Verification ===");
  console.log(`RPC:          ${MAINNET_RPC}`);
  console.log(`Backstop V2:  ${BACKSTOP_ID}`);
  console.log(`Factory V2:   ${POOL_FACTORY_ID}`);
  console.log();

  const source = createBlendOnchainPoolSource({
    rpcUrl: MAINNET_RPC,
    networkPassphrase: MAINNET_PASSPHRASE,
    backstopId: BACKSTOP_ID,
    factoryId: POOL_FACTORY_ID,
  });

  // Show the raw on-chain enumeration first (so we can see if the chain returned
  // anything, independent of the fallback wrapper).
  let onchainIds: string[] = [];
  try {
    onchainIds = await source.listPools();
    console.log(`On-chain source.listPools() -> ${onchainIds.length} pool(s):`);
    for (const id of onchainIds) {
      console.log(`  - ${id}${KNOWN.has(id) ? "   (known V2 pool)" : ""}`);
    }
  } catch (e) {
    console.log(`On-chain source.listPools() THREW: ${(e as Error).message}`);
  }
  console.log();

  const discovery = createPoolDiscovery(source, FALLBACK_POOL_IDS);
  const discovered = await discovery.discoverPoolIds();

  const usedFallback = arraysEqual(discovered, FALLBACK_POOL_IDS);
  console.log(`discoverPoolIds() -> ${discovered.length} pool(s)  [source: ${usedFallback ? "FALLBACK" : "ON-CHAIN"}]`);
  for (const id of discovered) {
    console.log(`  - ${id}${KNOWN.has(id) ? "   (known V2 pool)" : ""}`);
  }
  console.log();

  const haveBothKnown = FALLBACK_POOL_IDS.every((id) => discovered.includes(id));
  console.log(`Both known V2 pools present in result: ${haveBothKnown ? "YES" : "NO"}`);

  if (usedFallback) {
    console.log("NOTE: on-chain enumeration returned nothing usable; curated fallback was used.");
  } else {
    console.log("On-chain discovery succeeded (active mainnet pools enumerated from chain).");
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
