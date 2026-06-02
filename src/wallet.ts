import { Keypair, TransactionBuilder, Transaction, FeeBumpTransaction } from "@stellar/stellar-sdk";

export interface Wallet {
  address(): string;
  /** Sign a base64 tx envelope XDR; return signed base64 XDR. */
  signXdr(xdr: string): string;
}

// MVP signer: agent holds a funded ed25519 key. Caps are enforced in executor/orchestrator.
export function createKeypairWallet(kp: Keypair, networkPassphrase: string): Wallet {
  return {
    address: () => kp.publicKey(),
    signXdr(xdr: string) {
      const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase) as Transaction | FeeBumpTransaction;
      tx.sign(kp);
      return tx.toXDR();
    },
  };
}

// DEFERRED (spike-gated): createPolicySignerWallet(...) — a Soroban smart-wallet contract account
// where the agent is a policy signer restricted to Blend pool contract ids + caps. Will satisfy
// the same Wallet interface. Implement after confirming the smart-account-kit / passkey-kit API.
