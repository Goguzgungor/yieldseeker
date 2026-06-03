import { NextResponse } from "next/server";
import { getDecision } from "../../../lib/runtime";

export const dynamic = "force-dynamic";

// { action, chosenPoolId, rationale } — the latest agent decision. `chosenPoolId`
// is null while idle/holding; `rationale` is the agent's free-text explanation.
export async function GET() {
  return NextResponse.json(await getDecision());
}
