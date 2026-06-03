import { NextResponse } from "next/server";
import { getRecentLog } from "../../../lib/runtime";

export const dynamic = "force-dynamic";

// Recent activity log, newest first.
export async function GET() {
  return NextResponse.json(await getRecentLog(50));
}
