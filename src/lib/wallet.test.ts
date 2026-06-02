import { describe, it, expect } from "vitest";
import { createKeypairWallet } from "./wallet";
import { Keypair, TransactionBuilder, Account, Operation, BASE_FEE, Networks } from "@stellar/stellar-sdk";

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
});
