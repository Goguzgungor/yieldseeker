import { rpc, TransactionBuilder, BASE_FEE, Account } from "@stellar/stellar-sdk";
import * as Blend from "@blend-capital/blend-sdk";
import type { Wallet } from "./wallet.js";
import type { TxResult } from "./types.js";

export interface SorobanClient {
  buildBlendSubmit(poolId: string, kind: "withdraw" | "deposit", amount: bigint): Promise<string>; // unsigned xdr
  simulate(xdr: string): Promise<{ ok: boolean; error?: string }>;
  submit(signedXdr: string): Promise<{ hash: string; success: boolean; error?: string }>;
}

export function createExecutor(client: SorobanClient, wallet: Wallet) {
  async function step(poolId: string, kind: "withdraw" | "deposit", amount: bigint): Promise<string> {
    const xdr = await client.buildBlendSubmit(poolId, kind, amount);
    const sim = await client.simulate(xdr);
    if (!sim.ok) throw new Error(`${kind} simulate failed: ${sim.error ?? "unknown"}`);
    const signed = wallet.signXdr(xdr);
    const res = await client.submit(signed);
    if (!res.success) throw new Error(`${kind} submit failed: ${res.error ?? "unknown"}`);
    return res.hash;
  }
  return {
    async rebalance(fromPool: string, toPool: string, amount: bigint): Promise<TxResult> {
      const hashes: string[] = [];
      try {
        hashes.push(await step(fromPool, "withdraw", amount));
        hashes.push(await step(toPool, "deposit", amount));
        return { hashes, success: true };
      } catch (e) {
        return { hashes, success: false, error: (e as Error).message };
      }
    },
  };
}
export type Executor = ReturnType<typeof createExecutor>;

// Spike-gated real client. CONFIRM RequestType enum + submit() shape against Task-5 spike later.
export function createSorobanClient(opts: {
  rpcUrl: string; networkPassphrase: string; walletAddress: string; usdcId: string;
}): SorobanClient {
  const server = new rpc.Server(opts.rpcUrl, { allowHttp: opts.rpcUrl.startsWith("http://") });
  const RequestType: any = (Blend as any).RequestType; // CONFIRM (SupplyCollateral / WithdrawCollateral)
  return {
    async buildBlendSubmit(poolId, kind, amount) {
      const pool: any = new (Blend as any).PoolContract(poolId);
      const op = pool.submit({
        from: opts.walletAddress, spender: opts.walletAddress, to: opts.walletAddress,
        requests: [{
          request_type: kind === "deposit" ? RequestType.SupplyCollateral : RequestType.WithdrawCollateral,
          address: opts.usdcId, amount,
        }],
      }); // CONFIRM return type (base64 op xdr vs Operation)
      const source = await server.getAccount(opts.walletAddress);
      const tx = new TransactionBuilder(new Account(source.accountId(), source.sequenceNumber()), {
        fee: BASE_FEE, networkPassphrase: opts.networkPassphrase,
      }).addOperation(typeof op === "string" ? (Blend as any).xdr.Operation.fromXDR(op, "base64") : op)
        .setTimeout(30).build();
      return tx.toXDR();
    },
    async simulate(xdr) {
      const tx = TransactionBuilder.fromXDR(xdr, opts.networkPassphrase);
      const sim = await server.simulateTransaction(tx as any);
      return (rpc.Api as any).isSimulationError(sim) ? { ok: false, error: (sim as any).error } : { ok: true };
    },
    async submit(signedXdr) {
      const tx = TransactionBuilder.fromXDR(signedXdr, opts.networkPassphrase);
      const sent = await server.sendTransaction(tx as any);
      if (sent.status === "ERROR") return { hash: sent.hash, success: false, error: JSON.stringify((sent as any).errorResult) };
      let g = await server.getTransaction(sent.hash);
      for (let i = 0; i < 10 && g.status === "NOT_FOUND"; i++) { await new Promise((r) => setTimeout(r, 1000)); g = await server.getTransaction(sent.hash); }
      return { hash: sent.hash, success: g.status === "SUCCESS", error: g.status === "SUCCESS" ? undefined : g.status };
    },
  };
}
