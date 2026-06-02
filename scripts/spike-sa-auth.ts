/**
 * SPIKE helper: build + sign the custom OZ-SmartAccount AuthPayload for the
 * smart account's own auth entry, using an External (ed25519-verifier) signer.
 *
 * Replicates packages/accounts do_check_auth / kit auth-payload.ts:
 *   signaturePayload = sha256( HashIdPreimage.sorobanAuthorization{ networkId,
 *                       nonce, signatureExpirationLedger, invocation } )
 *   authDigest       = sha256( signaturePayload || scvVec([u32 ruleIds]).toXDR() )
 *   signature        = ed25519.sign(authDigest)        (raw 64 bytes)
 *   entry.signature  = ScVal.Map{ context_rule_ids: [u32...], signers: { Signer::External(verifier,key) -> sigBytes } }
 *
 * Pure @stellar/stellar-sdk — fully headless. This is the core piece the real
 * executor will reuse for the agent key.
 */
import { Keypair, Address, xdr, hash, rpc } from "@stellar/stellar-sdk";

/** External signer descriptor for the AuthPayload signer-map key. */
export interface ExternalSignerKey {
  verifier: string; // C... ed25519-verifier contract id
  publicKeyHex: string; // 32-byte ed25519 public key, hex
}

/** Encode Signer::External(verifier, keyBytes) exactly as the contract expects. */
function externalSignerScVal(s: ExternalSignerKey): xdr.ScVal {
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol("External"),
    xdr.ScVal.scvAddress(Address.fromString(s.verifier).toScAddress()),
    xdr.ScVal.scvBytes(Buffer.from(s.publicKeyHex, "hex")),
  ]);
}

/** Build the AuthPayload ScVal: { context_rule_ids: Vec<u32>, signers: Map<Signer,Bytes> }. */
function writeAuthPayload(
  contextRuleIds: number[],
  signerSigs: Array<{ signer: ExternalSignerKey; sig: Buffer }>,
): xdr.ScVal {
  const signerEntries = signerSigs.map(
    ({ signer, sig }) =>
      new xdr.ScMapEntry({ key: externalSignerScVal(signer), val: xdr.ScVal.scvBytes(sig) }),
  );
  // Soroban requires ScMap keys sorted by their XDR bytes.
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

/** signaturePayload = sha256(HashIdPreimage.sorobanAuthorization(...)) */
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

/** authDigest = sha256(signaturePayload || scvVec([u32 ruleIds]).toXDR()) */
export function buildAuthDigest(signaturePayload: Buffer, contextRuleIds: number[]): Buffer {
  const ruleIdsXdr = xdr.ScVal
    .scvVec(contextRuleIds.map((id) => xdr.ScVal.scvU32(id)))
    .toXDR();
  return hash(Buffer.concat([signaturePayload, ruleIdsXdr]));
}

/**
 * Sign every smart-account auth entry in `entries` whose address == smartAccount,
 * using the given External signers (one signature per provided keypair). Mutates
 * the entries in place (sets credentials.address.signature + expiration).
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

export { writeAuthPayload, externalSignerScVal };
