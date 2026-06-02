import { describe, it, expect } from "vitest";
import { parseConfig } from "./config";

const env = {
  ANTHROPIC_API_KEY: "k", ANTHROPIC_MODEL: "claude-sonnet-4-6",
  RISK_TOLERANCE: "balanced",
  // Scan side (mainnet)
  SCAN_RPC_URL: "https://mainnet.sorobanrpc.com",
  SCAN_NETWORK_PASSPHRASE: "Public Global Stellar Network ; September 2015",
  SCAN_BLEND_POOL_IDS: "C_A,C_B",
  SCAN_USDC_CONTRACT_ID: "C_USDC_MAINNET",
  // Exec side (testnet)
  EXEC_RPC_URL: "https://soroban-testnet.stellar.org",
  EXEC_NETWORK_PASSPHRASE: "Test SDF Network ; September 2015",
  EXEC_POOL_ID: "C_EXEC_POOL",
  EXEC_USDC_CONTRACT_ID: "C_USDC_TESTNET",
  AGENT_SIGNER_SECRET: "S_SECRET", SMART_WALLET_ADDRESS: "C_WALLET",
  PER_TX_CAP_USDC: "2000", DAILY_CAP_USDC: "5000",
  MIN_YIELD_DELTA_BPS: "50", REBALANCE_COOLDOWN_SEC: "120", SCAN_INTERVAL_SEC: "30",
};

describe("parseConfig", () => {
  it("parses scan pool ids into an array and caps into stroop bigints", () => {
    const c = parseConfig(env);
    expect(c.scanBlendPoolIds).toEqual(["C_A", "C_B"]);
    expect(c.perTxCapStroops).toBe(2000_0000000n);
    expect(c.minYieldDeltaBps).toBe(50);
  });

  it("defaults the on-chain discovery contract ids (mainnet) when env omits them", () => {
    const c = parseConfig(env);
    expect(c.scanPoolFactoryId).toBe("CDSYOAVXFY7SM5S64IZPPPYB4GVGGLMQVFREPSQQEZVIWXX5R23G4QSU");
    expect(c.scanBackstopId).toBe("CAQQR5SWBXKIGZKPBZDH3KM5GQ5GUTPKB7JAFCINLZBC5WXPJKRG3IM7");
  });

  it("separates scan (mainnet) and exec (testnet) config", () => {
    const c = parseConfig(env);
    expect(c.scanRpcUrl).toBe("https://mainnet.sorobanrpc.com");
    expect(c.scanUsdcContractId).toBe("C_USDC_MAINNET");
    expect(c.execRpcUrl).toBe("https://soroban-testnet.stellar.org");
    expect(c.execPoolId).toBe("C_EXEC_POOL");
    expect(c.execUsdcContractId).toBe("C_USDC_TESTNET");
  });

  it("throws when required keys are missing", () => {
    expect(() => parseConfig({})).toThrow();
  });

  it("defaults DeFindex strategies to an empty list when omitted", () => {
    const c = parseConfig(env);
    expect(c.scanDefindexStrategies).toEqual([]);
  });

  it("throws a clear error when SCAN_DEFINDEX_STRATEGIES is malformed JSON", () => {
    expect(() => parseConfig({ ...env, SCAN_DEFINDEX_STRATEGIES: "{not json" })).toThrow(/valid JSON/);
  });

  it("parses DeFindex strategies from JSON and converts fallback TVL to stroops", () => {
    const c = parseConfig({
      ...env,
      SCAN_DEFINDEX_STRATEGIES: JSON.stringify([
        { strategyId: "C_STRAT", blendPoolId: "C_A", name: "DeFindex USDC", fallbackTvlUsdc: 1000 },
      ]),
    });
    expect(c.scanDefindexStrategies).toEqual([
      { strategyId: "C_STRAT", blendPoolId: "C_A", name: "DeFindex USDC", fallbackTvlUsdc: 1000_0000000n },
    ]);
  });
});
