import { rpc, TransactionBuilder, BASE_FEE, Account, xdr as StellarXdr } from "@stellar/stellar-sdk";
import { PoolContractV2, RequestType } from "@blend-capital/blend-sdk";
import type { SubmitArgs, Request } from "@blend-capital/blend-sdk";
import type { Wallet } from "./wallet";
import type { TxResult } from "./types";

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
    async deposit(toPool: string, amount: bigint): Promise<TxResult> {
      try {
        const hash = await step(toPool, "deposit", amount);
        return { hashes: [hash], success: true };
      } catch (e) {
        return { hashes: [], success: false, error: (e as Error).message };
      }
    },
  };
}
export type Executor = ReturnType<typeof createExecutor>;

/**
 * Real Soroban client — confirmed against Blend SDK 3.2.2 types and Stellar SDK 15 (Task 5 spike).
 *
 * Confirmed SDK API:
 *   - RequestType enum (pool/index.d.ts):
 *       Supply=0, Withdraw=1, SupplyCollateral=2, WithdrawCollateral=3, Borrow=4, Repay=5, ...
 *     We use Supply(0)/Withdraw(1) for non-collateral lending positions.
 *
 *   - PoolContractV2 (pool_contract.d.ts):
 *       new PoolContractV2(address: string)
 *       .submit(args: SubmitArgs): string  — returns base64-encoded operation XDR string
 *       SubmitArgs = { from, spender, to: Address|string; requests: Array<Request> }
 *       Request = { request_type: RequestType; address: string; amount: i128 }
 *
 *   - Stellar SDK 15 rpc.Server:
 *       server.getAccount(address): Promise<Account> (returns object with .accountId(), .sequenceNumber())
 *       server.simulateTransaction(tx): Promise<SimulateTransactionResponse>
 *       server.sendTransaction(tx): Promise<SendTransactionResponse> — .status, .hash
 *       server.getTransaction(hash): Promise<GetTransactionResponse> — .status ("SUCCESS"|"FAILED"|"NOT_FOUND")
 *       rpc.Api.isSimulationError(sim): boolean
 *
 *   - PoolContractV2.submit() returns a base64 op XDR string.
 *     We decode it with StellarXdr.Operation.fromXDR(op, "base64") to get a Stellar SDK Operation.
 */
export function createSorobanClient(opts: {
  rpcUrl: string; networkPassphrase: string; walletAddress: string; usdcId: string;
}): SorobanClient {
  const server = new rpc.Server(opts.rpcUrl, { allowHttp: opts.rpcUrl.startsWith("http://") });

  return {
    async buildBlendSubmit(poolId, kind, amount) {
      const poolContract = new PoolContractV2(poolId);

      const request: Request = {
        // Supply(0) for deposit, Withdraw(1) for non-collateral withdrawal
        request_type: kind === "deposit" ? RequestType.Supply : RequestType.Withdraw,
        address: opts.usdcId,
        amount,
      };

      const submitArgs: SubmitArgs = {
        from: opts.walletAddress,
        spender: opts.walletAddress,
        to: opts.walletAddress,
        requests: [request],
      };

      // submit() returns a base64-encoded operation XDR string (confirmed from pool_contract.d.ts)
      const opBase64: string = poolContract.submit(submitArgs);

      const source = await server.getAccount(opts.walletAddress);
      const tx = new TransactionBuilder(
        new Account(source.accountId(), source.sequenceNumber()),
        { fee: BASE_FEE, networkPassphrase: opts.networkPassphrase },
      )
        .addOperation(StellarXdr.Operation.fromXDR(opBase64, "base64"))
        .setTimeout(30)
        .build();

      return tx.toXDR();
    },

    async simulate(txXdr) {
      const tx = TransactionBuilder.fromXDR(txXdr, opts.networkPassphrase);
      const sim = await server.simulateTransaction(tx as any);
      if (rpc.Api.isSimulationError(sim)) {
        return { ok: false, error: (sim as rpc.Api.SimulateTransactionErrorResponse).error };
      }
      return { ok: true };
    },

    async submit(signedXdr) {
      const tx = TransactionBuilder.fromXDR(signedXdr, opts.networkPassphrase);
      const sent = await server.sendTransaction(tx as any);
      if (sent.status === "ERROR") {
        return {
          hash: sent.hash,
          success: false,
          error: JSON.stringify((sent as rpc.Api.SendTransactionResponse & { errorResult?: unknown }).errorResult),
        };
      }
      let g = await server.getTransaction(sent.hash);
      for (let i = 0; i < 10 && g.status === "NOT_FOUND"; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        g = await server.getTransaction(sent.hash);
      }
      return {
        hash: sent.hash,
        success: g.status === "SUCCESS",
        error: g.status === "SUCCESS" ? undefined : g.status,
      };
    },
  };
}
