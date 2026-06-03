import { NextResponse } from "next/server";
import { getSerializedPosition, getDecision } from "../../../lib/runtime";

export const dynamic = "force-dynamic";

// { poolId, amountUsdc: <string>, chosenPoolId, rationale, action } — the
// current position (BigInt stroops as a decimal string) merged with the latest
// agent decision so the UI can highlight the chosen pool + show its rationale.
export async function GET() {
  const pos = await getSerializedPosition();
  const decision = await getDecision();
  return NextResponse.json({
    ...pos,
    chosenPoolId: decision.chosenPoolId,
    rationale: decision.rationale,
    action: decision.action,
  });
}
