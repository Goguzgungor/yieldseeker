import "dotenv/config";
import { Keypair } from "@stellar/stellar-sdk";
import { parseConfig } from "./config.js";
import { createDb } from "./db.js";
import { createBlendReader, scanYields } from "./scanner.js";
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
        scan: async () => { const s = await scanYields(reader, cfg.scanBlendPoolIds); state.lastScan = s as any; return s; },
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
main().catch((e) => { console.error(e); process.exit(1); });
