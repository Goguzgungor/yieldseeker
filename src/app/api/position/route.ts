import { NextResponse } from "next/server";
import { getSerializedPosition } from "../../../lib/runtime";

export const dynamic = "force-dynamic";

// { poolId, amountUsdc: <string> } — BigInt stroops rendered as a decimal string.
export async function GET() {
  return NextResponse.json(getSerializedPosition());
}
