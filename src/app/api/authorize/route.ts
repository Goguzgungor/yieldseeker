import { NextResponse } from "next/server";
import { rpc } from "@stellar/stellar-sdk";
import { z } from "zod";
import { getRuntime } from "../../../lib/runtime";
import { getDemoOwnerKeypair } from "../../../lib/agentKeys";
import {
  addAgentRuleOps,
  buildAgentAuth,
  readContextRulesCount,
} from "../../../lib/smartAccount";
import { DEFAULT_CAP_STROOPS, PERIOD_LEDGERS } from "../../../lib/onboarding";

export const dynamic = "force-dynamic";

const AuthorizeInput = z.object({
  /** The deployed per-user OZ SmartAccount (C…). */
  smartWallet: z.string().min(1),
  /** The user's classic G-address (informational; recorded with the request). */
  owner: z.string().min(1).optional(),
  /** Optional USDC cap (stroops, decimal string). Defaults to 5000 USDC. */
  capStroops: z.string().regex(/^\d+$/).optional(),
});

/**
 * POST /api/authorize — BACKEND-ASSISTED step 2 of onboarding (the documented
 * fallback). Adds the two agent context rules to a freshly-deployed per-user
 * smart account:
 *   1. CallContract(POOL)  — uncapped
 *   2. CallContract(USDC)  — spending-limit capped
 *
 * WHY backend-assisted: each `add_context_rule` requires the SmartAccount
 * OWNER's custom OZ AuthPayload signature over
 * `sha256(signaturePayload || scvVec([ruleIds]).toXDR())` (Default rule 0).
 * Freighter's `signAuthEntry` only signs the STANDARD Soroban auth preimage
 * (without the OZ rule-id tail), so it cannot produce this signature. We
 * therefore deploy the wallet with a deterministic backend DEMO OWNER (see
 * `/api/agent` + agentKeys.ts) and owner-sign here via {@link buildAgentAuth}
 * with `contextRuleIds: [0]` — exactly the proven verify-peruser.ts flow. The
 * agent funds the fee.
 *
 * Returns `{ poolRuleId, usdcRuleId, hashes }` so the client can register the
 * user (`POST /api/register`).
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = AuthorizeInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { smartWallet } = parsed.data;
  const capStroops = parsed.data.capStroops ? BigInt(parsed.data.capStroops) : DEFAULT_CAP_STROOPS;

  let rt;
  let owner;
  try {
    rt = getRuntime();
    owner = getDemoOwnerKeypair();
  } catch (e) {
    return NextResponse.json(
      { error: `runtime/key unavailable: ${(e as Error).message}` },
      { status: 500 },
    );
  }

  const server = rt.execServer;
  const agent = rt.agentKeypair;
  const networkPassphrase = rt.cfg.execNetworkPassphrase;
  const agentRawHex = agent.rawPublicKey().toString("hex");

  /** Owner-sign one add_context_rule op (Default rule 0), agent pays the fee, submit + poll. */
  async function submitOwnerRule(op: Parameters<typeof buildAgentAuth>[0]["op"], label: string): Promise<string> {
    const { tx } = await buildAgentAuth({
      server,
      smartWallet,
      networkPassphrase,
      contextRuleIds: [0], // Default (owner) rule authorizes rule management
      agentKeypair: owner!, // demo owner is the External signer here
      verifier: rt!.cfg.ed25519VerifierId,
      op,
      feeSource: agent.publicKey(), // agent funds the fee
    });
    tx.sign(agent);
    const sent = await server.sendTransaction(tx);
    if (sent.status === "ERROR") {
      const err = (sent as rpc.Api.SendTransactionResponse & { errorResult?: { toXDR?: (f: string) => string } })
        .errorResult;
      throw new Error(`${label} send ERROR: ${err?.toXDR?.("base64") ?? sent.status}`);
    }
    let g = await server.getTransaction(sent.hash);
    for (let i = 0; i < 20 && g.status === "NOT_FOUND"; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      g = await server.getTransaction(sent.hash);
    }
    if (g.status !== "SUCCESS") throw new Error(`${label} did not succeed: ${g.status}`);
    return sent.hash;
  }

  try {
    // Sanity: the smart wallet must exist + be a deployed contract instance.
    // (A read-only get_context_rules_count both validates it and gives us the
    // baseline rule count to derive the new ids from.)
    const beforeCount = await readContextRulesCount({
      server,
      smartWallet,
      networkPassphrase,
      readerSource: agent.publicKey(),
    });

    const { poolRuleOp, usdcRuleOp } = addAgentRuleOps({
      smartWallet,
      poolId: rt.cfg.execPoolId,
      usdcSac: rt.cfg.execUsdcContractId,
      verifier: rt.cfg.ed25519VerifierId,
      agentPublicKeyHex: agentRawHex,
      spendingPolicy: rt.cfg.spendingPolicyId,
      capStroops,
      periodLedgers: PERIOD_LEDGERS,
    });

    // Add the pool rule first, then the USDC rule — capture each id from the
    // count after it lands (newest rule = count - 1).
    const poolHash = await submitOwnerRule(poolRuleOp, "add_context_rule(POOL)");
    const afterPool = await readContextRulesCount({
      server,
      smartWallet,
      networkPassphrase,
      readerSource: agent.publicKey(),
    });
    const poolRuleId = afterPool - 1;

    const usdcHash = await submitOwnerRule(usdcRuleOp, "add_context_rule(USDC)");
    const afterUsdc = await readContextRulesCount({
      server,
      smartWallet,
      networkPassphrase,
      readerSource: agent.publicKey(),
    });
    const usdcRuleId = afterUsdc - 1;

    rt.db.log(
      "authorize",
      `agent authorized on SA ${smartWallet} (pool rule ${poolRuleId}, usdc rule ${usdcRuleId})`,
      { smartWallet, poolRuleId, usdcRuleId, beforeCount, afterUsdc },
    );

    return NextResponse.json({
      ok: true,
      smartWallet,
      poolRuleId,
      usdcRuleId,
      hashes: [poolHash, usdcHash],
      ownerMode: "demo-backend-owner",
    });
  } catch (e) {
    return NextResponse.json(
      { error: `authorize failed: ${(e as Error).message}`, ownerMode: "demo-backend-owner" },
      { status: 500 },
    );
  }
}
