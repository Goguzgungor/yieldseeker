/**
 * Shared helpers for the "deploy our own Blend V2 pool on testnet" scripts.
 *
 * Replicates blend-utils' invoke/sign/assemble/poll pattern (src/utils/{tx,contract}.ts)
 * but uses THIS project's already-installed @stellar/stellar-sdk@15 +
 * @blend-capital/blend-sdk@3.2.2, and reads keys from the env (keys.env, gitignored).
 *
 * Source env first:
 *   set -a; source scripts/spike-artifacts/keys.env; set +a
 *
 * NEVER prints secrets. Only G.../C... public ids and tx hashes.
 */
import {
  Keypair, rpc, xdr, Address, Operation, TransactionBuilder, Transaction,
  StrKey, hash, SorobanDataBuilder, Account,
} from "@stellar/stellar-sdk";
import { readFileSync, existsSync, appendFileSync, readFileSync as rf } from "node:fs";

export const RPC = process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
export const PASS = process.env.STELLAR_NETWORK_PASSPHRASE ?? "Test SDF Network ; September 2015";
export const FRIENDBOT = process.env.FRIENDBOT_URL ?? "https://friendbot.stellar.org/?addr=";

export const server = new rpc.Server(RPC, { allowHttp: RPC.startsWith("http://") });

export function ownerKp(): Keypair { return Keypair.fromSecret(reqEnv("OWNER_SECRET")); }
export function agentKp(): Keypair { return Keypair.fromSecret(reqEnv("AGENT_SECRET")); }

export function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name} (source scripts/spike-artifacts/keys.env)`);
  return v;
}

const FEE = (Number(100) * 10000).toString(); // 1_000_000 stroops, like blend-utils '10000'*100

/** Invoke a Soroban op (base64 XDR operation), simulate -> assemble -> sign -> send -> poll.
 *  Returns { hash, returnValue (scVal), status }. Throws on failure with diagnostics. */
export async function invoke(
  opXdrB64: string,
  signer: Keypair,
  opts: { label?: string; fee?: string } = {},
): Promise<{ hash: string; retval?: xdr.ScVal }> {
  const label = opts.label ?? "op";
  let account = await server.getAccount(signer.publicKey());
  const build = () =>
    new TransactionBuilder(account, { fee: opts.fee ?? FEE, networkPassphrase: PASS })
      .addOperation(xdr.Operation.fromXDR(opXdrB64, "base64"))
      .setTimeout(120)
      .build();

  let tx = build();
  let sim = await server.simulateTransaction(tx);

  // Handle archived-entry restore (rare on a fresh deploy, but be safe)
  if (rpc.Api.isSimulationRestore(sim)) {
    const restoreFee = Number(sim.restorePreamble.minResourceFee) + 10000;
    const ra = await server.getAccount(signer.publicKey());
    const restoreTx = new TransactionBuilder(ra, { fee: restoreFee.toString(), networkPassphrase: PASS })
      .setSorobanData(sim.restorePreamble.transactionData.build())
      .addOperation(Operation.restoreFootprint({}))
      .setTimeout(120)
      .build();
    restoreTx.sign(signer);
    await sendAndPoll(restoreTx, `${label}:restore`);
    account = await server.getAccount(signer.publicKey());
    tx = build();
    sim = await server.simulateTransaction(tx);
  }

  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`${label} simulate failed: ${sim.error}`);
  }
  const assembled = rpc.assembleTransaction(tx, sim).build();
  assembled.sign(signer);
  const res = await sendAndPoll(assembled, label);
  const retval = (sim as rpc.Api.SimulateTransactionSuccessResponse).result?.retval;
  return { hash: res.hash, retval };
}

/** Classic (non-Soroban) op: build, sign, send, poll. */
export async function invokeClassic(opXdrB64: string, signer: Keypair, label = "classic"): Promise<{ hash: string }> {
  const account = await server.getAccount(signer.publicKey());
  const tx = new TransactionBuilder(account, { fee: FEE, networkPassphrase: PASS })
    .addOperation(xdr.Operation.fromXDR(opXdrB64, "base64"))
    .setTimeout(180)
    .build();
  tx.sign(signer);
  const res = await sendAndPoll(tx, label);
  return { hash: res.hash };
}

async function sendAndPoll(tx: Transaction, label: string): Promise<{ hash: string }> {
  let sent = await server.sendTransaction(tx);
  const start = Date.now();
  while (sent.status === "TRY_AGAIN_LATER" && Date.now() - start < 30000) {
    await sleep(3000);
    sent = await server.sendTransaction(tx);
  }
  if (sent.status === "ERROR") {
    const errb64 = (sent as any).errorResult?.toXDR?.("base64") ?? JSON.stringify(sent.errorResult);
    throw new Error(`${label} send ERROR: ${errb64}`);
  }
  let g = await server.getTransaction(sent.hash);
  for (let i = 0; i < 30 && g.status === "NOT_FOUND"; i++) {
    await sleep(1000);
    g = await server.getTransaction(sent.hash);
  }
  if (g.status !== "SUCCESS") {
    let diag = "";
    if (g.status === "FAILED") {
      try { diag = (g as any).resultXdr?.toXDR?.("base64") ?? ""; } catch { /* ignore */ }
    }
    throw new Error(`${label} tx ${sent.hash} status=${g.status} ${diag}`);
  }
  return { hash: sent.hash };
}

export function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

/** Upload a wasm; returns its hash (hex). Idempotent (re-upload of same wasm is a no-op cost-wise). */
export async function installWasm(wasmPath: string, signer: Keypair, label: string): Promise<string> {
  const wasm = readFileSync(wasmPath);
  const wasmHash = hash(wasm);
  const op = Operation.invokeHostFunction({
    func: xdr.HostFunction.hostFunctionTypeUploadContractWasm(wasm),
    auth: [],
  });
  await invoke(op.toXDR("base64"), signer, { label: `install:${label}` });
  return wasmHash.toString("hex");
}

/** Deterministic contract id from (deployer account, salt) — matches blend-utils generateContractId. */
export function generateContractId(accountId: string, salt: Buffer): string {
  const networkId = hash(Buffer.from(PASS));
  const pre = xdr.ContractIdPreimage.contractIdPreimageFromAddress(
    new xdr.ContractIdPreimageFromAddress({
      address: Address.fromString(accountId).toScAddress(),
      salt,
    }),
  );
  const hp = xdr.HashIdPreimage.envelopeTypeContractId(
    new xdr.HashIdPreimageContractId({ networkId, contractIdPreimage: pre }),
  );
  return StrKey.encodeContract(hash(hp.toXDR()));
}

/** Bump a contract instance TTL (extend footprint).
 *  Must simulate first so the Soroban resource fee is computed (a raw submit
 *  yields txSorobanInvalid). Mirrors blend-utils invokeSorobanOperation: set the
 *  footprint as a hint via SorobanData, simulate, then assemble (which sets fee). */
export async function bumpInstance(contractId: string, signer: Keypair, label: string) {
  const key = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: Address.fromString(contractId).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent(),
    }),
  );
  const sorobanData = new SorobanDataBuilder().setReadOnly([key]).build();
  const account = await server.getAccount(signer.publicKey());
  const tx = new TransactionBuilder(account, { fee: FEE, networkPassphrase: PASS })
    .setSorobanData(sorobanData)
    .addOperation(Operation.extendFootprintTtl({ extendTo: 535670 }))
    .setTimeout(120)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`bumpInstance:${label} simulate failed: ${sim.error}`);
  }
  const assembled = rpc.assembleTransaction(tx, sim).build();
  assembled.sign(signer);
  await sendAndPoll(assembled, `bumpInstance:${label}`);
}

// ---------- artifacts env (scripts/spike-artifacts/blend-pool.env) ----------
export const ARTIFACT_ENV = "scripts/spike-artifacts/blend-pool.env";

/** Load existing blend-pool.env values into a map (so the deploy is resumable). */
export function loadArtifacts(): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(ARTIFACT_ENV)) return out;
  for (const line of rf(ARTIFACT_ENV, "utf8").split("\n")) {
    const m = line.match(/^export\s+([A-Z0-9_]+)='([^']*)'/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

/** Append/record a key to blend-pool.env (and process.env) if not already present with same value. */
export function recordArtifact(key: string, value: string) {
  const cur = loadArtifacts();
  if (cur[key] === value) { process.env[key] = value; return; }
  appendFileSync(ARTIFACT_ENV, `export ${key}='${value}'\n`);
  process.env[key] = value;
  console.log(`  recorded ${key}=${value}`);
}

export { Account };
