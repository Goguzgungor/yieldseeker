import "dotenv/config";
import { Keypair } from "@stellar/stellar-sdk";
import { parseConfig } from "./config.js";
import { createDb } from "./db.js";
import { createBlendReader, scanYields } from "./scanner.js";
import { createBlendOnchainPoolSource, createPoolDiscovery } from "./discovery.js";
import { createSorobanClient, createExecutor } from "./executor.js";
import { createKeypairWallet } from "./wallet.js";
import { createAnthropicLlm, decide } from "./agent.js";
import { runTick } from "./orchestrator.js";
import { createApi, type SharedState } from "./api.js";

async function main() {
  const cfg = parseConfig(process.env);
  const db = createDb("yieldseeker.sqlite");

  // Scan side: mainnet reader (read-only, no signing)
  const reader = createBlendReader(cfg.scanRpcUrl, cfg.scanNetworkPassphrase, cfg.scanUsdcContractId);

  // Dynamic on-chain pool discovery (Blend backstop reward zone + factory deploy
  // events), with the curated SCAN_BLEND_POOL_IDS as a fallback. Resolved once at
  // startup and cached for the lifetime of the process.
  const poolSource = createBlendOnchainPoolSource({
    rpcUrl: cfg.scanRpcUrl,
    networkPassphrase: cfg.scanNetworkPassphrase,
    backstopId: cfg.scanBackstopId,
    factoryId: cfg.scanPoolFactoryId,
  });
  const poolDiscovery = createPoolDiscovery(poolSource, cfg.scanBlendPoolIds);
  let discoveredPoolIds = cfg.scanBlendPoolIds;
  try {
    discoveredPoolIds = await poolDiscovery.discoverPoolIds();
    const fromOnchain = !arraysEqual(discoveredPoolIds, cfg.scanBlendPoolIds);
    db.log(
      "discovery",
      `discovered ${discoveredPoolIds.length} Blend pool(s) (${fromOnchain ? "on-chain" : "fallback"})`,
      { poolIds: discoveredPoolIds, source: fromOnchain ? "onchain" : "fallback" },
    );
  } catch (e) {
    discoveredPoolIds = cfg.scanBlendPoolIds;
    db.log("discovery", `pool discovery failed, using ${discoveredPoolIds.length} fallback pool(s): ${(e as Error).message}`, {
      poolIds: discoveredPoolIds,
      source: "fallback",
    });
  }

  // Exec side: testnet signer + client (real txs, no real money)
  const wallet = createKeypairWallet(Keypair.fromSecret(cfg.agentSignerSecret), cfg.execNetworkPassphrase); // swap to policy-signer wallet when ready
  const soroban = createSorobanClient({
    rpcUrl: cfg.execRpcUrl,
    networkPassphrase: cfg.execNetworkPassphrase,
    walletAddress: cfg.smartWalletAddress,
    usdcId: cfg.execUsdcContractId,
  });
  const executor = createExecutor(soroban, wallet);
  const llm = createAnthropicLlm(cfg.anthropicApiKey, cfg.anthropicModel);

  const state: SharedState = { lastScan: [] };
  let lastRebalanceAt = 0;
  let running = false;

  const api = createApi(db, state);
  await api.listen({ port: 8787 });
  console.log("API on http://localhost:8787");

  const loop = async () => {
    if (running) return; // idempotency: never overlap ticks
    running = true;
    try {
      const now = Math.floor(Date.now() / 1000);
      const r = await runTick({
        scan: async () => { const s = await scanYields(reader, discoveredPoolIds.length ? discoveredPoolIds : cfg.scanBlendPoolIds); state.lastScan = s as any; return s; },
        tolerance: cfg.tolerance,
        getPosition: () => db.getPosition(),
        decide: (ctx) => decide(llm, ctx as any),
        // Execution always targets the single testnet exec pool regardless of which
        // mainnet pool had the best yield — multi-pool exec is future work.
        rebalance: (_fromMainnet, _toMainnet, a) => executor.deposit(cfg.execPoolId, a),
        deposit: (_chosenMainnetPool, a) => executor.deposit(cfg.execPoolId, a),
        commitPosition: (p) => db.setPosition(p),
        log: (k, m, meta) => db.log(k, m, meta),
        recordRebalance: (a) => db.recordRebalance(a),
        rebalancedSince: (s) => db.rebalancedSince(s),
        minYieldDeltaBps: cfg.minYieldDeltaBps, perTxCapStroops: cfg.perTxCapStroops, dailyCapStroops: cfg.dailyCapStroops,
        cooldownSec: cfg.rebalanceCooldownSec, lastRebalanceAt, now,
      });
      if (r.acted) lastRebalanceAt = now;
    } catch (e) { db.log("error", `tick failed: ${(e as Error).message}`); }
    finally { running = false; }
  };
  await loop();
  setInterval(loop, cfg.scanIntervalSec * 1000);
}
function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

main().catch((e) => { console.error(e); process.exit(1); });
