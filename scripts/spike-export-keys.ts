/**
 * SPIKE helper: derive owner secret (SEP-5) + read agent secret, write them to
 * scripts/spike-artifacts/keys.env (gitignored) so the stellar CLI can use them
 * via env vars. Prints only public addresses.
 *   npx tsx scripts/spike-export-keys.ts
 */
import "dotenv/config";
import { createHmac, pbkdf2Sync } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { Keypair } from "@stellar/stellar-sdk";
function mnemonicToSeed(m: string){const n=m.normalize("NFKD").trim().replace(/\s+/g," ");return pbkdf2Sync(n,"mnemonic",2048,64,"sha512");}
function master(s: Buffer){const I=createHmac("sha512",Buffer.from("ed25519 seed")).update(s).digest();return{key:I.subarray(0,32),cc:I.subarray(32)};}
function ckd(p:{key:Buffer;cc:Buffer},i:number){const h=(i|0x80000000)>>>0;const d=Buffer.alloc(37);d[0]=0;p.key.copy(d,1);d.writeUInt32BE(h,33);const I=createHmac("sha512",p.cc).update(d).digest();return{key:I.subarray(0,32),cc:I.subarray(32)};}
const seed=mnemonicToSeed(process.env.STELLAR_WALLET_MNEMONIC!);
let n=master(seed);for(const i of [44,148,0])n=ckd(n,i);
const owner=Keypair.fromRawEd25519Seed(n.key);
const agent=Keypair.fromSecret(process.env.AGENT_SIGNER_SECRET!);
mkdirSync("scripts/spike-artifacts",{recursive:true});
const out=`# gitignored spike keys — do not commit
export OWNER_SECRET='${owner.secret()}'
export OWNER_PUB='${owner.publicKey()}'
export AGENT_SECRET='${agent.secret()}'
export AGENT_PUB='${agent.publicKey()}'
export STELLAR_RPC_URL='https://soroban-testnet.stellar.org'
export STELLAR_NETWORK_PASSPHRASE='Test SDF Network ; September 2015'
`;
writeFileSync("scripts/spike-artifacts/keys.env",out,{mode:0o600});
console.log("Wrote scripts/spike-artifacts/keys.env (gitignored).");
console.log("OWNER_PUB="+owner.publicKey());
console.log("AGENT_PUB="+agent.publicKey());
