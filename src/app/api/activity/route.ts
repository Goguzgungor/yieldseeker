import { NextResponse } from "next/server";
import { getRecentLog } from "../../../lib/runtime";

export const dynamic = "force-dynamic";

// Recent activity log, newest first (db orders by id DESC).
export async function GET() {
  return NextResponse.json(getRecentLog(50));
}
