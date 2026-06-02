/**
 * Smart-account (OpenZeppelin SmartAccount) agent policy-signer core.
 *
 * PROVEN on testnet (see scripts/spike-sa-auth.ts + spike-prove-flow.ts /
 * spike-prove-cap.ts). This module ports that working logic into clean, typed,
 * framework-free functions usable from both the runtime and one-off scripts.
 *
 * The smart account delegates signing to an External ed25519 signer (the agent
 * backend key) under a restricted context rule (e.g. "may only CallContract the
 * Blend pool / USDC, within a spending cap"). To authorize a host-function
 * invocation we must build + sign the contract's custom `AuthPayload` for its
 * OWN Soroban auth entry, exactly as the contract's `__check_auth` verifies it:
 *
 *   signaturePayload = sha256( HashIdPreimage.sorobanAuthorization{ networkId,
 *                       nonce, signatureExpirationLedger, invocation } )
 *   authDigest       = sha256( signaturePayload || scvVec([u32 ruleIds]).toXDR() )
 *   signature        = ed25519.sign(authDigest)        (raw 64 bytes)
 *   entry.signature  = ScVal.Map{ context_rule_ids: Vec<u32>,
 *                                  signers: Map<Signer::External(verifier,key), Bytes> }
 *
 * Because the first (recording-auth) simulation mocks `__check_auth`, its
 * footprint omits the ContextRuleData reads + verifier cross-contract call.
 * {@link buildAgentAuth} therefore re-simulates the *signed* transaction and
 * assembles it, so the final footprint/resources are correct on submit.
 *
 * Pure @stellar/stellar-sdk — fully headless, no network calls except the two
 * RPC simulations + getLatestLedger that {@link buildAgentAuth} performs through
 * the injected `server`.
 */
import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  hash,
  nativeToScVal,
  Operation,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
  type Keypair,
  type Transaction,
} from "@stellar/stellar-sdk";

/** External signer descriptor for the AuthPayload signer-map key. */
export interface ExternalSignerKey {
  /** C... ed25519-verifier contract id. */
  verifier: string;
  /** 32-byte ed25519 public key, hex. */
  publicKeyHex: string;
}

/**
 * Encode `Signer::External(verifier, keyBytes)` exactly as the contract expects
 * (an enum tuple variant: symbol tag + Address + Bytes).
 */
export function externalSignerScVal(s: ExternalSignerKey): xdr.ScVal {
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol("External"),
    xdr.ScVal.scvAddress(Address.fromString(s.verifier).toScAddress()),
    xdr.ScVal.scvBytes(Buffer.from(s.publicKeyHex, "hex")),
  ]);
}

/**
 * Build the `AuthPayload` ScVal:
 *   { context_rule_ids: Vec<u32>, signers: Map<Signer, Bytes> }
 *
 * Soroban requires ScMap keys to be sorted by their XDR byte encoding, so the
 * signer entries are sorted before assembly.
 */
export function writeAuthPayload(
  contextRuleIds: number[],
  signerSigs: Array<{ signer: ExternalSignerKey; sig: Buffer }>,
): xdr.ScVal {
  const signerEntries = signerSigs.map(
    ({ signer, sig }) =>
      new xdr.ScMapEntry({
        key: externalSignerScVal(signer),
        val: xdr.ScVal.scvBytes(sig),
      }),
  );
  signerEntries.sort((a, b) => a.key().toXDR("hex").localeCompare(b.key().toXDR("hex")));
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("context_rule_ids"),
      val: xdr.ScVal.scvVec(contextRuleIds.map((id) => xdr.ScVal.scvU32(id))),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("signers"),
      val: xdr.ScVal.scvMap(signerEntries),
    }),
  ]);
}

/** `signaturePayload = sha256(HashIdPreimage.sorobanAuthorization(...))`. */
export function buildSignaturePayload(
  networkPassphrase: string,
  entry: xdr.SorobanAuthorizationEntry,
  expirationLedger: number,
): Buffer {
  const addrCreds = entry.credentials().address();
  const preimage = xdr.HashIdPreimage.envelopeTypeSorobanAuthorization(
    new xdr.HashIdPreimageSorobanAuthorization({
      networkId: hash(Buffer.from(networkPassphrase)),
      nonce: addrCreds.nonce(),
      signatureExpirationLedger: expirationLedger,
      invocation: entry.rootInvocation(),
    }),
  );
  return hash(preimage.toXDR());
}

/** `authDigest = sha256(signaturePayload || scvVec([u32 ruleIds]).toXDR())`. */
export function buildAuthDigest(signaturePayload: Buffer, contextRuleIds: number[]): Buffer {
  const ruleIdsXdr = xdr.ScVal.scvVec(contextRuleIds.map((id) => xdr.ScVal.scvU32(id))).toXDR();
  return hash(Buffer.concat([signaturePayload, ruleIdsXdr]));
}

/**
 * Sign every smart-account auth entry in `entries` whose address == smartAccount,
 * using the given External signers (one signature per provided keypair). Mutates
 * the entries in place (sets credentials.address.signature + expiration).
 *
 * Entries whose address is NOT the smart account (e.g. a SAC issuer's own
 * `require_auth`) are left untouched so the caller can sign them separately.
 */
export function signSmartAccountEntries(opts: {
  entries: xdr.SorobanAuthorizationEntry[];
  smartAccount: string;
  networkPassphrase: string;
  expirationLedger: number;
  contextRuleIds: number[];
  signers: Array<{ key: ExternalSignerKey; keypair: Keypair }>;
}): void {
  const saScAddr = Address.fromString(opts.smartAccount).toScAddress().toXDR("hex");
  for (const entry of opts.entries) {
    if (entry.credentials().switch().name !== "sorobanCredentialsAddress") continue;
    const addrCreds = entry.credentials().address();
    if (addrCreds.address().toXDR("hex") !== saScAddr) continue;

    addrCreds.signatureExpirationLedger(opts.expirationLedger);
    const sigPayload = buildSignaturePayload(opts.networkPassphrase, entry, opts.expirationLedger);
    const authDigest = buildAuthDigest(sigPayload, opts.contextRuleIds);

    const signerSigs = opts.signers.map(({ key, keypair }) => ({
      signer: key,
      sig: keypair.sign(authDigest),
    }));
    addrCreds.signature(writeAuthPayload(opts.contextRuleIds, signerSigs));
  }
}

/**
 * Minimal subset of `rpc.Server` that {@link buildAgentAuth} needs. A concrete
 * `rpc.Server` satisfies this structurally; tests can supply a mock that returns
 * a real {@link Account} (e.g. `new Account(id, seq)`) and a canned simulate
 * response, so no network is required.
 */
export interface SimulatingServer {
  getAccount(address: string): Promise<Account>;
  getLatestLedger(): Promise<{ sequence: number }>;
  simulateTransaction(tx: Transaction): Promise<rpc.Api.SimulateTransactionResponse>;
}

export interface BuildAgentAuthResult {
  /**
   * A fully-assembled, ready-to-sign-and-submit Transaction whose single
   * invokeHostFunction op carries the smart-account auth entry signed by the
   * agent, with the re-simulated footprint/resources merged in.
   *
   * The caller still signs the transaction *envelope* with the fee-source
   * keypair (the agent, in our setup) before submitting.
   */
  tx: Transaction;
  /** The signed Soroban auth entries (for inspection / re-use). */
  authEntries: xdr.SorobanAuthorizationEntry[];
  /** The signatureExpirationLedger used for the auth entries. */
  expirationLedger: number;
}

/**
 * Build + sign the smart account's own auth entry for a single host-function
 * `op`, returning a ready-to-submit (assembled) transaction. This is the
 * two-pass-simulate flow proven in spike-prove-flow.ts (`invokeWithSaAuth`):
 *
 *   1. build a tx with `op` from `feeSourceKp`, simulate (recording auth) to
 *      discover the auth entries.
 *   2. sign the smart-account auth entry via {@link signSmartAccountEntries}.
 *   3. rebuild the op WITH the signed auth, RE-SIMULATE so the footprint
 *      includes the __check_auth reads + verifier call, then assembleTransaction.
 *
 * The returned `tx` is NOT yet envelope-signed — sign it with `feeSourceKp`
 * (or whatever account pays the fee) and submit.
 *
 * `expirationLedger`, when omitted, defaults to `getLatestLedger().sequence + 100`.
 */
export async function buildAgentAuth(opts: {
  server: SimulatingServer;
  /** Smart wallet (C...) contract id whose auth entry we sign. */
  smartWallet: string;
  networkPassphrase: string;
  /** Context rule id(s) the agent signs under (e.g. the agent's restricted rule). */
  contextRuleIds: number[];
  /** The agent keypair (its rawPublicKey is the External signer's public key). */
  agentKeypair: Keypair;
  /** The ed25519-verifier contract id the smart account is configured with. */
  verifier: string;
  /** The single host-function operation to authorize + invoke. */
  op: xdr.Operation;
  /**
   * Account that pays the fee / is the tx source. Defaults to the agent's own
   * public key (matches the proven spike, where the agent funds the fee).
   */
  feeSource?: string;
  /** Optional explicit expiration ledger; defaults to latest + 100. */
  expirationLedger?: number;
  /** Tx fee for the simulate/assemble passes. Defaults to BASE_FEE * 1000. */
  fee?: string;
}): Promise<BuildAgentAuthResult> {
  const feeSource = opts.feeSource ?? opts.agentKeypair.publicKey();
  const fee = opts.fee ?? (Number(BASE_FEE) * 1000).toString();
  const networkPassphrase = opts.networkPassphrase;

  const agentSigner: ExternalSignerKey = {
    verifier: opts.verifier,
    publicKeyHex: opts.agentKeypair.rawPublicKey().toString("hex"),
  };

  // 1) build + simulate (recording auth) to discover auth entries.
  const src1 = await opts.server.getAccount(feeSource);
  const built = new TransactionBuilder(src1, { fee, networkPassphrase })
    .addOperation(opts.op)
    .setTimeout(120)
    .build();

  const sim1 = await opts.server.simulateTransaction(built);
  if (rpc.Api.isSimulationError(sim1)) {
    throw new Error(`buildAgentAuth: simulate failed: ${sim1.error}`);
  }
  const sim1Ok = sim1 as rpc.Api.SimulateTransactionSuccessResponse;

  // 2) clone the auth entries and sign the smart-account entry manually.
  const rawEntries = sim1Ok.result?.auth ?? [];
  const entries = rawEntries.map((e) =>
    xdr.SorobanAuthorizationEntry.fromXDR(e.toXDR()),
  );
  const expirationLedger =
    opts.expirationLedger ?? (await opts.server.getLatestLedger()).sequence + 100;
  signSmartAccountEntries({
    entries,
    smartAccount: opts.smartWallet,
    networkPassphrase,
    expirationLedger,
    contextRuleIds: opts.contextRuleIds,
    signers: [{ key: agentSigner, keypair: opts.agentKeypair }],
  });

  // 3) rebuild the op WITH the signed auth, re-simulate, assemble.
  const invokeOp = built.operations[0] as Operation.InvokeHostFunction;
  const signedOp = Operation.invokeHostFunction({ func: invokeOp.func, auth: entries });
  const src2 = await opts.server.getAccount(feeSource);
  const preTx = new TransactionBuilder(src2, { fee, networkPassphrase })
    .addOperation(signedOp)
    .setTimeout(120)
    .build();

  const sim2 = await opts.server.simulateTransaction(preTx);
  if (rpc.Api.isSimulationError(sim2)) {
    throw new Error(`buildAgentAuth: re-simulate failed: ${sim2.error}`);
  }
  const sim2Ok = sim2 as rpc.Api.SimulateTransactionSuccessResponse;

  // preTx already carries our signed auth; assembleTransaction merges the
  // re-simulated footprint/resources and preserves the existing auth entries.
  const tx = rpc.assembleTransaction(preTx, sim2Ok).build();

  return { tx, authEntries: entries, expirationLedger };
}

/**
 * Build the `add_context_rule(context_type, name, valid_until, signers, policies)`
 * operation that registers a RESTRICTED agent rule on the smart account:
 * "the agent (External ed25519 signer) may only CallContract `targetContract`,
 * subject to the spending-limit policy with `spendingLimitStroops` over
 * `periodLedgers`". Mirrors STEP 1 of spike-prove-flow.ts.
 *
 * The returned op still needs the smart account's auth (signed by the OWNER
 * under rule 0 / Default) — pass it through {@link buildAgentAuth} with the
 * owner keypair + `contextRuleIds: [0]`.
 */
export function registerAgentRuleOp(opts: {
  smartWallet: string;
  /** Contract id the agent rule is scoped to (e.g. the Blend pool or USDC SAC). */
  targetContract: string;
  /** ed25519-verifier contract id. */
  verifier: string;
  /** Agent ed25519 public key, 32-byte hex (the External signer key). */
  agentPublicKeyHex: string;
  /** Spending-limit policy contract id. */
  spendingPolicy: string;
  /** Spending cap in stroops (i128) over the rolling window. */
  spendingLimitStroops: bigint;
  /** Rolling window length in ledgers (e.g. 17280 ≈ 1 day on testnet). */
  periodLedgers: number;
  /** Human-readable rule name. */
  name?: string;
}): xdr.Operation {
  const addr = (a: string) => nativeToScVal(Address.fromString(a), { type: "address" });

  const installParam = nativeToScVal(
    { period_ledgers: opts.periodLedgers, spending_limit: opts.spendingLimitStroops },
    {
      type: {
        period_ledgers: ["symbol", "u32"],
        spending_limit: ["symbol", "i128"],
      },
    } as never,
  );
  const ctxCallTarget = xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol("CallContract"),
    addr(opts.targetContract),
  ]);
  const agentSignerScVal = xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol("External"),
    addr(opts.verifier),
    xdr.ScVal.scvBytes(Buffer.from(opts.agentPublicKeyHex, "hex")),
  ]);
  const policiesMap = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: addr(opts.spendingPolicy), val: installParam }),
  ]);
  return new Contract(opts.smartWallet).call(
    "add_context_rule",
    ctxCallTarget,
    nativeToScVal(opts.name ?? "agent-capped", { type: "string" }),
    xdr.ScVal.scvVoid(), // valid_until = None
    xdr.ScVal.scvVec([agentSignerScVal]),
    policiesMap,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Onboarding / registry helpers (used by /api/register + verify-peruser).
//
// In the real product the OWNER signs all of the below client-side via Freighter.
// For the backend proof, the same ops are owner-signed with the .env owner key
// (passed through {@link buildAgentAuth} with `contextRuleIds: [0]` / the Default
// rule for add_context_rule, since the deploy is authorized by the owner's plain
// classic signature on the createCustomContract envelope).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * WASM hash of the OpenZeppelin SmartAccount (`multisig_account_example`)
 * proven on testnet (see scripts/spike-artifacts/PROVEN-IDS.txt). Used as the
 * default executable for {@link deploySmartWalletOp}. Override per environment
 * if a different account wasm is installed.
 */
export const SMART_ACCOUNT_WASM_HASH =
  "e2f4ed54b009c6b1c5bd848e4c73ff706c74d9436757859423f8959fa4aca28d";

/**
 * Encode the OZ SmartAccount `__constructor(signers: Vec<Signer>,
 * policies: Map<Address, Val>)` arguments for an initial OWNER (External
 * ed25519) signer with no Default-rule policies.
 */
function smartWalletConstructorArgs(opts: {
  verifier: string;
  ownerPublicKeyHex: string;
}): xdr.ScVal[] {
  const ownerSigner = externalSignerScVal({
    verifier: opts.verifier,
    publicKeyHex: opts.ownerPublicKeyHex,
  });
  const signers = xdr.ScVal.scvVec([ownerSigner]);
  const policies = xdr.ScVal.scvMap([]); // no policies on the Default (owner) rule
  return [signers, policies];
}

export interface DeploySmartWalletResult {
  /** The createCustomContract op (still needs the deployer's envelope signature). */
  op: xdr.Operation;
  /** Deterministic contract id the deploy will produce (deployer + salt). */
  contractId: string;
  /** The 32-byte salt used (hex), so the caller can reproduce the id. */
  saltHex: string;
}

/**
 * Build the `createCustomContract` op that deploys a NEW per-user smart wallet,
 * whose Default (owner) rule signer is the owner's External ed25519 key. The
 * deployer account (`deployer`) authorizes + pays via its envelope signature —
 * no smart-account auth is needed for the create itself.
 *
 * Mirrors how the proven SMART_ACCOUNT was created (OZ SmartAccount
 * `__constructor({signers:[External(owner)], policies:{}})`). After deploy, the
 * owner adds the agent's restricted rules via {@link addAgentRuleOps}.
 *
 * Returns the op plus the deterministic contract id (so the registry can store
 * it before the tx even lands).
 */
export function deploySmartWalletOp(opts: {
  /** Deployer account (G...) that signs the envelope + pays the fee. */
  deployer: string;
  /** Network passphrase — used to derive the deterministic contract id. */
  networkPassphrase: string;
  /** ed25519-verifier contract id the wallet's owner signer uses. */
  verifier: string;
  /** Owner ed25519 public key, 32-byte hex (becomes the Default-rule signer). */
  ownerPublicKeyHex: string;
  /** Account wasm hash (hex). Defaults to {@link SMART_ACCOUNT_WASM_HASH}. */
  wasmHash?: string;
  /** Optional explicit 32-byte salt (hex). Defaults to a random salt. */
  saltHex?: string;
}): DeploySmartWalletResult {
  const wasmHashHex = opts.wasmHash ?? SMART_ACCOUNT_WASM_HASH;
  const salt = opts.saltHex
    ? Buffer.from(opts.saltHex, "hex")
    : (() => {
        const b = Buffer.alloc(32);
        for (let i = 0; i < 32; i++) b[i] = Math.floor(Math.random() * 256);
        return b;
      })();

  const op = Operation.createCustomContract({
    address: Address.fromString(opts.deployer),
    wasmHash: Buffer.from(wasmHashHex, "hex"),
    salt,
    constructorArgs: smartWalletConstructorArgs({
      verifier: opts.verifier,
      ownerPublicKeyHex: opts.ownerPublicKeyHex,
    }),
  });

  // Deterministic contract id from (deployer, salt) — matches the host's
  // contractIdPreimageFromAddress hashing (same as deploy-lib.generateContractId).
  const contractId = contractIdFromAddress(opts.deployer, salt, opts.networkPassphrase);

  return { op, contractId, saltHex: salt.toString("hex") };
}

/**
 * Compute the deterministic contract id for a createCustomContract deploy from
 * (deployer account, salt) on the network identified by `networkPassphrase`.
 * Hashes exactly as the Soroban host (and deploy-lib.generateContractId) do.
 */
function contractIdFromAddress(deployer: string, salt: Buffer, networkPassphrase: string): string {
  const networkId = hash(Buffer.from(networkPassphrase));
  const pre = xdr.ContractIdPreimage.contractIdPreimageFromAddress(
    new xdr.ContractIdPreimageFromAddress({
      address: Address.fromString(deployer).toScAddress(),
      salt,
    }),
  );
  const hp = xdr.HashIdPreimage.envelopeTypeContractId(
    new xdr.HashIdPreimageContractId({ networkId, contractIdPreimage: pre }),
  );
  return Address.contract(hash(hp.toXDR())).toString();
}

/**
 * Build the TWO `add_context_rule` ops that authorize the backend AGENT (an
 * External ed25519 policy signer) on a user's smart wallet, exactly as the
 * ARMA model requires:
 *   1. CallContract(POOL)  — uncapped (Blend pool method calls)
 *   2. CallContract(USDC)  — capped by the spending-limit policy
 *
 * Both rules are owner-managed: pass each op through {@link buildAgentAuth}
 * with the OWNER keypair + `contextRuleIds: [0]` (the Default rule authorizes
 * rule management), or owner-sign client-side via Freighter.
 *
 * Returns the ops in a fixed order: `[poolRuleOp, usdcRuleOp]`. After both land,
 * read the resulting rule ids back with {@link readContextRulesCount} (the two
 * newest ids) — see verify-peruser.ts for the canonical capture.
 */
export function addAgentRuleOps(opts: {
  smartWallet: string;
  poolId: string;
  usdcSac: string;
  verifier: string;
  agentPublicKeyHex: string;
  spendingPolicy: string;
  /** USDC spending cap in stroops over the window (applies to the USDC rule). */
  capStroops: bigint;
  /** Rolling window length in ledgers (e.g. 17280 ≈ 1 day on testnet). */
  periodLedgers: number;
}): { poolRuleOp: xdr.Operation; usdcRuleOp: xdr.Operation } {
  // Pool rule: CallContract(POOL), no spending policy (method calls aren't a
  // token transfer, so the cap lives on the USDC rule). Empty policies map.
  const addr = (a: string) => nativeToScVal(Address.fromString(a), { type: "address" });
  const agentSignerScVal = xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol("External"),
    addr(opts.verifier),
    xdr.ScVal.scvBytes(Buffer.from(opts.agentPublicKeyHex, "hex")),
  ]);
  const ctxCallPool = xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol("CallContract"),
    addr(opts.poolId),
  ]);
  const poolRuleOp = new Contract(opts.smartWallet).call(
    "add_context_rule",
    ctxCallPool,
    nativeToScVal("agent-pool", { type: "string" }),
    xdr.ScVal.scvVoid(),
    xdr.ScVal.scvVec([agentSignerScVal]),
    xdr.ScVal.scvMap([]), // no policies — the cap is enforced on the USDC rule
  );

  // USDC rule: CallContract(USDC) + spending-limit policy capped at capStroops.
  const usdcRuleOp = registerAgentRuleOp({
    smartWallet: opts.smartWallet,
    targetContract: opts.usdcSac,
    verifier: opts.verifier,
    agentPublicKeyHex: opts.agentPublicKeyHex,
    spendingPolicy: opts.spendingPolicy,
    spendingLimitStroops: opts.capStroops,
    periodLedgers: opts.periodLedgers,
    name: "agent-usdc-capped",
  });

  return { poolRuleOp, usdcRuleOp };
}

/**
 * Read the smart wallet's current `get_context_rules_count` via a read-only
 * simulation (no signing, no submit). The newest rule has id `count - 1`; when
 * two rules were just added in order, their ids are `count - 2` and `count - 1`.
 *
 * `readerSource` is any funded G-address used only as the simulation tx source.
 */
export async function readContextRulesCount(opts: {
  server: SimulatingServer;
  smartWallet: string;
  networkPassphrase: string;
  readerSource: string;
}): Promise<number> {
  const src = await opts.server.getAccount(opts.readerSource);
  const tx = new TransactionBuilder(src, {
    fee: BASE_FEE,
    networkPassphrase: opts.networkPassphrase,
  })
    .addOperation(new Contract(opts.smartWallet).call("get_context_rules_count"))
    .setTimeout(30)
    .build();
  const sim = await opts.server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`readContextRulesCount: simulate failed: ${sim.error}`);
  }
  const retval = (sim as rpc.Api.SimulateTransactionSuccessResponse).result?.retval;
  if (!retval) throw new Error("readContextRulesCount: no retval");
  return Number(scValToNative(retval));
}

/**
 * Read the spending-limit policy's recorded state for a given rule on a smart
 * wallet via `get_spending_limit_data(context_rule_id: u32, smart_account:
 * address)`. Returns the decoded native value (a record with `spending_limit`,
 * `period_ledgers`, and the already-spent / window bookkeeping) or `null` if the
 * policy has not recorded anything yet for that rule.
 *
 * Used by verify-peruser.ts to confirm there is cap headroom before the agent
 * supply, exactly as spike-prove-cap.ts does.
 */
export async function readSpendingLimitData(opts: {
  server: SimulatingServer;
  spendingPolicy: string;
  smartWallet: string;
  ruleId: number;
  networkPassphrase: string;
  readerSource: string;
}): Promise<unknown | null> {
  const src = await opts.server.getAccount(opts.readerSource);
  const tx = new TransactionBuilder(src, {
    fee: BASE_FEE,
    networkPassphrase: opts.networkPassphrase,
  })
    .addOperation(
      new Contract(opts.spendingPolicy).call(
        "get_spending_limit_data",
        nativeToScVal(opts.ruleId, { type: "u32" }),
        nativeToScVal(Address.fromString(opts.smartWallet), { type: "address" }),
      ),
    )
    .setTimeout(30)
    .build();
  const sim = await opts.server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) return null;
  const retval = (sim as rpc.Api.SimulateTransactionSuccessResponse).result?.retval;
  if (!retval) return null;
  return scValToNative(retval);
}
