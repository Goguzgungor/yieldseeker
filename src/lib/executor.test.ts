import { describe, it, expect, vi } from "vitest";
import { createExecutor, type SorobanClient } from "./executor";

function fakeClient(): SorobanClient {
  return {
    buildBlendOp: vi.fn(async (poolId, kind, amount) => `OP:${kind}:${poolId}:${amount}`),
    buildBlendSubmit: vi.fn(async (poolId, kind, amount) => `XDR:${kind}:${poolId}:${amount}`),
    simulate: vi.fn(async () => ({ ok: true })),
    submit: vi.fn(async (xdr: string) => ({ hash: "h:" + xdr, success: true })),
  };
}

describe("executor.rebalance", () => {
  it("withdraws from source then deposits to target and returns both hashes", async () => {
    const client = fakeClient();
    const wallet = { address: () => "G", signXdr: (x: string) => "signed:" + x };
    const exec = createExecutor(client, wallet);
    const res = await exec.rebalance("C_A", "C_B", 1000_0000000n);
    expect(res.success).toBe(true);
    expect(res.hashes).toHaveLength(2);
    expect(client.buildBlendSubmit).toHaveBeenNthCalledWith(1, "C_A", "withdraw", 1000_0000000n);
    expect(client.buildBlendSubmit).toHaveBeenNthCalledWith(2, "C_B", "deposit", 1000_0000000n);
  });

  it("aborts before deposit if withdraw simulation fails", async () => {
    const client = fakeClient();
    (client.simulate as any).mockResolvedValueOnce({ ok: false, error: "withdraw sim failed" });
    const wallet = { address: () => "G", signXdr: (x: string) => x };
    const res = await createExecutor(client, wallet).rebalance("C_A", "C_B", 1000_0000000n);
    expect(res.success).toBe(false);
    expect(client.submit).not.toHaveBeenCalled();
  });
});

describe("executor.deposit", () => {
  it("deposit() does a single deposit and returns one hash", async () => {
    const client = fakeClient();
    const wallet = { address: () => "G", signXdr: (x: string) => "signed:" + x };
    const res = await createExecutor(client, wallet).deposit("C_A", 500_0000000n);
    expect(res.success).toBe(true);
    expect(res.hashes).toHaveLength(1);
    expect(client.buildBlendSubmit).toHaveBeenCalledWith("C_A", "deposit", 500_0000000n);
  });
});
