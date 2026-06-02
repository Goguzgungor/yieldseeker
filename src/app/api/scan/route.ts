import { NextResponse } from "next/server";
import { getLastScan } from "../../../lib/runtime";

export const dynamic = "force-dynamic";

// { pools: SerializedScoredPool[], updatedAt: number | null }
// `pools` contains BigInts rendered as strings; `updatedAt` is epoch-ms.
// Returns the cached snapshot immediately — never blocks on a fresh tick.
export async function GET() {
  return NextResponse.json(getLastScan());
}
