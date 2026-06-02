import { describe, it, expect } from "vitest";
import { createPoolDiscovery, type PoolSource } from "./discovery.js";

const FALLBACK = ["C_FALLBACK_A", "C_FALLBACK_B"];

const sourceReturning = (ids: string[]): PoolSource => ({ listPools: async () => ids });
const sourceThrowing = (): PoolSource => ({
  listPools: async () => {
    throw new Error("rpc down");
  },
});

describe("createPoolDiscovery", () => {
  it("returns the source pools (deduped) when the source yields ids", async () => {
    const d = createPoolDiscovery(sourceReturning(["C_X", "C_Y", "C_X"]), FALLBACK);
    expect(await d.discoverPoolIds()).toEqual(["C_X", "C_Y"]);
  });

  it("returns the fallback list when the source returns []", async () => {
    const d = createPoolDiscovery(sourceReturning([]), FALLBACK);
    expect(await d.discoverPoolIds()).toEqual(FALLBACK);
  });

  it("returns the fallback list when the source throws", async () => {
    const d = createPoolDiscovery(sourceThrowing(), FALLBACK);
    expect(await d.discoverPoolIds()).toEqual(FALLBACK);
  });
});
