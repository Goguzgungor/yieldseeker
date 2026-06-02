import { NextResponse } from "next/server";
import { getAgentKeypair, getDemoOwnerKeypair } from "../../../lib/agentKeys";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent — the backend agent's public key (so the UI installs the
 * correct External agent signer when authorizing the agent rules), plus the
 * deterministic demo-owner public key used by the fallback authorize flow.
 *
 * Response:
 *   {
 *     agentPublicKey:     "G…",                 // the agent's classic address
 *     agentPublicKeyHex:  "<32-byte raw hex>",  // External signer key bytes
 *     ownerPublicKey:     "G…",                 // demo-owner classic address
 *     ownerPublicKeyHex:  "<32-byte raw hex>",  // Default-rule owner signer bytes
 *     // Freighter cannot produce the OZ SmartAccount AuthPayload owner signature
 *     // (it only signs the standard Soroban auth preimage, without the OZ
 *     // rule-id tail), so step 2 is backend-assisted: deploy with this demo
 *     // owner, and /api/authorize owner-signs the add_context_rule ops.
 *     freighterCanSignOwnerAuth: false,
 *     ownerMode: "demo-backend-owner"
 *   }
 *
 * Never returns any secret — only public G…/hex values derived from
 * AGENT_SIGNER_SECRET.
 */
export async function GET() {
  try {
    const agent = getAgentKeypair();
    const owner = getDemoOwnerKeypair();
    return NextResponse.json({
      agentPublicKey: agent.publicKey(),
      agentPublicKeyHex: agent.rawPublicKey().toString("hex"),
      ownerPublicKey: owner.publicKey(),
      ownerPublicKeyHex: owner.rawPublicKey().toString("hex"),
      freighterCanSignOwnerAuth: false,
      ownerMode: "demo-backend-owner",
    });
  } catch (e) {
    return NextResponse.json(
      { error: `agent key unavailable: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
