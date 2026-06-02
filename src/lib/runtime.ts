import { Keypair } from "@stellar/stellar-sdk";
import { parseConfig, type Config } from "./config";
import { createDb, type Db } from "./db";
import { createBlendReader, scanYields, type BlendReader } from "./scanner";
import { createBlendOnchainPoolSource, createPoolDiscovery, type PoolDiscovery } from "./discovery";
import { createSorobanClient, createExecutor, type Executor } from "./executor";
import { createKeypairWallet } from "./wallet";
import { createAnthropicLlm, decide, type LlmClient } from "./agent";
import { runTick } from "./orchestrator";
import { serializePosition, type SerializedPosition } from "./serialize";
import type { Position, PoolYield } from "./types";

/**
 * Lazily-built process singleton wiring config → db → reader/discovery/wallet/
 * executor/llm together, plus the shared mutable loop state.
 *
 * CRITICAL: nothing here runs at module import time. `parseConfig(process.env)`
 * (and all SDK client construction) only happens inside {@link getRuntime} on
 * first call. This keeps `next build` / route static-analysis from crashing when
 * env vars are absent, and keeps the agent loop from starting during the build
 * phase.
 */
export interface Runtime {
  cfg: Config;
  db: Db;
  reader: BlendReader;
  poolDiscovery: PoolDiscovery;
  executor: Executor;
  llm: LlmClient;
  /** Most recent scan result (BigInts still as bigint; serialize at the edge). */
  lastScan: PoolYield[];
  lastRebalanceAt: number;
  running: boolean;
  loopStarted: boolean;
  /** Discovered Blend pool ids (cached once at loop start); null until resolved. */
  poolIds: string[] | null;
  /** setInterval handle for the tick loop, if started. */
  timer: ReturnType<typeof setInterval> | null;
}

let runtime: Runtime | null = null;

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Build (once) and return the runtime singleton. Throws a clear error if the
 * environment is missing/invalid — but only when actually called, never at
 * import time.
 */
export function getRuntime(): Runtime {
  if (runtime) return runtime;

  let cfg: Config;
  try {
    cfg = parseConfig(process.env);
  } catch (e) {
    throw new Error(
      `YieldSeeker runtime init failed: invalid/missing environment. ${(e as Error).message}`,
    );
  }

  const db = createDb("yieldseeker.sqlite");

  // Scan side: mainnet reader (read-only, no signing).
  const reader = createBlendReader(cfg.scanRpcUrl, cfg.scanNetworkPassphrase, cfg.scanUsdcContractId);

  // Dynamic on-chain pool discovery (Blend backstop reward zone + factory deploy
  // events), with the curated SCAN_BLEND_POOL_IDS as a fallback.
  const poolSource = createBlendOnchainPoolSource({
    rpcUrl: cfg.scanRpcUrl,
    networkPassphrase: cfg.scanNetworkPassphrase,
    backstopId: cfg.scanBackstopId,
    factoryId: cfg.scanPoolFactoryId,
  });
  const poolDiscovery = createPoolDiscovery(poolSource, cfg.scanBlendPoolIds);

  // Exec side: testnet signer + client (real txs, no real money).
  const wallet = createKeypairWallet(Keypair.fromSecret(cfg.agentSignerSecret), cfg.execNetworkPassphrase);
  const soroban = createSorobanClient({
    rpcUrl: cfg.execRpcUrl,
    networkPassphrase: cfg.execNetworkPassphrase,
    walletAddress: cfg.smartWalletAddress,
    usdcId: cfg.execUsdcContractId,
  });
  const executor = createExecutor(soroban, wallet);
  const llm = createAnthropicLlm(cfg.anthropicApiKey, cfg.anthropicModel);

  runtime = {
    cfg,
    db,
    reader,
    poolDiscovery,
    executor,
    llm,
    lastScan: [],
    lastRebalanceAt: 0,
    running: false,
    loopStarted: false,
    poolIds: null,
    timer: null,
  };
  return runtime;
}

/** One scan→score→decide→execute cycle. Mirrors the old index.ts loop body. */
async function tick(rt: Runtime): Promise<void> {
  if (rt.running) return; // idempotency: never overlap ticks
  rt.running = true;
  try {
    const now = Math.floor(Date.now() / 1000);
    const r = await runTick({
      scan: async () => {
        const poolIds = rt.poolIds && rt.poolIds.length ? rt.poolIds : rt.cfg.scanBlendPoolIds;
        const s = await scanYields(rt.reader, poolIds);
        rt.lastScan = s;
        return s;
      },
      tolerance: rt.cfg.tolerance,
      getPosition: () => rt.db.getPosition(),
      decide: (ctx) => decide(rt.llm, ctx as any),
      // Execution always targets the single testnet exec pool regardless of which
      // mainnet pool had the best yield — multi-pool exec is future work.
      rebalance: (_fromMainnet, _toMainnet, a) => rt.executor.deposit(rt.cfg.execPoolId, a),
      deposit: (_chosenMainnetPool, a) => rt.executor.deposit(rt.cfg.execPoolId, a),
      commitPosition: (p) => rt.db.setPosition(p),
      log: (k, m, meta) => rt.db.log(k, m, meta),
      recordRebalance: (a) => rt.db.recordRebalance(a),
      rebalancedSince: (s) => rt.db.rebalancedSince(s),
      minYieldDeltaBps: rt.cfg.minYieldDeltaBps,
      perTxCapStroops: rt.cfg.perTxCapStroops,
      dailyCapStroops: rt.cfg.dailyCapStroops,
      cooldownSec: rt.cfg.rebalanceCooldownSec,
      lastRebalanceAt: rt.lastRebalanceAt,
      now,
    });
    if (r.acted) rt.lastRebalanceAt = now;
  } catch (e) {
    rt.db.log("error", `tick failed: ${(e as Error).message}`);
  } finally {
    rt.running = false;
  }
}

/**
 * Start the continuous agent loop. Idempotent: only the first call starts it.
 * Resolves + caches the discovered pool ids once, logs discovery, runs one tick
 * immediately, then schedules `tick` every `scanIntervalSec`.
 */
export async function startLoop(): Promise<void> {
  const rt = getRuntime();
  if (rt.loopStarted) return;
  rt.loopStarted = true;

  // Resolve the pool set once and cache it for the lifetime of the process.
  try {
    const discovered = await rt.poolDiscovery.discoverPoolIds();
    rt.poolIds = discovered;
    const fromOnchain = !arraysEqual(discovered, rt.cfg.scanBlendPoolIds);
    rt.db.log(
      "discovery",
      `discovered ${discovered.length} Blend pool(s) (${fromOnchain ? "on-chain" : "fallback"})`,
      { poolIds: discovered, source: fromOnchain ? "onchain" : "fallback" },
    );
  } catch (e) {
    rt.poolIds = rt.cfg.scanBlendPoolIds;
    rt.db.log(
      "discovery",
      `pool discovery failed, using ${rt.poolIds.length} fallback pool(s): ${(e as Error).message}`,
      { poolIds: rt.poolIds, source: "fallback" },
    );
  }

  await tick(rt);
  rt.timer = setInterval(() => {
    void tick(rt);
  }, rt.cfg.scanIntervalSec * 1000);
}

// ── Accessors for the route handlers ────────────────────────────────────────

export function getPosition(): Position {
  return getRuntime().db.getPosition();
}

export function getSerializedPosition(): SerializedPosition {
  return serializePosition(getRuntime().db.getPosition());
}

export function getRecentLog(n = 50) {
  return getRuntime().db.recentLog(n);
}

/** Cached most-recent scan, BigInts rendered as strings for JSON. */
export function getLastScan(): Array<Record<string, unknown>> {
  return getRuntime().lastScan.map((p) => ({ ...p, tvlUsdc: p.tvlUsdc.toString() }));
}
