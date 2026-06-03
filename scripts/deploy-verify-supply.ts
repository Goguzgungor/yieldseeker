/**
 * Verify a REAL supply against our own Blend V2 pool (deployed by deploy-blend-pool.ts).
 *
 * Flow (all signed by OWNER, who is the USDC SAC admin + a pool user):
 *   1. Mint 2000 USDC to OWNER (so there is real balance to supply).
 *   2. PoolContractV2(POOL).submit({ from, spender, to: OWNER,
 *        requests: [{ request_type: SupplyCollateral (2), address: USDC_SAC, amount: 1000_0000000 }] })
 *      -> simulate -> assembleTransaction -> sign(OWNER) -> submit -> poll SUCCESS.
 *   3. PoolV2.load({rpc, passphrase}, POOL) and print the USDC reserve's
 *        supplyApr, totalSupply(), getUtilizationFloat()
 *      — the exact fields src/lib/scanner.ts reads — proving our scanner works here.
 *
 * Reads ids from scripts/spike-artifacts/blend-pool.env (written by the deploy script).
 *
 * Run:  set -a; source scripts/spike-artifacts/keys.env; set +a
 *       npx tsx scripts/deploy-verify-supply.ts
 */
import { PoolContractV2, PoolV2, RequestType, type Network, type SubmitArgs } from "@blend-capital/blend-sdk";
import { Contract, nativeToScVal } from "@stellar/stellar-sdk";
import { RPC, PASS, ownerKp, invoke, loadArtifacts } from "./deploy-lib.js";

const SUPPLY_AMOUNT = 1000_0000000n; // 1,000 USDC (7 decimals)
const MINT_AMOUNT = 2000_0000000n;   // mint 2,000 USDC so there is balance to supply

async function main() {
  const owner = ownerKp();
  const OWNER = owner.publicKey();
  const A = loadArtifacts();
  const POOL = A.POOL;
  const USDC_SAC = A.USDC_SAC;
  if (!POOL || !USDC_SAC) throw new Error("Missing POOL / USDC_SAC in blend-pool.env — run deploy-blend-pool.ts first");

  console.log(`# Verify supply on our pool`);
  console.log(`# POOL     = ${POOL}`);
  console.log(`# USDC_SAC = ${USDC_SAC}`);
  console.log(`# OWNER    = ${OWNER}`);

  // 1. Ensure OWNER has USDC to supply. OWNER is the USDC SAC's admin/issuer, and a
  //    Stellar Asset Contract cannot `mint` to its own issuer ("operation invalid on
  //    issuer", Error(Contract,#2)) — the issuer already has effectively unlimited
  //    balance and can always `transfer`. So the mint is a no-op for the issuer; we
  //    attempt it for completeness and skip on the issuer error.
  console.log(`\n[1] mint ${MINT_AMOUNT} USDC -> OWNER (issuer already holds unlimited; skip if issuer)`);
  try {
    const mintOp = new Contract(USDC_SAC).call(
      "mint",
      nativeToScVal(OWNER, { type: "address" }),
      nativeToScVal(MINT_AMOUNT, { type: "i128" }),
    );
    await invoke(mintOp.toXDR("base64"), owner, { label: "mint:USDC->OWNER" });
  } catch (e: any) {
    if (/invalid on issuer|Contract, #2/.test(String(e?.message))) {
      console.log(`   OWNER is the USDC issuer — no mint needed (unlimited issuer balance).`);
    } else {
      throw e;
    }
  }

  // 2. SupplyCollateral 1000 USDC into the pool.
  console.log(`\n[2] pool.submit SupplyCollateral ${SUPPLY_AMOUNT} USDC (request_type=${RequestType.SupplyCollateral})`);
  const pool = new PoolContractV2(POOL);
  const submitArgs: SubmitArgs = {
    from: OWNER,
    spender: OWNER,
    to: OWNER,
    requests: [
      { request_type: RequestType.SupplyCollateral, address: USDC_SAC, amount: SUPPLY_AMOUNT },
    ],
  };
  const { hash } = await invoke(pool.submit(submitArgs), owner, { label: "pool:submit(SupplyCollateral)" });
  console.log(`\n✅ SUPPLY TX SUCCESS`);
  console.log(`   hash = ${hash}`);
  console.log(`   stellar.expert: https://stellar.expert/explorer/testnet/tx/${hash}`);

  // 3. Read the pool back via PoolV2.load and print the exact fields scanner.ts reads.
  console.log(`\n[3] PoolV2.load(${POOL}) — reading USDC reserve (the fields src/lib/scanner.ts uses)`);
  const network: Network = { rpc: RPC, passphrase: PASS };
  const loaded = await PoolV2.load(network, POOL);
  console.log(`   pool.metadata.name = ${loaded.metadata.name}`);

  const usdcReserve = loaded.reserves.get(USDC_SAC);
  if (!usdcReserve) {
    console.log(`   reserve keys present: ${[...loaded.reserves.keys()].join(", ")}`);
    throw new Error(`USDC reserve ${USDC_SAC} not found in loaded pool`);
  }

  const supplyApr = usdcReserve.supplyApr;             // number (fraction)
  const totalSupply = usdcReserve.totalSupply();       // bigint (raw 7-dec)
  const utilization = usdcReserve.getUtilizationFloat(); // number 0..1

  console.log(`\n===== USDC RESERVE STATE (PoolV2.load) =====`);
  console.log(`   assetId               = ${usdcReserve.assetId}`);
  console.log(`   supplyApr             = ${supplyApr}   (= ${(supplyApr * 100).toFixed(4)}% )`);
  console.log(`   totalSupply()         = ${totalSupply}   (= ${(Number(totalSupply) / 1e7).toFixed(7)} USDC )`);
  console.log(`   getUtilizationFloat() = ${utilization}   (= ${(utilization * 100).toFixed(4)}% )`);

  // Oracle staleness (same logic scanner.ts uses), best-effort.
  try {
    const oracle = await loaded.loadOracle();
    const pd = oracle.prices.get(usdcReserve.assetId);
    const nowSec = Math.floor(Date.now() / 1000);
    const stale = !pd || nowSec - pd.timestamp > 3600;
    console.log(`   oracle USDC price     = ${pd ? pd.price.toString() : "(none)"}  stale=${stale}`);
  } catch (e: any) {
    console.log(`   oracle load failed (non-fatal): ${String(e?.message).slice(0, 100)}`);
  }

  if (totalSupply <= 0n) throw new Error("totalSupply is 0 — supply did not register");
  console.log(`\n✅ VERIFIED: USDC reserve has a real, non-zero supply readable by our scanner.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("FATAL", e); process.exit(1); });
