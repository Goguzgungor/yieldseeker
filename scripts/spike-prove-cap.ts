/**
 * SPIKE — prove the spending-limit POLICY cap fires on-chain (independent of balance).
 *   - mint 20000 test-USDC to the smart account (balance no longer the limiter)
 *   - read spending_limit_data (cap=5000, already-spent from earlier 100 transfer)
 *   - AGENT transfer 5001 USDC in ONE tx  → expect policy reject #3221 (SpendingLimitExceeded)
 *   - AGENT transfer 4000 USDC (within remaining) → expect SUCCESS, then another 4000 → expect reject (cumulative > 5000)
 *
 *   set -a; source scripts/spike-artifacts/keys.env scripts/spike-artifacts/deployed.env; set +a
 *   npx tsx scripts/spike-prove-cap.ts
 */
import { Keypair, Address, nativeToScVal, scValToNative, xdr, rpc, TransactionBuilder, BASE_FEE, Operation, Contract } from "@stellar/stellar-sdk";
import { signSmartAccountEntries, type ExternalSignerKey } from "./spike-sa-auth.js";

const RPC = process.env.STELLAR_RPC_URL!, PASS = process.env.STELLAR_NETWORK_PASSPHRASE!;
const SMART_ACCOUNT = process.env.SMART_ACCOUNT!, ED25519_VERIFIER = process.env.ED25519_VERIFIER!;
const SPENDING_POLICY = process.env.SPENDING_POLICY!, TEST_USDC_SAC = process.env.TEST_USDC_SAC!;
const AGENT_RAWHEX = process.env.AGENT_RAWHEX!, OWNER_SECRET = process.env.OWNER_SECRET!, AGENT_SECRET = process.env.AGENT_SECRET!;

const server = new rpc.Server(RPC, { allowHttp: RPC.startsWith("http://") });
const owner = Keypair.fromSecret(OWNER_SECRET), agent = Keypair.fromSecret(AGENT_SECRET);
const agentSigner: ExternalSignerKey = { verifier: ED25519_VERIFIER, publicKeyHex: AGENT_RAWHEX };
const i128 = (v: bigint) => nativeToScVal(v, { type: "i128" });
const addr = (a: string) => nativeToScVal(Address.fromString(a), { type: "address" });
const AGENT_RULE_ID = Number(process.env.AGENT_RULE_ID ?? "1");

async function agentTransfer(amountStroops: bigint, expectFail = false) {
  const op = new Contract(TEST_USDC_SAC).call("transfer", addr(SMART_ACCOUNT), addr(owner.publicKey()), i128(amountStroops));
  const src = await server.getAccount(agent.publicKey());
  const built = new TransactionBuilder(src, { fee: (Number(BASE_FEE) * 100).toString(), networkPassphrase: PASS }).addOperation(op).setTimeout(120).build();
  const sim = await server.simulateTransaction(built);
  if (rpc.Api.isSimulationError(sim)) return { ok: false, error: `(sim) ${(sim as any).error.split("\n")[0]}` };
  const simOk = sim as rpc.Api.SimulateTransactionSuccessResponse;
  const entries = (simOk.result?.auth ?? []).map((e) => xdr.SorobanAuthorizationEntry.fromXDR(e.toXDR()));
  const latest = await server.getLatestLedger();
  signSmartAccountEntries({ entries, smartAccount: SMART_ACCOUNT, networkPassphrase: PASS, expirationLedger: latest.sequence + 100, contextRuleIds: [AGENT_RULE_ID], signers: [{ key: agentSigner, keypair: agent }] });
  const signedOp = Operation.invokeHostFunction({ func: (built.operations[0] as Operation.InvokeHostFunction).func, auth: entries });
  const preTx = new TransactionBuilder(await server.getAccount(agent.publicKey()), { fee: (Number(BASE_FEE) * 1000).toString(), networkPassphrase: PASS }).addOperation(signedOp).setTimeout(120).build();
  const sim2 = await server.simulateTransaction(preTx);
  if (rpc.Api.isSimulationError(sim2)) return { ok: false, error: `(resim) ${(sim2 as any).error.split("\n")[0]}` };
  const tx = rpc.assembleTransaction(preTx, sim2 as rpc.Api.SimulateTransactionSuccessResponse).build();
  tx.sign(agent);
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") return { ok: false, hash: sent.hash, error: "(send ERROR)" };
  let g = await server.getTransaction(sent.hash);
  for (let i = 0; i < 15 && g.status === "NOT_FOUND"; i++) { await new Promise((r) => setTimeout(r, 1000)); g = await server.getTransaction(sent.hash); }
  return { ok: g.status === "SUCCESS", hash: sent.hash, error: g.status === "SUCCESS" ? undefined : g.status };
}

async function balance(who: string) {
  const tx = new TransactionBuilder(await server.getAccount(agent.publicKey()), { fee: BASE_FEE, networkPassphrase: PASS }).addOperation(new Contract(TEST_USDC_SAC).call("balance", addr(who))).setTimeout(30).build();
  const sim = await server.simulateTransaction(tx);
  return scValToNative((sim as any).result.retval).toString();
}
async function spendData() {
  const tx = new TransactionBuilder(await server.getAccount(agent.publicKey()), { fee: BASE_FEE, networkPassphrase: PASS }).addOperation(new Contract(SPENDING_POLICY).call("get_spending_limit_data", nativeToScVal(AGENT_RULE_ID, { type: "u32" }), addr(SMART_ACCOUNT))).setTimeout(30).build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) return `ERR:${(sim as any).error.split("\n")[0]}`;
  return JSON.stringify(scValToNative((sim as any).result.retval), (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

async function main() {
  console.log("agent rule id:", AGENT_RULE_ID);
  // top up: mint 20000 USDC so balance is never the limiter
  const mintOp = new Contract(TEST_USDC_SAC).call("mint", addr(SMART_ACCOUNT), i128(200_000_000_000n));
  { const tx = await server.prepareTransaction(new TransactionBuilder(await server.getAccount(owner.publicKey()), { fee: (Number(BASE_FEE) * 100).toString(), networkPassphrase: PASS }).addOperation(mintOp).setTimeout(60).build()); tx.sign(owner); const sent = await server.sendTransaction(tx); let g = await server.getTransaction(sent.hash); for (let i = 0; i < 15 && g.status === "NOT_FOUND"; i++) { await new Promise((r) => setTimeout(r, 1000)); g = await server.getTransaction(sent.hash); } console.log("mint 20000:", sent.hash, g.status); }
  console.log("SA balance:", await balance(SMART_ACCOUNT), " cap data:", await spendData());

  console.log("\n[A] AGENT transfer 5001 USDC in ONE tx (cap=5000) → expect policy reject #3221 …");
  const a = await agentTransfer(50_010_000_000n, true);
  console.log("   →", JSON.stringify(a));

  console.log("\n[B] cumulative: balance limiter removed. spent-so-far includes earlier 100. Transfer 3000 → expect OK …");
  const b = await agentTransfer(30_000_000_000n);
  console.log("   →", JSON.stringify(b), " cap data:", await spendData());

  console.log("\n[C] another 3000 (cumulative 100+3000+3000=6100 > 5000) → expect reject #3221 …");
  const c = await agentTransfer(30_000_000_000n, true);
  console.log("   →", JSON.stringify(c), " cap data:", await spendData());

  console.log("\n=== CAP SUMMARY ===");
  console.log("5001 single :", a.ok ? "UNEXPECTED OK" : "REJECTED " + a.error);
  console.log("3000 first  :", b.ok ? "OK " + b.hash : "FAIL " + b.error);
  console.log("3000 again  :", c.ok ? "UNEXPECTED OK" : "REJECTED " + c.error);
}
main().catch((e) => { console.error("Fatal:", e?.message ?? e); process.exit(1); });
