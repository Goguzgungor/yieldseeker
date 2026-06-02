import { NextResponse } from "next/server";
import { getLastScan } from "../../../lib/runtime";

export const dynamic = "force-dynamic";

// Cached most-recent scan result (pool BigInts rendered as strings).
export async function GET() {
  return NextResponse.json(getLastScan());
}
