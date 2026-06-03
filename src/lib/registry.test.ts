import { describe, it, expect, beforeEach } from "vitest";
import {
  registerUser,
  listUsers,
  getUser,
  removeUser,
  setUserPosition,
  getUserPosition,
  clearRegistry,
  userCount,
  registryStoreId,
} from "./registry";

// With no MONGODB_URI in the test env, the registry uses its in-memory impl
// (globalThis-backed). Clear it before each test for isolation.
beforeEach(async () => {
  await clearRegistry();
});

describe("registry (in-memory async impl)", () => {
  it("registers, lists (oldest first), and looks up users by owner", async () => {
    expect(await listUsers()).toEqual([]);
    expect(await getUser("G_NONE")).toBeNull();

    await registerUser({ owner: "G_A", smartWallet: "C_SA_A", poolRuleId: 1, usdcRuleId: 2, createdAt: 100 });
    await registerUser({ owner: "G_B", smartWallet: "C_SA_B", poolRuleId: 3, usdcRuleId: 4, createdAt: 200 });

    const all = await listUsers();
    expect(all.map((u) => u.owner)).toEqual(["G_A", "G_B"]); // createdAt ASC
    expect(await getUser("G_B")).toEqual({
      owner: "G_B", smartWallet: "C_SA_B", poolRuleId: 3, usdcRuleId: 4, createdAt: 200,
    });
  });

  it("orders deterministically by createdAt then owner regardless of insert order", async () => {
    await registerUser({ owner: "G_C", smartWallet: "C_C", poolRuleId: 1, usdcRuleId: 2, createdAt: 300 });
    await registerUser({ owner: "G_A", smartWallet: "C_A", poolRuleId: 1, usdcRuleId: 2, createdAt: 100 });
    await registerUser({ owner: "G_B", smartWallet: "C_B", poolRuleId: 1, usdcRuleId: 2, createdAt: 100 });
    // createdAt asc, then owner asc to break ties (G_A before G_B at t=100, then G_C).
    expect((await listUsers()).map((u) => u.owner)).toEqual(["G_A", "G_B", "G_C"]);
  });

  it("upserts on owner conflict (re-register updates wallet + rule ids)", async () => {
    await registerUser({ owner: "G_A", smartWallet: "C_OLD", poolRuleId: 1, usdcRuleId: 2, createdAt: 100 });
    await registerUser({ owner: "G_A", smartWallet: "C_NEW", poolRuleId: 5, usdcRuleId: 6, createdAt: 100 });
    expect(await listUsers()).toHaveLength(1);
    expect(await getUser("G_A")).toMatchObject({ smartWallet: "C_NEW", poolRuleId: 5, usdcRuleId: 6 });
  });

  it("does not alias the stored object (mutating the input later is ignored)", async () => {
    const input = { owner: "G_A", smartWallet: "C_A", poolRuleId: 1, usdcRuleId: 2, createdAt: 100 };
    await registerUser(input);
    input.smartWallet = "C_MUTATED";
    expect((await getUser("G_A"))!.smartWallet).toBe("C_A");
  });

  it("stores + reads per-user positions keyed by smart wallet", async () => {
    expect(await getUserPosition("C_SA_A")).toEqual({ poolId: null, amountUsdc: 0n });
    await setUserPosition("C_SA_A", { poolId: "C_POOL", amountUsdc: 500_0000000n });
    await setUserPosition("C_SA_B", { poolId: "C_POOL", amountUsdc: 12_0000000n });
    expect(await getUserPosition("C_SA_A")).toEqual({ poolId: "C_POOL", amountUsdc: 500_0000000n });
    expect((await getUserPosition("C_SA_B")).amountUsdc).toBe(12_0000000n);
    await setUserPosition("C_SA_A", { poolId: "C_POOL", amountUsdc: 900_0000000n });
    expect((await getUserPosition("C_SA_A")).amountUsdc).toBe(900_0000000n);
  });

  it("removeUser forgets the user AND their position; idempotent", async () => {
    await registerUser({ owner: "G_A", smartWallet: "C_SA_A", poolRuleId: 1, usdcRuleId: 2, createdAt: 100 });
    await setUserPosition("C_SA_A", { poolId: "C_POOL", amountUsdc: 7_0000000n });
    expect(await removeUser("G_A")).toBe(true);
    expect(await getUser("G_A")).toBeNull();
    // Position keyed by the (now-removed) smart wallet is also gone → idle.
    expect(await getUserPosition("C_SA_A")).toEqual({ poolId: null, amountUsdc: 0n });
    // Removing again is a no-op.
    expect(await removeUser("G_A")).toBe(false);
  });

  it("clearRegistry wipes everything and returns the removed count (demo reset)", async () => {
    await registerUser({ owner: "G_A", smartWallet: "C_A", poolRuleId: 1, usdcRuleId: 2, createdAt: 1 });
    await registerUser({ owner: "G_B", smartWallet: "C_B", poolRuleId: 1, usdcRuleId: 2, createdAt: 2 });
    await setUserPosition("C_A", { poolId: "C_POOL", amountUsdc: 1n });
    expect(await userCount()).toBe(2);
    expect(await clearRegistry()).toBe(2);
    expect(await userCount()).toBe(0);
    expect(await listUsers()).toEqual([]);
    expect(await getUserPosition("C_A")).toEqual({ poolId: null, amountUsdc: 0n });
  });

  it("registryStoreId is stable within the process (same object across calls)", async () => {
    const id1 = registryStoreId();
    await registerUser({ owner: "G_A", smartWallet: "C_A", poolRuleId: 1, usdcRuleId: 2, createdAt: 1 });
    const id2 = registryStoreId();
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^\d+:[0-9a-z]+$/);
  });
});
