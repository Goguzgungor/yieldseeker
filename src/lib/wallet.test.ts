import { describe, it, expect } from "vitest";
import { createKeypairWallet, createPolicySignerWallet } from "./wallet";
import { Keypair, TransactionBuilder, Account, Operation, BASE_FEE, Networks, StrKey } from "@stellar/stellar-sdk";

const SMART_WALLET = StrKey.encodeContract(Buffer.alloc(32, 7)); // deterministic C...
const VERIFIER = StrKey.encodeContract(Buffer.alloc(32, 9));

describe("wallet (keypair signer)", () => {
  it("exposes the public address", () => {
    const kp = Keypair.random();
    expect(createKeypairWallet(kp, Networks.TESTNET).address()).toBe(kp.publicKey());
  });

  it("signs a real tx envelope and adds a signature", () => {
    const kp = Keypair.random();
    const w = createKeypairWallet(kp, Networks.TESTNET);
    const tx = new TransactionBuilder(new Account(kp.publicKey(), "0"), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.bumpSequence({ bumpTo: "1" }))
      .setTimeout(30).build();
    const signedXdr = w.signXdr(tx.toXDR());
    expect(typeof signedXdr).toBe("string");
    const reparsed = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET);
    expect(reparsed.signatures.length).toBe(1);
  });

  it("keypair wallet does NOT expose submitOp (legacy path stays single-pass)", () => {
    const w = createKeypairWallet(Keypair.random(), Networks.TESTNET);
    expect(w.submitOp).toBeUndefined();
  });
});

describe("wallet (smart-account policy signer)", () => {
  function makeWallet(server?: unknown) {
    return createPolicySignerWallet({
      smartWalletId: SMART_WALLET,
      agentKeypair: Keypair.random(),
      rpcUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: Networks.TESTNET,
      verifier: VERIFIER,
      contextRuleIds: [1, 2],
      server: server as never,
    });
  }

  it("address() is the SMART WALLET (funds move from the SA, not the agent)", () => {
    expect(makeWallet().address()).toBe(SMART_WALLET);
  });

  it("exposes submitOp (the two-pass smart-account fast-path)", () => {
    expect(typeof makeWallet().submitOp).toBe("function");
  });

  it("signXdr envelope-signs with the agent key", () => {
    const agent = Keypair.random();
    const w = createPolicySignerWallet({
      smartWalletId: SMART_WALLET, agentKeypair: agent,
      rpcUrl: "https://x", networkPassphrase: Networks.TESTNET,
      verifier: VERIFIER, contextRuleIds: [1],
    });
    const tx = new TransactionBuilder(new Account(agent.publicKey(), "0"), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.bumpSequence({ bumpTo: "1" })).setTimeout(30).build();
    const reparsed = TransactionBuilder.fromXDR(w.signXdr(tx.toXDR()), Networks.TESTNET);
    expect(reparsed.signatures.length).toBe(1);
  });

  it("submitOp returns a failure TxResult (never throws) on a bad op XDR", async () => {
    // Pass garbage so xdr.Operation.fromXDR throws inside submitOp; the wallet
    // must surface { success:false } rather than reject. No network is touched.
    const res = await makeWallet().submitOp!("not-base64-xdr");
    expect(res.success).toBe(false);
    expect(res.hashes).toEqual([]);
    expect(typeof res.error).toBe("string");
  });
});
