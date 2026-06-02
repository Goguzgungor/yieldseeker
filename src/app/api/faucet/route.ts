import { NextResponse } from "next/server";
import { getRuntime, getUsdcBalanceStroops } from "../../../lib/runtime";
import { deriveOwnerKeypair, mintUsdc, parseFaucetRequest } from "../../../lib/faucet";

export const dynamic = "force-dynamic";

/**
 * POST /api/faucet — self-serve testnet USDC faucet.
 *
 * We control our own testnet USDC SAC (`EXEC_USDC_CONTRACT_ID`, a wrapped classic
 * asset `USDC:OWNER` whose admin/issuer is the OWNER key derived SEP-5 from
 * `STELLAR_WALLET_MNEMONIC`). Only that admin can `mint`, so the backend mints on
 * demand — letting a user fund their smart account during onboarding WITHOUT
 * sourcing USDC externally (the official Blend-testnet USDC is unmintable;
 * mainnet USDC nobody has).
 *
 * Body: `{ to: string, amount?: number }`
 *   - `to`:     recipient — preferred the user's smart account `C…` (no classic
 *               trustline needed); a classic `G…` works only if it already holds
 *               a USDC trustline.
 *   - `amount`: whole USDC (default 1000, capped at 5000). Converted to stroops
 *               (7 decimals) server-side.
 *
 * Returns `{ ok, txHash, amount, to, balanceStroops }` on success, or
 * `{ ok:false, error }` with a clear, secret-free message on failure.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  // Validate + normalize the request (pure; throws a clear message on bad input).
  let to: string;
  let amountUsdc: number;
  let amountStroops: bigint;
  try {
    ({ to, amountUsdc, amountStroops } = parseFaucetRequest(
      (body ?? {}) as { to: unknown; amount?: unknown },
    ));
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }

  // Resolve runtime (exec RPC/passphrase/USDC SAC) + the owner (SAC admin) key.
  let rt;
  let owner;
  try {
    rt = getRuntime();
    owner = deriveOwnerKeypair();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `faucet unavailable: ${(e as Error).message}` },
      { status: 500 },
    );
  }

  try {
    const { txHash } = await mintUsdc({
      to,
      amountStroops,
      rpcUrl: rt.cfg.execRpcUrl,
      networkPassphrase: rt.cfg.execNetworkPassphrase,
      usdcSac: rt.cfg.execUsdcContractId,
      ownerKeypair: owner,
      server: rt.execServer, // reuse the runtime's RPC client
    });

    // Best-effort: read the recipient's new USDC balance so the UI can refresh.
    // 0n on any read error — never fails an otherwise-successful mint response.
    const balanceStroops = await getUsdcBalanceStroops(to);

    rt.db.log("faucet", `minted ${amountUsdc} USDC → ${to}`, {
      to,
      amount: amountUsdc,
      txHash,
    });

    return NextResponse.json({
      ok: true,
      txHash,
      amount: amountUsdc,
      to,
      balanceStroops: balanceStroops.toString(),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `faucet mint failed: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
