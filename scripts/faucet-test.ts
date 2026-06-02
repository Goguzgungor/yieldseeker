/**
 * REAL testnet faucet test: mint our USDC into an existing smart account and
 * confirm the balance increased.
 *
 * Exercises the full {@link mintUsdc} success path (simulate → assemble →
 * sign(owner) → submit → poll) against testnet, signed by the OWNER (= the USDC
 * SAC admin, SEP-5 m/44'/148'/0' of STELLAR_WALLET_MNEMONIC). Reads the smart
 * account's USDC balance before and after via the SAC `balance(addr)` simulation.
 *
 *   npx tsx scripts/faucet-test.ts            # mints 250 USDC into the default SA
 *   npx tsx scripts/faucet-test.ts <C…> <amt> # custom recipient + whole-USDC amount
 *
 * NEVER prints secrets — only public G…/C… ids and the tx hash.
 */
import "dotenv/config";
import {
  rpc,
  Contract,
  Address,
  scValToNative,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
} from "@stellar/stellar-sdk";
import { deriveOwnerKeypair, mintUsdc, STROOPS_PER_USDC } from "../src/lib/faucet";

const RPC = process.env.EXEC_RPC_URL ?? "https://soroban-testnet.stellar.org";
const PASS = process.env.EXEC_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";
const USDC_SAC =
  process.env.EXEC_USDC_CONTRACT_ID ?? "CD2R7WREEPGIAXZL4ASB76Y6PWTY6ZZXZ6C64AIKFDIG36YKQPNY6B2I";

const SA = process.argv[2] ?? "CCL7S6FCKEXOXBKEZEYGPYT4NHTGSNGXM7ENGXRD2KC4FJYSVCEQBTKB";
const AMOUNT_USDC = Number(process.argv[3] ?? "250");

const server = new rpc.Server(RPC, { allowHttp: RPC.startsWith("http://") });

const fmt = (stroops: bigint) => (Number(stroops) / Number(STROOPS_PER_USDC)).toFixed(7);

async function readBalance(addr: string): Promise<bigint> {
  // Any funded account works as the read-only simulation source; reuse the owner.
  const owner = deriveOwnerKeypair();
  const src = await server.getAccount(owner.publicKey());
  const tx = new TransactionBuilder(src, { fee: BASE_FEE, networkPassphrase: PASS })
    .addOperation(
      new Contract(USDC_SAC).call("balance", nativeToScVal(Address.fromString(addr), { type: "address" })),
    )
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(`balance sim failed: ${sim.error}`);
  const retval = (sim as rpc.Api.SimulateTransactionSuccessResponse).result?.retval;
  if (!retval) return 0n;
  return BigInt(scValToNative(retval).toString());
}

async function main() {
  const owner = deriveOwnerKeypair();
  console.log(`# Faucet test — mint our USDC into a smart account`);
  console.log(`#   RPC      = ${RPC}`);
  console.log(`#   USDC SAC = ${USDC_SAC}`);
  console.log(`#   OWNER    = ${owner.publicKey()}  (SAC admin / SEP-5 m/44'/148'/0')`);
  console.log(`#   TO (SA)  = ${SA}`);
  console.log(`#   AMOUNT   = ${AMOUNT_USDC} USDC`);

  const before = await readBalance(SA);
  console.log(`\n[before] SA USDC balance = ${before} stroops (= ${fmt(before)} USDC)`);

  const amountStroops = BigInt(Math.round(AMOUNT_USDC * Number(STROOPS_PER_USDC)));
  console.log(`\n[mint] mintUsdc(${AMOUNT_USDC} USDC = ${amountStroops} stroops) → ${SA}`);
  const { txHash } = await mintUsdc({
    to: SA,
    amountStroops,
    rpcUrl: RPC,
    networkPassphrase: PASS,
    usdcSac: USDC_SAC,
    ownerKeypair: owner,
    server,
  });
  console.log(`   ✅ mint tx SUCCESS`);
  console.log(`   hash = ${txHash}`);
  console.log(`   stellar.expert: https://stellar.expert/explorer/testnet/tx/${txHash}`);

  const after = await readBalance(SA);
  const delta = after - before;
  console.log(`\n[after]  SA USDC balance = ${after} stroops (= ${fmt(after)} USDC)`);
  console.log(`[delta]  +${delta} stroops (= +${fmt(delta)} USDC)`);

  if (delta !== amountStroops) {
    throw new Error(
      `balance delta ${delta} != minted ${amountStroops} (expected exact increase)`,
    );
  }
  console.log(`\n✅ VERIFIED: SA USDC balance increased by exactly the minted amount.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("FATAL", e?.message ?? e);
    process.exit(1);
  });
