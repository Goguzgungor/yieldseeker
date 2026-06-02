import { z } from "zod";

const Schema = z.object({
  // ── Anthropic / LLM ───────────────────────────────────────────────────────
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),
  RISK_TOLERANCE: z.enum(["conservative", "balanced", "aggressive"]).default("balanced"),

  // ── Scan side = MAINNET (read-only yield discovery) ───────────────────────
  SCAN_RPC_URL: z.string().url(),
  SCAN_NETWORK_PASSPHRASE: z.string().min(1),
  // Curated fallback pool ids, used when on-chain discovery returns nothing.
  SCAN_BLEND_POOL_IDS: z.string().min(1),
  SCAN_USDC_CONTRACT_ID: z.string().min(1),
  // On-chain discovery contracts (Blend V2, mainnet) — OPTIONAL: defaults baked
  // in so existing .env files keep working untouched. From blend-utils
  // mainnet.contracts.json (poolFactoryV2 / backstopV2).
  SCAN_POOL_FACTORY_ID: z.string().min(1).default("CDSYOAVXFY7SM5S64IZPPPYB4GVGGLMQVFREPSQQEZVIWXX5R23G4QSU"),
  SCAN_BACKSTOP_ID: z.string().min(1).default("CAQQR5SWBXKIGZKPBZDH3KM5GQ5GUTPKB7JAFCINLZBC5WXPJKRG3IM7"),
  // DeFindex (mainnet, scan-only). JSON array; empty/omitted => disabled.
  SCAN_DEFINDEX_STRATEGIES: z.string().default("[]"),

  // ── Exec side = TESTNET (real tx, no real money) ──────────────────────────
  EXEC_RPC_URL: z.string().url(),
  EXEC_NETWORK_PASSPHRASE: z.string().min(1),
  EXEC_POOL_ID: z.string().min(1),
  EXEC_USDC_CONTRACT_ID: z.string().min(1),
  AGENT_SIGNER_SECRET: z.string().min(1),
  SMART_WALLET_ADDRESS: z.string().min(1),

  // ── Guard rails ───────────────────────────────────────────────────────────
  PER_TX_CAP_USDC: z.coerce.number().positive(),
  DAILY_CAP_USDC: z.coerce.number().positive(),
  MIN_YIELD_DELTA_BPS: z.coerce.number().nonnegative(),
  REBALANCE_COOLDOWN_SEC: z.coerce.number().nonnegative(),
  SCAN_INTERVAL_SEC: z.coerce.number().positive(),
});

const DefindexStrategySchema = z.object({
  strategyId: z.string().min(1),
  blendPoolId: z.string().min(1),
  name: z.string().min(1),
  fallbackTvlUsdc: z.coerce.number().nonnegative().default(0),
});
export interface DefindexStrategyConfig {
  strategyId: string;
  blendPoolId: string;
  name: string;
  fallbackTvlUsdc: bigint;
}

const toStroops = (usdc: number) => BigInt(Math.round(usdc * 1e7));

export function parseConfig(env: Record<string, string | undefined>) {
  const e = Schema.parse(env);
  let defindexRaw: unknown;
  try {
    defindexRaw = JSON.parse(e.SCAN_DEFINDEX_STRATEGIES);
  } catch {
    throw new Error("SCAN_DEFINDEX_STRATEGIES must be valid JSON (an array of strategy objects)");
  }
  const defindexStrategies = z
    .array(DefindexStrategySchema)
    .parse(defindexRaw)
    .map((s) => ({
      strategyId: s.strategyId,
      blendPoolId: s.blendPoolId,
      name: s.name,
      fallbackTvlUsdc: toStroops(s.fallbackTvlUsdc),
    }));
  return {
    // LLM
    anthropicApiKey: e.ANTHROPIC_API_KEY,
    anthropicModel: e.ANTHROPIC_MODEL,
    tolerance: e.RISK_TOLERANCE,
    // Scan (mainnet)
    scanRpcUrl: e.SCAN_RPC_URL,
    scanNetworkPassphrase: e.SCAN_NETWORK_PASSPHRASE,
    scanBlendPoolIds: e.SCAN_BLEND_POOL_IDS.split(",").map((s) => s.trim()).filter(Boolean),
    scanUsdcContractId: e.SCAN_USDC_CONTRACT_ID,
    scanPoolFactoryId: e.SCAN_POOL_FACTORY_ID,
    scanBackstopId: e.SCAN_BACKSTOP_ID,
    scanDefindexStrategies: defindexStrategies,
    // Exec (testnet)
    execRpcUrl: e.EXEC_RPC_URL,
    execNetworkPassphrase: e.EXEC_NETWORK_PASSPHRASE,
    execPoolId: e.EXEC_POOL_ID,
    execUsdcContractId: e.EXEC_USDC_CONTRACT_ID,
    agentSignerSecret: e.AGENT_SIGNER_SECRET,
    smartWalletAddress: e.SMART_WALLET_ADDRESS,
    // Guard rails
    perTxCapStroops: toStroops(e.PER_TX_CAP_USDC),
    dailyCapStroops: toStroops(e.DAILY_CAP_USDC),
    minYieldDeltaBps: e.MIN_YIELD_DELTA_BPS,
    rebalanceCooldownSec: e.REBALANCE_COOLDOWN_SEC,
    scanIntervalSec: e.SCAN_INTERVAL_SEC,
  };
}
export type Config = ReturnType<typeof parseConfig>;
