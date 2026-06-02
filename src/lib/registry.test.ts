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

// The store lives on `globalThis`, so clear it before each test for isolation.
beforeEach(() => clearRegistry());

describe("registry (in-memory globalThis store)", () => {
  it("registers, lists (oldest first), and looks up users by owner", () => {
    expect(listUsers()).toEqual([]);
    expect(getUser("G_NONE")).toBeNull();

    registerUser({ owner: "G_A", smartWallet: "C_SA_A", poolRuleId: 1, usdcRuleId: 2, createdAt: 100 });
    registerUser({ owner: "G_B", smartWallet: "C_SA_B", poolRuleId: 3, usdcRuleId: 4, createdAt: 200 });

    const all = listUsers();
    expect(all.map((u) => u.owner)).toEqual(["G_A", "G_B"]); // createdAt ASC
    expect(getUser("G_B")).toEqual({
      owner: "G_B", smartWallet: "C_SA_B", poolRuleId: 3, usdcRuleId: 4, createdAt: 200,
    });
  });

  it("orders deterministically by createdAt then owner regardless of insert order", () => {
    registerUser({ owner: "G_C", smartWallet: "C_C", poolRuleId: 1, usdcRuleId: 2, createdAt: 300 });
    registerUser({ owner: "G_A", smartWallet: "C_A", poolRuleId: 1, usdcRuleId: 2, createdAt: 100 });
    registerUser({ owner: "G_B", smartWallet: "C_B", poolRuleId: 1, usdcRuleId: 2, createdAt: 100 });
    // createdAt asc, then owner asc to break ties (G_A before G_B at t=100, then G_C).
    expect(listUsers().map((u) => u.owner)).toEqual(["G_A", "G_B", "G_C"]);
  });

  it("upserts on owner conflict (re-register updates wallet + rule ids)", () => {
    registerUser({ owner: "G_A", smartWallet: "C_OLD", poolRuleId: 1, usdcRuleId: 2, createdAt: 100 });
    registerUser({ owner: "G_A", smartWallet: "C_NEW", poolRuleId: 5, usdcRuleId: 6, createdAt: 100 });
    expect(listUsers()).toHaveLength(1);
    expect(getUser("G_A")).toMatchObject({ smartWallet: "C_NEW", poolRuleId: 5, usdcRuleId: 6 });
  });

  it("does not alias the stored object (mutating the input later is ignored)", () => {
    const input = { owner: "G_A", smartWallet: "C_A", poolRuleId: 1, usdcRuleId: 2, createdAt: 100 };
    registerUser(input);
    input.smartWallet = "C_MUTATED";
    expect(getUser("G_A")!.smartWallet).toBe("C_A");
  });

  it("stores + reads per-user positions keyed by smart wallet", () => {
    expect(getUserPosition("C_SA_A")).toEqual({ poolId: null, amountUsdc: 0n });
    setUserPosition("C_SA_A", { poolId: "C_POOL", amountUsdc: 500_0000000n });
    setUserPosition("C_SA_B", { poolId: "C_POOL", amountUsdc: 12_0000000n });
    expect(getUserPosition("C_SA_A")).toEqual({ poolId: "C_POOL", amountUsdc: 500_0000000n });
    expect(getUserPosition("C_SA_B").amountUsdc).toBe(12_0000000n);
    setUserPosition("C_SA_A", { poolId: "C_POOL", amountUsdc: 900_0000000n });
    expect(getUserPosition("C_SA_A").amountUsdc).toBe(900_0000000n);
  });

  it("removeUser forgets the user AND their position; idempotent", () => {
    registerUser({ owner: "G_A", smartWallet: "C_SA_A", poolRuleId: 1, usdcRuleId: 2, createdAt: 100 });
    setUserPosition("C_SA_A", { poolId: "C_POOL", amountUsdc: 7_0000000n });
    expect(removeUser("G_A")).toBe(true);
    expect(getUser("G_A")).toBeNull();
    // Position keyed by the (now-removed) smart wallet is also gone → idle.
    expect(getUserPosition("C_SA_A")).toEqual({ poolId: null, amountUsdc: 0n });
    // Removing again is a no-op.
    expect(removeUser("G_A")).toBe(false);
  });

  it("clearRegistry wipes everything and returns the removed count (demo reset)", () => {
    registerUser({ owner: "G_A", smartWallet: "C_A", poolRuleId: 1, usdcRuleId: 2, createdAt: 1 });
    registerUser({ owner: "G_B", smartWallet: "C_B", poolRuleId: 1, usdcRuleId: 2, createdAt: 2 });
    setUserPosition("C_A", { poolId: "C_POOL", amountUsdc: 1n });
    expect(userCount()).toBe(2);
    expect(clearRegistry()).toBe(2);
    expect(userCount()).toBe(0);
    expect(listUsers()).toEqual([]);
    expect(getUserPosition("C_A")).toEqual({ poolId: null, amountUsdc: 0n });
  });

  it("registryStoreId is stable within the process (same object across calls)", () => {
    // Both calls hit the SAME globalThis store, so the id is stable. (Clearing
    // the maps does NOT recreate the store object, so the id persists.)
    const id1 = registryStoreId();
    registerUser({ owner: "G_A", smartWallet: "C_A", poolRuleId: 1, usdcRuleId: 2, createdAt: 1 });
    const id2 = registryStoreId();
    expect(id1).toBe(id2);
    expect(id1).toMatch(/^\d+:[0-9a-z]+$/);
  });
});
