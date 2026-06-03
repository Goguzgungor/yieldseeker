/**
 * SPIKE: derive the owner (user) address from STELLAR_WALLET_MNEMONIC via SEP-5
 * (BIP39 -> SLIP-0010 ed25519, path m/44'/148'/<idx>'), and report status of the
 * owner + agent accounts on testnet (XLM balance, existence).
 *
 * Pure Node crypto + @stellar/stellar-sdk (no extra deps). Prints only PUBLIC
 * G-addresses; never prints the mnemonic or any secret.
 *
 *   npx tsx scripts/spike-derive-and-status.ts
 */
import "dotenv/config";
import { createHmac, pbkdf2Sync } from "node:crypto";
import { Keypair, Horizon } from "@stellar/stellar-sdk";

const HORIZON = process.env.EXEC_HORIZON_URL ?? "https://horizon-testnet.stellar.org";

// --- BIP39 mnemonic -> 64-byte seed (PBKDF2-HMAC-SHA512, 2048 iters) ---
function mnemonicToSeed(mnemonic: string, passphrase = ""): Buffer {
  const norm = mnemonic.normalize("NFKD").trim().replace(/\s+/g, " ");
  const salt = ("mnemonic" + passphrase).normalize("NFKD");
  return pbkdf2Sync(norm, salt, 2048, 64, "sha512");
}

// --- SLIP-0010 ed25519 master + hardened CKD ---
function slip10MasterKey(seed: Buffer): { key: Buffer; chainCode: Buffer } {
  const I = createHmac("sha512", Buffer.from("ed25519 seed")).update(seed).digest();
  return { key: I.subarray(0, 32), chainCode: I.subarray(32) };
}
function slip10CKDpriv(parent: { key: Buffer; chainCode: Buffer }, index: number) {
  // ed25519 SLIP-0010 only supports hardened derivation
  const hardened = (index | 0x80000000) >>> 0;
  const data = Buffer.alloc(1 + 32 + 4);
  data[0] = 0x00;
  parent.key.copy(data, 1);
  data.writeUInt32BE(hardened, 33);
  const I = createHmac("sha512", parent.chainCode).update(data).digest();
  return { key: I.subarray(0, 32), chainCode: I.subarray(32) };
}
function deriveSep5Seed(mnemonic: string, accountIndex: number): Buffer {
  const seed = mnemonicToSeed(mnemonic);
  let node = slip10MasterKey(seed);
  for (const idx of [44, 148, accountIndex]) node = slip10CKDpriv(node, idx);
  return node.key; // 32-byte ed25519 seed -> Stellar Keypair
}

async function status(label: string, addr: string, server: Horizon.Server) {
  try {
    const acc = await server.loadAccount(addr);
    const xlm = acc.balances.find((b: any) => b.asset_type === "native");
    const usdc = acc.balances.filter((b: any) => b.asset_code === "USDC");
    console.log(`  ${label}: ${addr}`);
    console.log(`     exists=true  XLM=${xlm?.balance ?? "?"}  trustlines=${acc.balances.length}`);
    for (const t of usdc) {
      console.log(`     USDC[${(t as any).asset_issuer?.slice(0, 6)}…]: balance=${(t as any).balance} limit=${(t as any).limit}`);
    }
  } catch (e: any) {
    const notFound = e?.response?.status === 404 || /not found/i.test(String(e?.message));
    console.log(`  ${label}: ${addr}`);
    console.log(`     exists=${notFound ? "false (needs Friendbot)" : "ERROR: " + (e?.message ?? e)}`);
  }
}

async function main() {
  const mnemonic = process.env.STELLAR_WALLET_MNEMONIC;
  const agentSecret = process.env.AGENT_SIGNER_SECRET;
  if (!mnemonic) throw new Error("STELLAR_WALLET_MNEMONIC missing");
  if (!agentSecret) throw new Error("AGENT_SIGNER_SECRET missing");

  const ownerSeed = deriveSep5Seed(mnemonic, 0);
  const owner = Keypair.fromRawEd25519Seed(ownerSeed);
  const agent = Keypair.fromSecret(agentSecret);

  console.log("=== Key roles (PUBLIC addresses only) ===");
  console.log(`  OWNER (mnemonic m/44'/148'/0'): ${owner.publicKey()}`);
  console.log(`  AGENT (AGENT_SIGNER_SECRET):    ${agent.publicKey()}`);
  console.log("\n=== Testnet account status (Horizon) ===");
  const server = new Horizon.Server(HORIZON);
  await status("OWNER", owner.publicKey(), server);
  await status("AGENT", agent.publicKey(), server);
}

main().catch((e) => {
  console.error("Fatal:", e?.message ?? e);
  process.exit(1);
});
