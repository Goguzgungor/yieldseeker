/**
 * Probe the testnet USDC SAC: name/symbol/decimals/admin + agent balance.
 * Usage: npx tsx scripts/probe-usdc.ts [G_ADDRESS_TO_CHECK_BALANCE]
 */
import {
  rpc,
  Contract,
  Address,
  scValToNative,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
} from "@stellar/stellar-sdk";

const RPC = "https://soroban-testnet.stellar.org";
const PASS = "Test SDF Network ; September 2015";
const USDC = "CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU";
const SRC = process.argv[2] ?? "GA7VW73OJGYQUIPZCMBW7CFGZBKPBOGI2442YB56QAWSDIA3LCKNGS5W";

async function main() {
  const server = new rpc.Server(RPC);
  const c = new Contract(USDC);
  const acct = await server.getAccount(SRC);

  async function call(method: string, args: any[] = []) {
    const tx = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: PASS })
      .addOperation(c.call(method, ...args))
      .setTimeout(30)
      .build();
    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) return { err: sim.error };
    return { val: scValToNative((sim as any).result.retval) };
  }

  console.log("USDC SAC:", USDC);
  console.log("name:    ", JSON.stringify(await call("name")));
  console.log("symbol:  ", JSON.stringify(await call("symbol")));
  console.log("decimals:", JSON.stringify(await call("decimals")));
  console.log("admin:   ", JSON.stringify(await call("admin")));
  const bal = await call("balance", [nativeToScVal(Address.fromString(SRC), { type: "address" })]);
  console.log(`balance(${SRC}):`, JSON.stringify(bal, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
