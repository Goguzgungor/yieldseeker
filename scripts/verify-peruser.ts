/**
 * VERIFY (folded proof) — per-user smart accounts (ARMA model), REAL testnet tx.
 *
 * Proves the per-user agent-supply path THROUGH THE APP'S OWN CODE
 * (src/lib/smartAccount.ts buildAgentAuth / addAgentRuleOps, wallet.ts
 * createPolicySignerWallet, executor.ts createExecutor). Steps:
 *
 *   1. OWNER adds a context rule for CallContract(POOL) on the EXISTING smart
 *      account (CCL7S6FC…). The USDC-capped rule already exists (rule 1). We
 *      capture BOTH rule ids (pool rule = newly added, usdc rule = the existing
 *      capped one) and register the user in the app's SQLite registry.
 *   2. Read get_spending_limit_data to confirm there is cap headroom; pick a
 *      modest supply amount (default 500 USDC) that fits the remaining cap.
 *   3. Run ONE per-user execution: the AGENT (headless, restricted policy
 *      signer) supplies that USDC into the pool via the smart account, using the
 *      app's createPolicySignerWallet + executor (SupplyCollateral).
 *   4. Confirm successful=true; PoolV2.load shows the supply landed; print the
 *      tx hash (stellar.expert).
 *
 * Run:
 *   set -a; source scripts/spike-artifacts/keys.env; set +a
 *   npx tsx scripts/verify-peruser.ts
 *
 * NEVER prints secrets — only public G…/C… ids + tx hashes.
 */
import {
  Keypair,
  Address,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
import { PoolV2, type Network } from "@blend-capital/blend-sdk";
import {
  buildAgentAuth,
  addAgentRuleOps,
  readContextRulesCount,
  readSpendingLimitData,
} from "../src/lib/smartAccount.js";
import { createPolicySignerWallet } from "../src/lib/wallet.js";
import { createSorobanClient, createExecutor } from "../src/lib/executor.js";
import * as registry from "../src/lib/registry.js";

// ── Proven testnet ids (PROVEN-IDS.txt) ──────────────────────────────────────
const RPC = process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
const PASS = process.env.STELLAR_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";
const POOL = "CBI7WAUQ4NPQFZW4C3MDSVFAZJWV3RCLZSTTMA5OZ6BTPEQMOZZNSZ3Z";
const USDC_SAC = "CD2R7WREEPGIAXZL4ASB76Y6PWTY6ZZXZ6C64AIKFDIG36YKQPNY6B2I";
const ED25519_VERIFIER = "CBHJOANTAHF2ZKU5HZRZTWP4GX7YCSNR3V3AIMAH5P5R7S465SK24RSO";
const SPENDING_POLICY = "CBLNG63CIFKLFY6ZTL32NWMGPN7NBDSXZUSCQNTLMYRTLIZYA7MG3KAP";
const SMART_ACCOUNT = "CCL7S6FCKEXOXBKEZEYGPYT4NHTGSNGXM7ENGXRD2KC4FJYSVCEQBTKB";
const USDC_RULE_ID = Number(process.env.AGENT_RULE_ID ?? "1"); // existing capped rule
const PERIOD_LEDGERS = 17280;
const CAP_STROOPS = 5000_0000000n; // 5000 USDC / 17280 ledgers (the proven rule)

const server = new rpc.Server(RPC, { allowHttp: RPC.startsWith("http://") });
const owner = Keypair.fromSecret(req("OWNER_SECRET"));
const agent = Keypair.fromSecret(req("AGENT_SECRET"));

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name} — source scripts/spike-artifacts/keys.env`);
  return v;
}
const addr = (a: string) => nativeToScVal(Address.fromString(a), { type: "address" });

/** Submit an assembled+signed tx, poll to a final status. */
async function send(tx: { toXDR(): string } & Parameters<typeof server.sendTransaction>[0], label: string) {
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") {
    const e = (sent as { errorResult?: { toXDR?: (f: string) => string } }).errorResult;
    throw new Error(`${label} send ERROR: ${e?.toXDR?.("base64") ?? JSON.stringify(sent)}`);
  }
  let g = await server.getTransaction(sent.hash);
  for (let i = 0; i < 20 && g.status === "NOT_FOUND"; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    g = await server.getTransaction(sent.hash);
  }
  return { hash: sent.hash, status: g.status };
}

async function usdcBalance(who: string): Promise<bigint> {
  const src = await server.getAccount(agent.publicKey());
  const tx = new TransactionBuilder(src, { fee: BASE_FEE, networkPassphrase: PASS })
    .addOperation(new Contract(USDC_SAC).call("balance", addr(who)))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) return 0n;
  return BigInt(scValToNative((sim as rpc.Api.SimulateTransactionSuccessResponse).result!.retval).toString());
}

async function poolUsdcSupply(): Promise<bigint> {
  const network: Network = { rpc: RPC, passphrase: PASS };
  const loaded = await PoolV2.load(network, POOL);
  const reserve = loaded.reserves.get(USDC_SAC);
  return reserve ? reserve.totalSupply() : -1n;
}

async function main() {
  console.log("=== VERIFY per-user smart account (ARMA) — REAL testnet supply ===");
  console.log("  OWNER         =", owner.publicKey());
  console.log("  AGENT         =", agent.publicKey());
  console.log("  SMART_ACCOUNT =", SMART_ACCOUNT);
  console.log("  POOL          =", POOL);
  console.log("  USDC_SAC      =", USDC_SAC);

  const ownerRawHex = owner.rawPublicKey().toString("hex");
  const agentRawHex = agent.rawPublicKey().toString("hex");

  // ── STEP 1: OWNER adds the CallContract(POOL) rule (USDC rule already exists) ──
  // Build BOTH ops with addAgentRuleOps to exercise the app helper, but only
  // SUBMIT the pool rule (the USDC-capped rule is already on the SA as rule 1).
  const { poolRuleOp } = addAgentRuleOps({
    smartWallet: SMART_ACCOUNT,
    poolId: POOL,
    usdcSac: USDC_SAC,
    verifier: ED25519_VERIFIER,
    agentPublicKeyHex: agentRawHex,
    spendingPolicy: SPENDING_POLICY,
    capStroops: CAP_STROOPS,
    periodLedgers: PERIOD_LEDGERS,
  });

  const beforeCount = await readContextRulesCount({
    server, smartWallet: SMART_ACCOUNT, networkPassphrase: PASS, readerSource: agent.publicKey(),
  });
  console.log(`\n[1] add_context_rule CallContract(POOL) — owner-signed (rules before = ${beforeCount})`);

  // OWNER signs the SA's own auth entry under the Default rule (id 0). The agent
  // funds the fee. buildAgentAuth uses owner.rawPublicKey() as the External
  // signer key, so passing the OWNER keypair signs as the owner.
  const { tx: addRuleTx } = await buildAgentAuth({
    server,
    smartWallet: SMART_ACCOUNT,
    networkPassphrase: PASS,
    contextRuleIds: [0],
    agentKeypair: owner, // owner is the External signer here
    verifier: ED25519_VERIFIER,
    op: poolRuleOp,
    feeSource: agent.publicKey(),
  });
  addRuleTx.sign(agent); // agent pays the fee
  const r1 = await send(addRuleTx as never, "add_context_rule");
  console.log("    →", r1.status, r1.hash);
  if (r1.status !== "SUCCESS") throw new Error("add_context_rule did not succeed: " + r1.status);

  const afterCount = await readContextRulesCount({
    server, smartWallet: SMART_ACCOUNT, networkPassphrase: PASS, readerSource: agent.publicKey(),
  });
  const poolRuleId = afterCount - 1; // newest rule
  console.log(`    rules after = ${afterCount} → POOL rule id = ${poolRuleId}, USDC rule id = ${USDC_RULE_ID}`);

  // ── store in the app's registry ──
  // The runtime now holds the per-user registry IN-MEMORY (globalThis), not in
  // SQLite, so it resets per demo. This standalone script registers into its own
  // process's in-memory store purely to exercise the same code path + position
  // bookkeeping; it does NOT share state with a running Next server (a fresh
  // process has an empty registry — re-onboard via the UI to register there).
  await registry.registerUser({
    owner: owner.publicKey(),
    smartWallet: SMART_ACCOUNT,
    poolRuleId,
    usdcRuleId: USDC_RULE_ID,
    createdAt: Math.floor(Date.now() / 1000),
  });
  console.log("    registered user in in-memory registry:", JSON.stringify(registry.getUser(owner.publicKey())));

  // ── STEP 2: cap headroom + balance → choose supply amount ──
  const saBal = await usdcBalance(SMART_ACCOUNT);
  const spend = await readSpendingLimitData({
    server, spendingPolicy: SPENDING_POLICY, smartWallet: SMART_ACCOUNT,
    ruleId: USDC_RULE_ID, networkPassphrase: PASS, readerSource: agent.publicKey(),
  });
  console.log(`\n[2] SA USDC balance = ${saBal} (${(Number(saBal) / 1e7).toFixed(2)} USDC)`);
  console.log("    get_spending_limit_data(rule", USDC_RULE_ID, ") =",
    JSON.stringify(spend, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));

  // Compute remaining headroom if the policy exposes spent + limit; else assume full cap.
  let remaining = CAP_STROOPS;
  if (spend && typeof spend === "object") {
    const s = spend as Record<string, unknown>;
    const limit = typeof s.spending_limit === "bigint" ? s.spending_limit : CAP_STROOPS;
    const spent = typeof s.spent === "bigint" ? s.spent
      : typeof s.amount_spent === "bigint" ? s.amount_spent : 0n;
    remaining = limit - spent;
  }
  let amount = 500_0000000n; // modest default: 500 USDC
  if (remaining > 0n && amount > remaining) amount = remaining;
  if (saBal > 0n && amount > saBal) amount = saBal;
  if (amount <= 0n) {
    throw new Error(
      `No headroom/balance to supply (remaining=${remaining}, balance=${saBal}). ` +
        `The rolling cap window may not have reset, or the SA needs USDC. Re-run after the window or mint USDC.`,
    );
  }
  console.log(`    → supplying ${amount} stroops (${(Number(amount) / 1e7).toFixed(2)} USDC), remaining cap ≈ ${remaining}`);

  const poolSupplyBefore = await poolUsdcSupply();
  console.log(`    PoolV2.load USDC totalSupply BEFORE = ${poolSupplyBefore}`);

  // ── STEP 3: AGENT supplies via the smart account THROUGH THE APP CODE ──
  console.log("\n[3] AGENT supply via createPolicySignerWallet + executor (SupplyCollateral) …");
  const wallet = createPolicySignerWallet({
    smartWalletId: SMART_ACCOUNT,
    agentKeypair: agent,
    rpcUrl: RPC,
    networkPassphrase: PASS,
    verifier: ED25519_VERIFIER,
    contextRuleIds: [poolRuleId, USDC_RULE_ID], // pool.submit + nested usdc.transfer
    server,
  });
  const client = createSorobanClient({
    rpcUrl: RPC, networkPassphrase: PASS, walletAddress: SMART_ACCOUNT, usdcId: USDC_SAC,
  });
  const executor = createExecutor(client, wallet);
  const res = await executor.deposit(POOL, amount);
  console.log("    → executor.deposit result:", JSON.stringify(res));
  if (!res.success) throw new Error("per-user agent supply FAILED: " + res.error);
  const txHash = res.hashes[res.hashes.length - 1];

  // persist per-user position via the registry (same as the runtime)
  const prev = await registry.getUserPosition(SMART_ACCOUNT);
  const newAmount = (prev.poolId === POOL ? prev.amountUsdc : 0n) + amount;
  await registry.setUserPosition(SMART_ACCOUNT, { poolId: POOL, amountUsdc: newAmount });

  // ── STEP 4: confirm on-chain ──
  const poolSupplyAfter = await poolUsdcSupply();
  console.log("\n[4] CONFIRMATION");
  console.log(`    ✅ successful = true`);
  console.log(`    tx hash      = ${txHash}`);
  console.log(`    stellar.expert: https://stellar.expert/explorer/testnet/tx/${txHash}`);
  console.log(`    PoolV2.load USDC totalSupply AFTER = ${poolSupplyAfter}  (before ${poolSupplyBefore})`);
  console.log(`    per-user position stored: ${JSON.stringify({ poolId: POOL, amountUsdc: newAmount.toString() })}`);

  if (poolSupplyAfter <= poolSupplyBefore) {
    console.log("    ⚠ pool totalSupply did not increase — investigate (tx may have been a no-op).");
  } else {
    console.log(`    ✅ pool USDC supply increased by ${poolSupplyAfter - poolSupplyBefore} stroops — supply landed.`);
  }

  console.log("\n=== SUMMARY ===");
  console.log("POOL rule id   :", poolRuleId);
  console.log("USDC rule id   :", USDC_RULE_ID);
  console.log("supply tx hash :", txHash);
  console.log("pool supply Δ  :", (poolSupplyAfter - poolSupplyBefore).toString(), "stroops");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("FATAL:", e?.message ?? e);
  process.exit(1);
});
