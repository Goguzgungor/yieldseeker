import { describe, it, expect } from "vitest";
import { parseConfig } from "./config.js";

const env = {
  ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL: "claude-sonnet-4-6",
  STELLAR_RPC_URL: "https://soroban-testnet.stellar.org",
  STELLAR_NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
  USDC_CONTRACT_ID: "C_USDC", BLEND_POOL_IDS: "C_A,C_B",
  AGENT_SIGNER_SECRET: "S_SECRET", SMART_WALLET_ADDRESS: "C_WALLET",
  PER_TX_CAP_USDC: "2000", DAILY_CAP_USDC: "5000",
  MIN_YIELD_DELTA_BPS: "50", REBALANCE_COOLDOWN_SEC: "120", SCAN_INTERVAL_SEC: "30",
};

describe("parseConfig", () => {
  it("parses pool ids into an array and caps into stroop bigints", () => {
    const c = parseConfig(env);
    expect(c.blendPoolIds).toEqual(["C_A", "C_B"]);
    expect(c.perTxCapStroops).toBe(2000_0000000n);
    expect(c.minYieldDeltaBps).toBe(50);
  });

  it("throws when required keys are missing", () => {
    expect(() => parseConfig({})).toThrow();
  });
});
