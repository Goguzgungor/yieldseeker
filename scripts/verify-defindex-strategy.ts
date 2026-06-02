// FINDING 2026-06-03: no no-arg total getter found; candidates returned: fetch_total_managed_funds=MissingValue, total_managed_funds=MissingValue, total_assets=MissingValue, total_supply=MissingValue, balance=UnexpectedSize(requires args). Degrade to fallback TVL.
// Usage: npx tsx scripts/verify-defindex-strategy.ts
// Probes the DeFindex USDC fixed-pool strategy on Stellar mainnet for a
// no-arg, read-only getter returning total managed funds (i128 stroops).
// NOTE: Simulation source was rejected as invalid null account; switched to Keypair.random().publicKey() per task instructions.
import { rpc, Contract, Account, TransactionBuilder, BASE_FEE, scValToNative, Keypair } from "@stellar/stellar-sdk";

const RPC_URL = "https://mainnet.sorobanrpc.com";
const PASSPHRASE = "Public Global Stellar Network ; September 2015";
// DeFindex USDC fixed-pool strategy (re-validate against paltalabs/defindex mainnet.contracts.json)
const STRATEGY_ID = "CDB2WMKQQNVZMEBY7Q7GZ5C7E7IAFSNMZ7GGVD6WKTCEWK7XOIAVZSAP";
// Simulation source: random ephemeral keypair (no funds needed for simulation).
const SIM_SOURCE = Keypair.random().publicKey();
const CANDIDATES = ["fetch_total_managed_funds", "total_managed_funds", "total_assets", "total_supply", "balance"];

const server = new rpc.Server(RPC_URL);

async function tryGetter(fn: string) {
  try {
    const contract = new Contract(STRATEGY_ID);
    const tx = new TransactionBuilder(new Account(SIM_SOURCE, "0"), { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
      .addOperation(contract.call(fn))
      .setTimeout(30)
      .build();
    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) return `ERROR: ${sim.error}`;
    return `OK -> ${JSON.stringify(scValToNative((sim as rpc.Api.SimulateTransactionSuccessResponse).result!.retval), (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`;
  } catch (e) {
    return `THROW: ${(e as Error).message}`;
  }
}

(async () => {
  console.log(`Strategy: ${STRATEGY_ID}`);
  for (const fn of CANDIDATES) console.log(`  ${fn}(): ${await tryGetter(fn)}`);
})();
