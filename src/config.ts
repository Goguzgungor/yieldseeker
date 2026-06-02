import { z } from "zod";

const Schema = z.object({
  // ── Anthropic / LLM ───────────────────────────────────────────────────────
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),
  RISK_TOLERANCE: z.enum(["conservative", "balanced", "aggressive"]).default("balanced"),

  // ── Scan side = MAINNET (read-only yield discovery) ───────────────────────
  SCAN_RPC_URL: z.string().url(),
  SCAN_NETWORK_PASSPHRASE: z.string().min(1),
  SCAN_BLEND_POOL_IDS: z.string().min(1),
  SCAN_USDC_CONTRACT_ID: z.string().min(1),

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

const toStroops = (usdc: number) => BigInt(Math.round(usdc * 1e7));

export function parseConfig(env: Record<string, string | undefined>) {
  const e = Schema.parse(env);
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
