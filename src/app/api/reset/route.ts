import { NextResponse } from "next/server";
import { resetRegistry, listUsers, registryStoreId } from "../../../lib/runtime";

export const dynamic = "force-dynamic";

/**
 * POST /api/reset — clear the ENTIRE in-memory per-user registry (all users +
 * positions) so the whole demo can be re-run WITHOUT restarting the server.
 * After this, every connected wallet sees the onboarding again.
 *
 * Returns `{ ok, removed }` (count of users that were registered).
 */
export async function POST() {
  const removed = await resetRegistry();
  return NextResponse.json({ ok: true, removed });
}

/**
 * GET /api/reset — diagnostic snapshot of the in-memory registry as seen by a
 * ROUTE HANDLER instance. Reports the live `globalThis` store id + the current
 * user owners. Used by the globalThis-sharing probe (and handy to eyeball that a
 * route-written registration is visible to a separate request). Never mutates.
 */
export async function GET() {
  const users = await listUsers();
  return NextResponse.json({
    storeId: registryStoreId(),
    pid: process.pid,
    users: users.map((u) => ({ owner: u.owner, smartWallet: u.smartWallet })),
    count: users.length,
  });
}
