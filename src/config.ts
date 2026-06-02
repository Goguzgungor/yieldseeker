import { z } from "zod";

const Schema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),
  RISK_TOLERANCE: z.enum(["conservative", "balanced", "aggressive"]).default("balanced"),
  STELLAR_RPC_URL: z.string().url(),
  STELLAR_NETWORK_PASSPHRASE: z.string().min(1),
  USDC_CONTRACT_ID: z.string().min(1),
  BLEND_POOL_IDS: z.string().min(1),
  AGENT_SIGNER_SECRET: z.string().min(1),
  SMART_WALLET_ADDRESS: z.string().min(1),
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
    anthropicApiKey: e.ANTHROPIC_API_KEY,
    anthropicModel: e.ANTHROPIC_MODEL,
    tolerance: e.RISK_TOLERANCE,
    rpcUrl: e.STELLAR_RPC_URL,
    networkPassphrase: e.STELLAR_NETWORK_PASSPHRASE,
    usdcContractId: e.USDC_CONTRACT_ID,
    blendPoolIds: e.BLEND_POOL_IDS.split(",").map((s) => s.trim()).filter(Boolean),
    agentSignerSecret: e.AGENT_SIGNER_SECRET,
    smartWalletAddress: e.SMART_WALLET_ADDRESS,
    perTxCapStroops: toStroops(e.PER_TX_CAP_USDC),
    dailyCapStroops: toStroops(e.DAILY_CAP_USDC),
    minYieldDeltaBps: e.MIN_YIELD_DELTA_BPS,
    rebalanceCooldownSec: e.REBALANCE_COOLDOWN_SEC,
    scanIntervalSec: e.SCAN_INTERVAL_SEC,
  };
}
export type Config = ReturnType<typeof parseConfig>;
