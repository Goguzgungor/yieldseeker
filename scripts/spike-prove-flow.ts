/**
 * SPIKE — END-TO-END PROOF (headless) of the ARMA-style smart account + agent policy signer.
 *
 * Steps (all on testnet, real tx hashes):
 *   1. OWNER (External ed25519) adds a RESTRICTED context rule: agent may only
 *      CallContract(TEST_USDC_SAC) within a spending-limit cap.
 *   2. Mint TEST-USDC into the smart account (we are the issuer/admin).
 *   3. AGENT (External ed25519, backend key) signs a custom AuthPayload to call
 *      USDC.transfer(smart_account -> dest, amount) UNDER the cap  → expect SUCCESS.
 *   4. AGENT attempts a transfer OVER the cap                       → expect on-chain REJECT (policy).
 *
 * Run with keys.env + deployed.env sourced into the env:
 *   set -a; source scripts/spike-artifacts/keys.env scripts/spike-artifacts/deployed.env; set +a
 *   npx tsx scripts/spike-prove-flow.ts
 */
import {
  Keypair, Address, nativeToScVal, scValToNative, xdr, rpc,
  TransactionBuilder, BASE_FEE, Operation, Contract,
} from "@stellar/stellar-sdk";
import { signSmartAccountEntries, type ExternalSignerKey } from "./spike-sa-auth.js";

const RPC = process.env.STELLAR_RPC_URL!;
const PASS = process.env.STELLAR_NETWORK_PASSPHRASE!;
const SMART_ACCOUNT = process.env.SMART_ACCOUNT!;
const ED25519_VERIFIER = process.env.ED25519_VERIFIER!;
const SPENDING_POLICY = process.env.SPENDING_POLICY!;
const TEST_USDC_SAC = process.env.TEST_USDC_SAC!;
const AGENT_RAWHEX = process.env.AGENT_RAWHEX!;
const OWNER_RAWHEX = process.env.OWNER_RAWHEX!;
const OWNER_SECRET = process.env.OWNER_SECRET!;
const AGENT_SECRET = process.env.AGENT_SECRET!;

const server = new rpc.Server(RPC, { allowHttp: RPC.startsWith("http://") });
const owner = Keypair.fromSecret(OWNER_SECRET);
const agent = Keypair.fromSecret(AGENT_SECRET);

const ownerSigner: ExternalSignerKey = { verifier: ED25519_VERIFIER, publicKeyHex: OWNER_RAWHEX };
const agentSigner: ExternalSignerKey = { verifier: ED25519_VERIFIER, publicKeyHex: AGENT_RAWHEX };

const i128 = (v: bigint) => nativeToScVal(v, { type: "i128" });
const addr = (a: string) => nativeToScVal(Address.fromString(a), { type: "address" });

/** Run an invokeHostFunction op that requires the smart account's auth, signing
 *  the SA auth entry manually with the given External signer(s) + rule ids. */
async function invokeWithSaAuth(opts: {
  label: string;
  op: xdr.Operation;
  sourceKp: Keypair; // pays fee / tx source
  contextRuleIds: number[];
  signers: Array<{ key: ExternalSignerKey; keypair: Keypair }>;
  expectFail?: boolean;
}): Promise<{ ok: boolean; hash?: string; error?: string }> {
  const src = await server.getAccount(opts.sourceKp.publicKey());
  const built = new TransactionBuilder(src, { fee: (Number(BASE_FEE) * 100).toString(), networkPassphrase: PASS })
    .addOperation(opts.op)
    .setTimeout(120)
    .build();

  // 1) simulate to discover auth entries + resource footprint
  const sim = await server.simulateTransaction(built);
  if (rpc.Api.isSimulationError(sim)) {
    const msg = (sim as rpc.Api.SimulateTransactionErrorResponse).error;
    if (opts.expectFail) return { ok: false, error: `(sim) ${msg}` };
    throw new Error(`${opts.label} simulate failed: ${msg}`);
  }
  const simOk = sim as rpc.Api.SimulateTransactionSuccessResponse;

  // 2) take the auth entries from simulation, sign the SA entry manually
  const rawEntries = simOk.result?.auth ?? [];
  const entries = rawEntries.map((e) => xdr.SorobanAuthorizationEntry.fromXDR(e.toXDR()));
  const latest = await server.getLatestLedger();
  const expirationLedger = latest.sequence + 100;
  signSmartAccountEntries({
    entries, smartAccount: SMART_ACCOUNT, networkPassphrase: PASS,
    expirationLedger, contextRuleIds: opts.contextRuleIds, signers: opts.signers,
  });

  // 3) rebuild op WITH the signed auth, then RE-SIMULATE so the footprint/resources
  //    include the __check_auth storage reads + verifier cross-contract call (the
  //    first simulation used recording-auth and mocked __check_auth, so its footprint
  //    omitted ContextRuleData/verifier — causing an "outside of the footprint" trap).
  const invokeOp = built.operations[0] as Operation.InvokeHostFunction;
  const signedOp = Operation.invokeHostFunction({ func: invokeOp.func, auth: entries });
  const preTx = new TransactionBuilder(await server.getAccount(opts.sourceKp.publicKey()), {
    fee: (Number(BASE_FEE) * 1000).toString(), networkPassphrase: PASS,
  })
    .addOperation(signedOp)
    .setTimeout(120)
    .build();

  const sim2 = await server.simulateTransaction(preTx);
  if (rpc.Api.isSimulationError(sim2)) {
    const msg = (sim2 as rpc.Api.SimulateTransactionErrorResponse).error;
    if (opts.expectFail) return { ok: false, error: `(resim) ${msg}` };
    throw new Error(`${opts.label} re-simulate failed: ${msg}`);
  }
  const sim2Ok = sim2 as rpc.Api.SimulateTransactionSuccessResponse;
  // preTx already carries our signed auth; assembleTransaction merges the
  // re-simulated footprint/resources and preserves those existing auth entries.
  let tx = rpc.assembleTransaction(preTx, sim2Ok).build();
  tx.sign(opts.sourceKp);

  // 4) send + poll
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") {
    const err = JSON.stringify((sent as any).errorResult?.toXDR?.("base64") ?? sent.errorResult ?? sent);
    return { ok: false, hash: sent.hash, error: `(send ERROR) ${err}` };
  }
  let g = await server.getTransaction(sent.hash);
  for (let i = 0; i < 15 && g.status === "NOT_FOUND"; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    g = await server.getTransaction(sent.hash);
  }
  return { ok: g.status === "SUCCESS", hash: sent.hash, error: g.status === "SUCCESS" ? undefined : g.status };
}

async function readUsdcBalance(who: string): Promise<string> {
  const c = new Contract(TEST_USDC_SAC);
  const acct = await server.getAccount(agent.publicKey());
  const tx = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: PASS })
    .addOperation(c.call("balance", addr(who)))
    .setTimeout(30).build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) return `ERR:${(sim as any).error}`;
  return scValToNative((sim as any).result.retval).toString();
}

async function main() {
  console.log("Smart account:", SMART_ACCOUNT);
  console.log("Test USDC SAC:", TEST_USDC_SAC);

  // ---- STEP 1: owner adds the restricted agent rule ----
  // add_context_rule(context_type, name, valid_until, signers, policies)
  const installParam = nativeToScVal(
    { period_ledgers: 17280, spending_limit: 50_000_000_000n }, // 5000 USDC @7dp, ~1 day; fields sorted by symbol
    { type: { period_ledgers: ["symbol", "u32"], spending_limit: ["symbol", "i128"] } as any },
  );
  const ctxCallUsdc = xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol("CallContract"),
    addr(TEST_USDC_SAC),
  ]);
  const agentSignerScVal = xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol("External"),
    addr(ED25519_VERIFIER),
    xdr.ScVal.scvBytes(Buffer.from(AGENT_RAWHEX, "hex")),
  ]);
  const policiesMap = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: addr(SPENDING_POLICY), val: installParam }),
  ]);
  const addRuleOp = new Contract(SMART_ACCOUNT).call(
    "add_context_rule",
    ctxCallUsdc,
    nativeToScVal("agent-usdc-capped", { type: "string" }),
    xdr.ScVal.scvVoid(), // valid_until = None
    xdr.ScVal.scvVec([agentSignerScVal]),
    policiesMap,
  );
  console.log("\n[1] add_context_rule (owner-signed) …");
  const r1 = await invokeWithSaAuth({
    label: "add_context_rule", op: addRuleOp, sourceKp: agent, // agent pays fee; owner signs SA auth
    contextRuleIds: [0], // the add_context_rule call is authorized by the Default rule (id 0)
    signers: [{ key: ownerSigner, keypair: owner }],
  });
  console.log("    →", JSON.stringify(r1));
  if (!r1.ok) throw new Error("add_context_rule failed: " + r1.error);

  // discover the new rule id
  const cntC = new Contract(SMART_ACCOUNT);
  const cntTx = new TransactionBuilder(await server.getAccount(agent.publicKey()), { fee: BASE_FEE, networkPassphrase: PASS })
    .addOperation(cntC.call("get_context_rules_count")).setTimeout(30).build();
  const cntSim = await server.simulateTransaction(cntTx);
  const count = scValToNative((cntSim as any).result.retval);
  const agentRuleId = count - 1;
  console.log("    rules count =", count, "→ agent rule id =", agentRuleId);

  // ---- STEP 2: mint test-USDC into the smart account (issuer = owner = SAC admin) ----
  console.log("\n[2] mint 1000 TEST-USDC -> smart account …");
  const mintOp = new Contract(TEST_USDC_SAC).call("mint", addr(SMART_ACCOUNT), i128(10_000_000_000n)); // 1000 @7dp
  // SAC mint requires admin (issuer=owner) auth — owner signs as plain account (require_auth on owner addr).
  {
    const src = await server.getAccount(owner.publicKey());
    const tx = new TransactionBuilder(src, { fee: (Number(BASE_FEE) * 100).toString(), networkPassphrase: PASS })
      .addOperation(mintOp).setTimeout(60).build();
    const prepared = await server.prepareTransaction(tx);
    prepared.sign(owner);
    const sent = await server.sendTransaction(prepared);
    let g = await server.getTransaction(sent.hash);
    for (let i = 0; i < 15 && g.status === "NOT_FOUND"; i++) { await new Promise((r) => setTimeout(r, 1000)); g = await server.getTransaction(sent.hash); }
    console.log("    mint:", sent.hash, g.status);
  }
  console.log("    SA balance:", await readUsdcBalance(SMART_ACCOUNT));

  // ---- STEP 3: AGENT signs transfer UNDER cap → expect SUCCESS ----
  console.log("\n[3] AGENT transfer 100 USDC (under 5000 cap) — backend headless …");
  const dest = owner.publicKey(); // send to owner as a sink
  const transferOk = new Contract(TEST_USDC_SAC).call("transfer", addr(SMART_ACCOUNT), addr(dest), i128(1_000_000_000n)); // 100 @7dp
  const r3 = await invokeWithSaAuth({
    label: "agent-transfer-under-cap", op: transferOk, sourceKp: agent,
    contextRuleIds: [agentRuleId],
    signers: [{ key: agentSigner, keypair: agent }],
  });
  console.log("    →", JSON.stringify(r3));
  console.log("    SA balance after:", await readUsdcBalance(SMART_ACCOUNT));

  // ---- STEP 4: AGENT signs transfer OVER cap → expect REJECT ----
  console.log("\n[4] AGENT transfer 6000 USDC (over 5000 cap) — expect policy REJECT …");
  const transferBad = new Contract(TEST_USDC_SAC).call("transfer", addr(SMART_ACCOUNT), addr(dest), i128(60_000_000_000n)); // 6000 @7dp
  const r4 = await invokeWithSaAuth({
    label: "agent-transfer-over-cap", op: transferBad, sourceKp: agent,
    contextRuleIds: [agentRuleId],
    signers: [{ key: agentSigner, keypair: agent }],
    expectFail: true,
  });
  console.log("    →", JSON.stringify(r4));

  console.log("\n=== SUMMARY ===");
  console.log("addRule  :", r1.ok ? "OK " + r1.hash : "FAIL " + r1.error);
  console.log("transfer<cap:", r3.ok ? "OK " + r3.hash : "FAIL " + r3.error);
  console.log("transfer>cap:", r4.ok ? "UNEXPECTED-OK " + r4.hash : "correctly REJECTED (" + r4.error + ")");
}

main().catch((e) => { console.error("Fatal:", e?.message ?? e); process.exit(1); });
