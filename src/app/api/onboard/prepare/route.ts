import { NextResponse } from "next/server";
import { BASE_FEE, TransactionBuilder } from "@stellar/stellar-sdk";
import { z } from "zod";
import { getRuntime } from "../../../../lib/runtime";
import { getDemoOwnerKeypair } from "../../../../lib/agentKeys";
import { buildDeployOp, buildFundUsdcOp, opFromXdr } from "../../../../lib/onboarding";

export const dynamic = "force-dynamic";

const PrepareInput = z.object({
  owner: z.string().min(1),
  step: z.enum(["deploy", "fund"]),
  /** Smart wallet C-address (required for `fund`). */
  smartWallet: z.string().min(1).optional(),
  /** Amount in stroops (decimal string) — required for `fund`. */
  amountStroops: z.string().regex(/^\d+$/).optional(),
});

/**
 * POST /api/onboard/prepare — server-side build + simulate/assemble of an
 * onboarding transaction the USER signs in Freighter. Returns an UNSIGNED,
 * fully-prepared (footprint/resources merged) tx XDR.
 *
 * We keep the heavy `@stellar/stellar-sdk` work server-side so the browser
 * bundle stays SDK-free; the client only runs Freighter `signTransaction` on
 * the returned XDR, then POSTs it to `/api/onboard/submit`.
 *
 *   step="deploy" → createCustomContract (new per-user smart account). The
 *                   wallet's Default-rule owner is the backend demo owner (so
 *                   /api/authorize can owner-sign add_context_rule). Response
 *                   also includes the deterministic `contractId`.
 *   step="fund"   → USDC SAC transfer(owner → smartWallet, amountStroops).
 *
 * Both ops are authorized by the user's classic account, so the user signs the
 * whole envelope (no smart-account AuthPayload).
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = PrepareInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const { owner, step } = parsed.data;

  let rt;
  try {
    rt = getRuntime();
  } catch (e) {
    return NextResponse.json({ error: `runtime unavailable: ${(e as Error).message}` }, { status: 500 });
  }
  const server = rt.execServer;
  const networkPassphrase = rt.cfg.execNetworkPassphrase;

  try {
    let opXdr: string;
    let contractId: string | undefined;

    if (step === "deploy") {
      const ownerHex = getDemoOwnerKeypair().rawPublicKey().toString("hex");
      const deploy = buildDeployOp({ deployer: owner, ownerPublicKeyHex: ownerHex });
      opXdr = deploy.opXdr;
      contractId = deploy.contractId;
    } else {
      if (!parsed.data.smartWallet || !parsed.data.amountStroops) {
        return NextResponse.json({ error: "fund requires smartWallet + amountStroops" }, { status: 400 });
      }
      opXdr = buildFundUsdcOp({
        from: owner,
        smartWallet: parsed.data.smartWallet,
        amountStroops: BigInt(parsed.data.amountStroops),
      });
    }

    const source = await server.getAccount(owner);
    const tx = new TransactionBuilder(source, {
      fee: (Number(BASE_FEE) * 1000).toString(),
      networkPassphrase,
    })
      .addOperation(opFromXdr(opXdr))
      .setTimeout(180)
      .build();

    // Simulate + assemble so the Soroban footprint/resources/fee are correct
    // BEFORE the user signs (a signed envelope can't be re-assembled).
    const prepared = await server.prepareTransaction(tx);

    return NextResponse.json({ xdr: prepared.toXDR(), contractId });
  } catch (e) {
    return NextResponse.json({ error: `prepare ${step} failed: ${(e as Error).message}` }, { status: 500 });
  }
}
