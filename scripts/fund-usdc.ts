/**
 * Prepare the agent account to hold Blend-testnet USDC, and (optionally) fund it.
 *
 * The Blend TestnetV2 pool's USDC is a *wrapped classic asset*:
 *   SAC   = CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU
 *   asset = USDC:GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56
 * Holding it requires a classic trustline. Minting requires the issuer
 * (= SAC admin = GATALTGT...) secret, which is private to the Blend deployer.
 *
 * Usage:
 *   # 1) establish the trustline on the agent account (needs AGENT_SIGNER_SECRET)
 *   npx tsx scripts/fund-usdc.ts trustline
 *
 *   # 2) if you have the USDC issuer secret, send <amount> USDC to the agent
 *   USDC_ISSUER_SECRET=S... npx tsx scripts/fund-usdc.ts pay 100
 *
 *   # check the agent's USDC balance (via SAC `balance`)
 *   npx tsx scripts/fund-usdc.ts balance
 *
 * Reads AGENT_SIGNER_SECRET / SMART_WALLET_ADDRESS / ids from .env (dotenv).
 */
import "dotenv/config";
import {
  rpc,
  Keypair,
  Asset,
  Operation,
  Account,
  TransactionBuilder,
  Contract,
  Address,
  scValToNative,
  nativeToScVal,
  BASE_FEE,
} from "@stellar/stellar-sdk";

const RPC = process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
const PASS = process.env.STELLAR_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";
const USDC_SAC = process.env.USDC_CONTRACT_ID ?? "CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU";
const ISSUER = "GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56";
const USDC_ASSET = new Asset("USDC", ISSUER);

const server = new rpc.Server(RPC, { allowHttp: RPC.startsWith("http://") });

async function submitClassic(kp: Keypair, build: (acct: Account) => any) {
  const src = await server.getAccount(kp.publicKey());
  const tx = new TransactionBuilder(new Account(src.accountId(), src.sequenceNumber()), {
    fee: BASE_FEE,
    networkPassphrase: PASS,
  })
    .addOperation(build(src))
    .setTimeout(60)
    .build();
  tx.sign(kp);
  const sent = await server.sendTransaction(tx as any);
  if (sent.status === "ERROR") {
    throw new Error("send ERROR: " + JSON.stringify((sent as any).errorResult ?? sent));
  }
  let g = await server.getTransaction(sent.hash);
  for (let i = 0; i < 15 && g.status === "NOT_FOUND"; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    g = await server.getTransaction(sent.hash);
  }
  return { hash: sent.hash, status: g.status };
}

async function balance(addr: string) {
  const c = new Contract(USDC_SAC);
  const acct = await server.getAccount(addr);
  const tx = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: PASS })
    .addOperation(c.call("balance", nativeToScVal(Address.fromString(addr), { type: "address" })))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) return { error: (sim as any).error };
  return { balance: scValToNative((sim as any).result.retval).toString() };
}

async function main() {
  const cmd = process.argv[2] ?? "balance";
  const agentSecret = process.env.AGENT_SIGNER_SECRET;
  const agentAddr = process.env.SMART_WALLET_ADDRESS;
  if (!agentAddr) throw new Error("SMART_WALLET_ADDRESS missing in .env");

  if (cmd === "trustline") {
    if (!agentSecret) throw new Error("AGENT_SIGNER_SECRET missing in .env");
    const kp = Keypair.fromSecret(agentSecret);
    const res = await submitClassic(kp, () =>
      Operation.changeTrust({ asset: USDC_ASSET }),
    );
    console.log("changeTrust:", JSON.stringify(res));
  } else if (cmd === "pay") {
    const amount = process.argv[3] ?? "100";
    const issuerSecret = process.env.USDC_ISSUER_SECRET;
    if (!issuerSecret) throw new Error("USDC_ISSUER_SECRET missing (need the GATALTGT... issuer secret to mint)");
    const issuerKp = Keypair.fromSecret(issuerSecret);
    if (issuerKp.publicKey() !== ISSUER) {
      throw new Error(`USDC_ISSUER_SECRET is for ${issuerKp.publicKey()}, expected ${ISSUER}`);
    }
    const res = await submitClassic(issuerKp, () =>
      Operation.payment({ destination: agentAddr, asset: USDC_ASSET, amount }),
    );
    console.log(`payment ${amount} USDC -> ${agentAddr}:`, JSON.stringify(res));
  } else if (cmd === "balance") {
    console.log(`USDC balance(${agentAddr}):`, JSON.stringify(await balance(agentAddr)));
  } else {
    throw new Error(`unknown command: ${cmd} (use: trustline | pay <amount> | balance)`);
  }
}

main().catch((e) => {
  console.error("Fatal:", e.message ?? e);
  process.exit(1);
});
