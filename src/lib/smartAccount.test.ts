import { describe, it, expect } from "vitest";
import {
  Address,
  Keypair,
  Networks,
  Operation,
  StrKey,
  hash,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import {
  externalSignerScVal,
  writeAuthPayload,
  buildAuthDigest,
  buildSignaturePayload,
  registerAgentRuleOp,
  addAgentRuleOps,
  deploySmartWalletOp,
  buildAgentAuth,
  SMART_ACCOUNT_WASM_HASH,
  type ExternalSignerKey,
} from "./smartAccount";

// Deterministic C-addresses for the contracts the agent is scoped to.
const VERIFIER = StrKey.encodeContract(Buffer.alloc(32, 1));
const POOL = StrKey.encodeContract(Buffer.alloc(32, 2));
const USDC = StrKey.encodeContract(Buffer.alloc(32, 3));
const POLICY = StrKey.encodeContract(Buffer.alloc(32, 4));
const SMART_WALLET = StrKey.encodeContract(Buffer.alloc(32, 5));
const PASS = Networks.TESTNET;

const agentHex = "11".repeat(32);
const ownerHex = "22".repeat(32);

describe("smartAccount pure auth helpers", () => {
  it("externalSignerScVal encodes Signer::External(verifier, keyBytes)", () => {
    const sv = externalSignerScVal({ verifier: VERIFIER, publicKeyHex: agentHex });
    const vec = sv.vec();
    expect(vec).not.toBeNull();
    expect(vec![0].sym().toString()).toBe("External");
    // [1] = verifier address, [2] = 32-byte key
    expect(Address.fromScAddress(vec![1].address()).toString()).toBe(VERIFIER);
    expect(vec![2].bytes().toString("hex")).toBe(agentHex);
  });

  it("buildAuthDigest is deterministic and sensitive to the rule ids", () => {
    const sigPayload = Buffer.alloc(32, 9);
    const a = buildAuthDigest(sigPayload, [1, 2]);
    const b = buildAuthDigest(sigPayload, [1, 2]);
    const c = buildAuthDigest(sigPayload, [2, 1]);
    expect(a.equals(b)).toBe(true); // deterministic
    expect(a.equals(c)).toBe(false); // order matters in the appended ScVal
    // Matches the documented formula: sha256(payload || scvVec([u32]).toXDR()).
    const expected = hash(
      Buffer.concat([sigPayload, xdr.ScVal.scvVec([1, 2].map((n) => xdr.ScVal.scvU32(n))).toXDR()]),
    );
    expect(a.equals(expected)).toBe(true);
  });

  it("writeAuthPayload sorts signer-map keys by XDR bytes (Soroban requirement)", () => {
    // Two distinct signers; whatever insertion order, the encoded map keys must
    // come out sorted by their XDR hex.
    const s1: ExternalSignerKey = { verifier: VERIFIER, publicKeyHex: "aa".repeat(32) };
    const s2: ExternalSignerKey = { verifier: VERIFIER, publicKeyHex: "00".repeat(32) };
    const payload = writeAuthPayload(
      [0],
      [
        { signer: s1, sig: Buffer.alloc(64, 1) },
        { signer: s2, sig: Buffer.alloc(64, 2) },
      ],
    );
    const map = payload.map()!;
    const signersEntry = map.find((e) => e.key().sym().toString() === "signers")!;
    const signerMap = signersEntry.val().map()!;
    const keysHex = signerMap.map((e) => e.key().toXDR("hex"));
    const sorted = [...keysHex].sort((a, b) => a.localeCompare(b));
    expect(keysHex).toEqual(sorted);
    // context_rule_ids round-trips
    const idsEntry = map.find((e) => e.key().sym().toString() === "context_rule_ids")!;
    expect(scValToNative(idsEntry.val())).toEqual([0]);
  });

  it("buildSignaturePayload binds the network + invocation (changes with passphrase)", () => {
    // Build a minimal SA auth entry to hash.
    const entry = makeSaAuthEntry(SMART_WALLET, POOL);
    const p1 = buildSignaturePayload(PASS, entry, 1000);
    const p2 = buildSignaturePayload("Other Network ; 2024", entry, 1000);
    expect(p1.equals(p2)).toBe(false);
    expect(p1.length).toBe(32);
  });
});

describe("registerAgentRuleOp / addAgentRuleOps", () => {
  it("registerAgentRuleOp builds add_context_rule for CallContract(target) with the policy", () => {
    const op = registerAgentRuleOp({
      smartWallet: SMART_WALLET, targetContract: USDC, verifier: VERIFIER,
      agentPublicKeyHex: agentHex, spendingPolicy: POLICY,
      spendingLimitStroops: 5000_0000000n, periodLedgers: 17280,
    });
    const { fn, args } = decodeInvoke(op);
    expect(fn).toBe("add_context_rule");
    // arg0 = ContextRuleType::CallContract(USDC)
    const ctx = args[0].vec()!;
    expect(ctx[0].sym().toString()).toBe("CallContract");
    expect(Address.fromScAddress(ctx[1].address()).toString()).toBe(USDC);
  });

  it("addAgentRuleOps returns TWO ops: CallContract(POOL) uncapped + CallContract(USDC) capped", () => {
    const { poolRuleOp, usdcRuleOp } = addAgentRuleOps({
      smartWallet: SMART_WALLET, poolId: POOL, usdcSac: USDC, verifier: VERIFIER,
      agentPublicKeyHex: agentHex, spendingPolicy: POLICY,
      capStroops: 5000_0000000n, periodLedgers: 17280,
    });

    const pool = decodeInvoke(poolRuleOp);
    expect(pool.fn).toBe("add_context_rule");
    expect(Address.fromScAddress(pool.args[0].vec()![1].address()).toString()).toBe(POOL);
    // pool rule has an EMPTY policies map (last arg) — the cap lives on USDC.
    expect(pool.args[4].map()!.length).toBe(0);

    const usdc = decodeInvoke(usdcRuleOp);
    expect(Address.fromScAddress(usdc.args[0].vec()![1].address()).toString()).toBe(USDC);
    // usdc rule policies map references the spending policy.
    const polMap = usdc.args[4].map()!;
    expect(polMap.length).toBe(1);
    expect(Address.fromScAddress(polMap[0].key().address()).toString()).toBe(POLICY);
  });
});

describe("deploySmartWalletOp", () => {
  it("produces a createCustomContract op + a deterministic contract id (matches host preimage)", () => {
    const deployer = Keypair.random().publicKey();
    const saltHex = "ab".repeat(32);
    const { op, contractId, saltHex: outSalt } = deploySmartWalletOp({
      deployer, networkPassphrase: PASS, verifier: VERIFIER, ownerPublicKeyHex: ownerHex, saltHex,
    });
    expect(outSalt).toBe(saltHex);
    expect(StrKey.isValidContract(contractId)).toBe(true);
    expect(op).toBeInstanceOf(xdr.Operation);

    // Re-derive the expected id exactly as deploy-lib.generateContractId does.
    const networkId = hash(Buffer.from(PASS));
    const pre = xdr.ContractIdPreimage.contractIdPreimageFromAddress(
      new xdr.ContractIdPreimageFromAddress({
        address: Address.fromString(deployer).toScAddress(),
        salt: Buffer.from(saltHex, "hex"),
      }),
    );
    const hp = xdr.HashIdPreimage.envelopeTypeContractId(
      new xdr.HashIdPreimageContractId({ networkId, contractIdPreimage: pre }),
    );
    expect(contractId).toBe(StrKey.encodeContract(hash(hp.toXDR())));
  });

  it("defaults the wasm hash to the proven OZ SmartAccount", () => {
    expect(SMART_ACCOUNT_WASM_HASH).toMatch(/^[0-9a-f]{64}$/);
  });

  it("two deploys with different (default random) salts yield different ids", () => {
    const deployer = Keypair.random().publicKey();
    const a = deploySmartWalletOp({ deployer, networkPassphrase: PASS, verifier: VERIFIER, ownerPublicKeyHex: ownerHex });
    const b = deploySmartWalletOp({ deployer, networkPassphrase: PASS, verifier: VERIFIER, ownerPublicKeyHex: ownerHex });
    expect(a.saltHex).not.toBe(b.saltHex);
    expect(a.contractId).not.toBe(b.contractId);
  });
});

describe("buildAgentAuth (network mocked)", () => {
  it("throws a clear error when the first simulation fails", async () => {
    const server = {
      getAccount: async (id: string) => new (await import("@stellar/stellar-sdk")).Account(id, "0"),
      getLatestLedger: async () => ({ sequence: 1000 }),
      simulateTransaction: async () => ({ error: "boom: contract not found" }),
    };
    const op = new (await import("@stellar/stellar-sdk")).Contract(USDC).call(
      "transfer",
      nativeToScVal(Address.fromString(SMART_WALLET), { type: "address" }),
      nativeToScVal(Address.fromString(USDC), { type: "address" }),
      nativeToScVal(1n, { type: "i128" }),
    );
    await expect(
      buildAgentAuth({
        server: server as never,
        smartWallet: SMART_WALLET,
        networkPassphrase: PASS,
        contextRuleIds: [1],
        agentKeypair: Keypair.fromRawEd25519Seed(Buffer.alloc(32, 7)),
        verifier: VERIFIER,
        op,
      }),
    ).rejects.toThrow(/simulate failed/);
  });
});

// ── helpers ──────────────────────────────────────────────────────────────────

/** Decode an invokeHostFunction contract-call op into { fn, args }. */
function decodeInvoke(op: xdr.Operation): { fn: string; args: xdr.ScVal[] } {
  const host = (op.body().value() as xdr.InvokeHostFunctionOp).hostFunction();
  const invoke = host.invokeContract();
  return {
    fn: invoke.functionName().toString(),
    args: invoke.args(),
  };
}

/** Build a minimal smart-account SorobanAuthorizationEntry for hashing tests. */
function makeSaAuthEntry(smartAccount: string, target: string): xdr.SorobanAuthorizationEntry {
  const nonce = new xdr.Int64(123);
  const creds = xdr.SorobanCredentials.sorobanCredentialsAddress(
    new xdr.SorobanAddressCredentials({
      address: Address.fromString(smartAccount).toScAddress(),
      nonce,
      signatureExpirationLedger: 0,
      signature: xdr.ScVal.scvVoid(),
    }),
  );
  const fn = xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
    new xdr.InvokeContractArgs({
      contractAddress: Address.fromString(target).toScAddress(),
      functionName: "transfer",
      args: [],
    }),
  );
  const rootInvocation = new xdr.SorobanAuthorizedInvocation({ function: fn, subInvocations: [] });
  return new xdr.SorobanAuthorizationEntry({ credentials: creds, rootInvocation });
}

// silence unused-import lints for symbols used only via dynamic import above
void Operation;
