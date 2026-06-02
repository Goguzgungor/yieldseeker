import { scorePools, bestPool } from "./risk";
import type { PoolYield, Position, Decision, TxResult, RiskTolerance, UserRegistration } from "./types";

export interface TickDeps {
  scan: () => Promise<PoolYield[]>;
  tolerance: RiskTolerance;
  getPosition: () => Position;
  decide: (ctx: { pools: any; position: Position; tolerance: RiskTolerance }) => Promise<Decision>;
  rebalance: (from: string, to: string, amount: bigint) => Promise<TxResult>;
  deposit: (to: string, amount: bigint) => Promise<TxResult>;
  commitPosition: (p: Position) => void;
  log: (kind: string, msg: string, meta?: unknown) => void;
  recordRebalance: (amount: bigint) => void;
  rebalancedSince: (sinceTs: number) => bigint;
  minYieldDeltaBps: number; perTxCapStroops: bigint; dailyCapStroops: bigint;
  cooldownSec: number; lastRebalanceAt: number; now: number;
}

export async function runTick(d: TickDeps): Promise<{ acted: boolean; reason: string }> {
  const raw = await d.scan();
  const scored = scorePools(raw, d.tolerance);
  d.log("scan", `scanned ${raw.length} pools, ${scored.filter((p) => p.eligible).length} eligible`);

  const pos = d.getPosition();
  const decision = await d.decide({ pools: scored, position: pos, tolerance: d.tolerance });
  if (decision.action !== "rebalance" || !decision.toPool) {
    d.log("decision", `hold: ${decision.rationale}`);
    return { acted: false, reason: "hold" };
  }

  if (d.now - d.lastRebalanceAt < d.cooldownSec) { d.log("skip", "cooldown active"); return { acted: false, reason: "cooldown" }; }

  const target = scored.find((p) => p.poolId === decision.toPool);
  const current = scored.find((p) => p.poolId === pos.poolId);
  const best = bestPool(scored);
  if (!target || !target.eligible) { d.log("skip", "target not eligible"); return { acted: false, reason: "ineligible-target" }; }
  const deltaBps = target.apyBps - (current?.apyBps ?? 0);
  if (deltaBps < d.minYieldDeltaBps) { d.log("skip", `delta ${deltaBps}bps < ${d.minYieldDeltaBps}`); return { acted: false, reason: "below-delta" }; }
  if (best && target.poolId !== best.poolId) { d.log("skip", "target not the best eligible"); return { acted: false, reason: "not-best" }; }

  let amount = decision.amountUsdc ?? pos.amountUsdc;
  if (amount > d.perTxCapStroops) amount = d.perTxCapStroops;
  const dayAgo = d.now - 86400;
  if (d.rebalancedSince(dayAgo) + amount > d.dailyCapStroops) { d.log("skip", "daily cap reached"); return { acted: false, reason: "daily-cap" }; }
  // idle (poolId === null) -> deposit-only; allocated -> rebalance (withdraw+deposit)
  const res = pos.poolId
    ? await d.rebalance(pos.poolId, target.poolId, amount)
    : await d.deposit(target.poolId, amount);
  if (!res.success) { d.log("error", `execution failed: ${res.error}`, res); return { acted: false, reason: "tx-failed" }; }

  d.recordRebalance(amount);
  d.commitPosition({ poolId: target.poolId, amountUsdc: amount });
  const verb = pos.poolId ? `moved ${pos.poolId}->${target.poolId}` : `deposited idle -> ${target.poolId}`;
  d.log("rebalance", `${verb} ${amount} stroops (+${deltaBps}bps): ${decision.rationale}`, { hashes: res.hashes });
  return { acted: true, reason: pos.poolId ? "rebalanced" : "deposited" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-user execution (ARMA model). The loop scans + scores + decides the best
// pool ONCE; then for EACH registered user it supplies that user's idle USDC
// into the chosen EXEC pool via THEIR smart account, bounded by THEIR cap.
// ─────────────────────────────────────────────────────────────────────────────

/** Per-user dependency surface for {@link runPerUserExecution}. */
export interface PerUserDeps {
  /** All registered users (each has their own smart account + rule ids). */
  users: UserRegistration[];
  /** The single testnet EXEC pool every user supplies into. */
  execPoolId: string;
  /**
   * Supply `amount` (stroops) of idle USDC into `execPoolId` via THIS user's
   * smart account. Returns the tx result. Built by the runtime from a
   * per-user policy-signer wallet + executor.
   */
  supplyForUser: (user: UserRegistration, amount: bigint) => Promise<TxResult>;
  /** This user's current per-user position (idle => poolId null). */
  getUserPosition: (smartWallet: string) => Position;
  /** Persist this user's new position after a successful supply. */
  setUserPosition: (smartWallet: string, p: Position) => void;
  /** How much idle USDC the user has available to supply (stroops). */
  idleUsdcForUser: (user: UserRegistration) => Promise<bigint>;
  log: (kind: string, msg: string, meta?: unknown) => void;
  /** Per-tx cap (stroops) — also bounded on-chain by the user's spending rule. */
  perTxCapStroops: bigint;
}

export interface PerUserResult {
  /** Number of users a supply tx was attempted for. */
  attempted: number;
  /** Number of users whose supply landed successfully. */
  supplied: number;
  /** tx hashes of successful supplies. */
  hashes: string[];
}

/**
 * Execute the (already-made) decision PER USER: for each registered user with
 * idle USDC, supply up to `min(idle, perTxCap)` into the chosen exec pool via
 * their smart account. Skips users with no idle balance. Failures are logged
 * per-user and do not abort the others (one bad user can't block the loop).
 *
 * `chosenPoolId` is the mainnet pool the agent picked; execution always targets
 * the single testnet `execPoolId` (multi-pool exec is future work), exactly as
 * the legacy single-wallet path does.
 */
export async function runPerUserExecution(
  d: PerUserDeps,
  chosenPoolId: string | null,
): Promise<PerUserResult> {
  const out: PerUserResult = { attempted: 0, supplied: 0, hashes: [] };
  if (!d.users.length) {
    d.log("peruser", "no registered users — scan/decide only (no-op execution)");
    return out;
  }

  for (const user of d.users) {
    try {
      const idle = await d.idleUsdcForUser(user);
      if (idle <= 0n) {
        d.log("peruser", `skip ${user.owner.slice(0, 8)}… — no idle USDC`, {
          smartWallet: user.smartWallet,
        });
        continue;
      }
      const amount = idle > d.perTxCapStroops ? d.perTxCapStroops : idle;
      out.attempted++;
      const res = await d.supplyForUser(user, amount);
      if (!res.success) {
        d.log("error", `per-user supply failed for ${user.owner.slice(0, 8)}…: ${res.error}`, {
          smartWallet: user.smartWallet,
          hashes: res.hashes,
        });
        continue;
      }
      const prev = d.getUserPosition(user.smartWallet);
      const newAmount = (prev.poolId === d.execPoolId ? prev.amountUsdc : 0n) + amount;
      d.setUserPosition(user.smartWallet, { poolId: d.execPoolId, amountUsdc: newAmount });
      out.supplied++;
      out.hashes.push(...res.hashes);
      d.log(
        "peruser",
        `supplied ${amount} stroops idle USDC -> ${d.execPoolId} for ${user.owner.slice(0, 8)}… (chosen mainnet pool ${chosenPoolId ?? "n/a"})`,
        { smartWallet: user.smartWallet, hashes: res.hashes, amount: amount.toString() },
      );
    } catch (e) {
      d.log("error", `per-user execution error for ${user.owner.slice(0, 8)}…: ${(e as Error).message}`, {
        smartWallet: user.smartWallet,
      });
    }
  }
  return out;
}
