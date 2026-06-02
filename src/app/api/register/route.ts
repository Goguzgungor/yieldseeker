import { NextResponse } from "next/server";
import { registerUser, RegisterInput } from "../../../lib/runtime";

export const dynamic = "force-dynamic";

/**
 * POST /api/register — onboard a per-user smart account (ARMA model).
 *
 * Body: { owner, smartWallet, poolRuleId, usdcRuleId }
 *   - owner:       the user's classic G-address (Default-rule owner signer)
 *   - smartWallet: the user's deployed OZ SmartAccount C-address
 *   - poolRuleId:  context-rule id authorizing the agent for CallContract(POOL)
 *   - usdcRuleId:  context-rule id authorizing the agent for CallContract(USDC) (capped)
 *
 * The OWNER must have already deployed their smart account + added the two
 * agent context rules client-side (Freighter). This endpoint just records the
 * mapping so the agent loop can supply that user's idle USDC.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = RegisterInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const reg = registerUser(parsed.data);
  return NextResponse.json({ ok: true, user: reg }, { status: 201 });
}
