import { NextResponse } from "next/server";
import { listUsers, getUserWithPosition } from "../../../lib/runtime";

export const dynamic = "force-dynamic";

/**
 * GET /api/users           → all registered users + each one's per-user position.
 * GET /api/users?owner=G... → that single user + position, or 404 if unknown.
 *
 * Each user row is { owner, smartWallet, poolRuleId, usdcRuleId, createdAt,
 * position: { poolId, amountUsdc } } with amountUsdc as a decimal stroop string.
 */
export async function GET(req: Request) {
  const owner = new URL(req.url).searchParams.get("owner");
  if (owner) {
    const user = getUserWithPosition(owner);
    if (!user) return NextResponse.json({ error: "not registered" }, { status: 404 });
    return NextResponse.json(user);
  }
  return NextResponse.json({ users: listUsers() });
}
