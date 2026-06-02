import { NextResponse } from "next/server";
import { TransactionBuilder, rpc, type Transaction } from "@stellar/stellar-sdk";
import { z } from "zod";
import { getRuntime } from "../../../../lib/runtime";

export const dynamic = "force-dynamic";

const SubmitInput = z.object({
  /** A Freighter-signed tx envelope XDR (base64). */
  signedXdr: z.string().min(1),
  /** Optional label for the activity log. */
  label: z.string().optional(),
});

/**
 * POST /api/onboard/submit — submit a USER-signed onboarding tx (from
 * `/api/onboard/prepare` + Freighter `signTransaction`) to the testnet RPC and
 * poll to a final status. Keeps `@stellar/stellar-sdk` out of the browser bundle.
 *
 * Returns `{ hash, success, status }`.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = SubmitInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  let rt;
  try {
    rt = getRuntime();
  } catch (e) {
    return NextResponse.json({ error: `runtime unavailable: ${(e as Error).message}` }, { status: 500 });
  }
  const server = rt.execServer;
  const networkPassphrase = rt.cfg.execNetworkPassphrase;

  try {
    const tx = TransactionBuilder.fromXDR(parsed.data.signedXdr, networkPassphrase) as Transaction;
    const sent = await server.sendTransaction(tx);
    if (sent.status === "ERROR") {
      const err = (sent as rpc.Api.SendTransactionResponse & { errorResult?: { toXDR?: (f: string) => string } })
        .errorResult;
      return NextResponse.json(
        { hash: sent.hash, success: false, status: "ERROR", error: err?.toXDR?.("base64") ?? "send ERROR" },
        { status: 502 },
      );
    }
    let g = await server.getTransaction(sent.hash);
    for (let i = 0; i < 25 && g.status === "NOT_FOUND"; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      g = await server.getTransaction(sent.hash);
    }
    const success = g.status === "SUCCESS";
    if (parsed.data.label) {
      rt.db.log("onboard", `${parsed.data.label}: ${sent.hash} → ${g.status}`, { hash: sent.hash, status: g.status });
    }
    return NextResponse.json(
      { hash: sent.hash, success, status: g.status },
      { status: success ? 200 : 502 },
    );
  } catch (e) {
    return NextResponse.json({ error: `submit failed: ${(e as Error).message}` }, { status: 500 });
  }
}
