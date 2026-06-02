import { describe, it, expect } from "vitest";
import { createApi } from "./api.js";

const db = {
  getPosition: () => ({ poolId: "C_A", amountUsdc: 1000_0000000n }),
  recentLog: () => [{ ts: 1, kind: "scan", message: "scanned 2 pools", meta: null }],
};
const state = { lastScan: [{ poolId: "C_A", name: "A", apyBps: 820 }] };

describe("api", () => {
  it("GET /position returns position with string amount", async () => {
    const app = createApi(db as any, state as any);
    const res = await app.inject({ method: "GET", url: "/position" });
    expect(res.json()).toEqual({ poolId: "C_A", amountUsdc: "10000000000" });
  });
  it("GET /activity returns recent log", async () => {
    const app = createApi(db as any, state as any);
    const res = await app.inject({ method: "GET", url: "/activity" });
    expect(res.json()[0].message).toBe("scanned 2 pools");
  });
});
