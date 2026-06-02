import { describe, it, expect } from "vitest";
import { serializePosition } from "./serialize";

describe("serializePosition", () => {
  it("renders the BigInt stroop amount as a decimal string", () => {
    expect(serializePosition({ poolId: "C_A", amountUsdc: 1000_0000000n })).toEqual({
      poolId: "C_A",
      amountUsdc: "10000000000",
    });
  });

  it("handles an idle (null pool) zero position", () => {
    expect(serializePosition({ poolId: null, amountUsdc: 0n })).toEqual({
      poolId: null,
      amountUsdc: "0",
    });
  });
});
