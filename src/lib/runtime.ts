import { Keypair } from "@stellar/stellar-sdk";
import { parseConfig, type Config } from "./config";
import { createDb, type Db } from "./db";
import { createBlendReader, scanYields, type BlendReader } from "./scanner";
import { createBlendOnchainPoolSource, createPoolDiscovery, isDiscoveryCacheFresh, DISCOVERY_TTL_MS, type PoolDiscovery } from "./discovery";
import { createSorobanClient, createExecutor, type Executor } from "./executor";
import { createKeypairWallet } from "./wallet";
import { createAnthropicLlm, decide, type LlmClient } from "./agent";
import { runTick } from "./orchestrator";
import { scorePools } from "./risk";
import {
  serializePosition,
  serializeScoredPools,
  type SerializedPosition,
  type SerializedScoredPool,
} from "./serialize";
import type { Position, ScoredPool, Decision } from "./types";

/** Latest agent decision exposed to the UI (chosen pool + rationale + action). */
export interface LatestDecision {
  action: Decision["action"];
  chosenPoolId: string | null;
  rationale: string;
}

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
  /**
   * Most recent SCORED scan result (riskScore/eligible/reason populated;
   * BigInts still as bigint — serialize at the edge). Empty until the first tick.
   */
  lastScan: ScoredPool[];
  /** Latest agent decision (chosen pool + rationale + action); null until first decide. */
  lastDecision: LatestDecision | null;
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
    lastDecision: null,
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
        // Cache the SCORED pools (deterministic; matches what runTick scores
        // internally) so the UI gets riskScore/eligible/reason without a re-scan.
        rt.lastScan = scorePools(s, rt.cfg.tolerance);
        // Persist to DB so route handlers (which may run in a separate module
        // instance) can read the latest snapshot regardless of which process
        // writes vs. reads.
        const scanAt = Date.now();
        rt.db.setKV("lastScan", JSON.stringify(serializeScoredPools(rt.lastScan)));
        rt.db.setKV("lastScanAt", String(scanAt));
        return s;
      },
      tolerance: rt.cfg.tolerance,
      getPosition: () => rt.db.getPosition(),
      // Wrap `decide` so the chosen pool + rationale are captured for the UI.
      decide: async (ctx) => {
        const decision = await decide(rt.llm, ctx as any);
        rt.lastDecision = {
          action: decision.action,
          chosenPoolId: decision.action === "rebalance" ? decision.toPool ?? null : null,
          rationale: decision.rationale,
        };
        // Persist decision to DB for cross-instance visibility.
        rt.db.setKV("lastDecision", JSON.stringify(rt.lastDecision));
        return decision;
      },
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
 * Persist a successful discovery result to the DB cache so future process
 * restarts can skip the blocking on-chain fetch.
 */
function cacheDiscovery(rt: Runtime, poolIds: string[]): void {
  rt.db.setKV("discoveredPools", JSON.stringify(poolIds));
  rt.db.setKV("discoveredAt", String(Date.now()));
}

/**
 * Read the cached discovery result from the DB, if any.
 * Returns `{ poolIds, discoveredAt }` or `null` if no cache entry exists.
 */
function readDiscoveryCache(rt: Runtime): { poolIds: string[]; discoveredAt: number } | null {
  const raw = rt.db.getKV("discoveredPools");
  const atRaw = rt.db.getKV("discoveredAt");
  if (!raw || !atRaw) return null;
  try {
    const poolIds = JSON.parse(raw) as string[];
    const discoveredAt = Number(atRaw);
    if (!Array.isArray(poolIds) || !Number.isFinite(discoveredAt)) return null;
    return { poolIds, discoveredAt };
  } catch {
    return null;
  }
}

/**
 * Start the continuous agent loop. Idempotent: only the first call starts it.
 *
 * Discovery strategy (fast startup):
 *  - If the DB cache is fresh (within DISCOVERY_TTL_MS), use it immediately and
 *    kick a background refresh without blocking startup.
 *  - If the cache is stale but present, use the cached ids immediately (so the
 *    first tick doesn't wait), then refresh in the background.
 *  - If no cache exists, discover now (blocks briefly), cache the result.
 *  - On-chain failure always falls back to cfg.scanBlendPoolIds.
 *
 * After discovery, runs one tick immediately then schedules ticks every
 * `scanIntervalSec`.
 */
export async function startLoop(): Promise<void> {
  const rt = getRuntime();
  if (rt.loopStarted) return;
  rt.loopStarted = true;

  const cached = readDiscoveryCache(rt);

  if (cached) {
    // Use cached ids immediately — no blocking RPC call.
    rt.poolIds = cached.poolIds;
    const fresh = isDiscoveryCacheFresh(cached.discoveredAt);
    rt.db.log(
      "discovery",
      `using ${cached.poolIds.length} cached pool id(s) (${fresh ? "fresh" : "stale — refreshing in background"})`,
      { poolIds: cached.poolIds, source: "cache", discoveredAt: cached.discoveredAt },
    );

    // Refresh in the background (stale → priority; fresh → lower priority).
    // Never let this block the tick loop.
    void (async () => {
      try {
        const discovered = await rt.poolDiscovery.discoverPoolIds();
        if (!arraysEqual(discovered, rt.poolIds ?? [])) {
          rt.poolIds = discovered;
          rt.db.log(
            "discovery",
            `background refresh: updated to ${discovered.length} pool id(s)`,
            { poolIds: discovered, source: "onchain" },
          );
        }
        cacheDiscovery(rt, discovered);
      } catch (e) {
        // Background refresh failure is non-fatal; cached ids remain in use.
        rt.db.log(
          "discovery",
          `background refresh failed (cached ids remain): ${(e as Error).message}`,
          { source: "fallback" },
        );
      }
    })();
  } else {
    // No cache — discover now (blocking, but only on first-ever run).
    try {
      const discovered = await rt.poolDiscovery.discoverPoolIds();
      rt.poolIds = discovered;
      cacheDiscovery(rt, discovered);
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

/** Shape returned by `/api/scan`. */
export interface ScanSnapshot {
  pools: SerializedScoredPool[];
  /** Epoch-ms when the snapshot was last written; null on a true cold start. */
  updatedAt: number | null;
}

/**
 * Most-recent SCORED scan — reads from the SQLite DB so it is consistent
 * regardless of which module instance (agent loop vs. route handler) calls it.
 * Falls back to the in-memory copy when the DB has no snapshot yet (e.g. very
 * first request before the first tick completes).
 *
 * Returns a {@link ScanSnapshot} with `updatedAt` so the UI can show how fresh
 * the cached data is.
 */
export function getLastScan(): ScanSnapshot {
  const rt = getRuntime();
  const raw = rt.db.getKV("lastScan");
  const atRaw = rt.db.getKV("lastScanAt");
  const updatedAt = atRaw ? Number(atRaw) || null : null;

  if (raw) {
    try {
      const pools = JSON.parse(raw) as SerializedScoredPool[];
      return { pools, updatedAt };
    } catch {
      // corrupt entry; fall through to in-memory copy
    }
  }
  return { pools: serializeScoredPools(rt.lastScan), updatedAt };
}

/**
 * Latest agent decision — reads from the SQLite DB so it is consistent
 * regardless of which module instance (agent loop vs. route handler) calls it.
 * Falls back to the in-memory copy / default when the DB has no entry yet.
 */
export function getDecision(): LatestDecision {
  const rt = getRuntime();
  const raw = rt.db.getKV("lastDecision");
  if (raw) {
    try {
      return JSON.parse(raw) as LatestDecision;
    } catch {
      // corrupt entry; fall through to in-memory copy
    }
  }
  return rt.lastDecision ?? { action: "hold", chosenPoolId: null, rationale: "" };
}
