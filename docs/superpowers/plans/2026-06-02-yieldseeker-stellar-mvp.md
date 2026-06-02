# YieldSeeker · Stellar MVP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an off-chain LLM agent backend that autonomously scans Blend Capital USDC yields on Soroban testnet and rebalances a user's funds into the best risk-adjusted pool via real testnet transactions.

**Architecture:** TypeScript/Node single package. An orchestrator loop runs `scanner → risk → agent(Claude tool-use) → executor`. The executor signs Blend `submit` transactions with an **agent policy signer** (ed25519, restricted to registered Blend pool contracts + caps) attached to a Soroban smart wallet. State and an activity log persist to SQLite; a thin REST/SSE API exposes them for the later frontend.

**Tech Stack:** Node 20+, TypeScript, vitest, zod, `@stellar/stellar-sdk`, `@blend-capital/blend-sdk`, `smart-account-kit` (passkey-kit fallback), `@anthropic-ai/sdk` (Claude tool-use), `better-sqlite3`, `express`.

**Spec:** `docs/superpowers/specs/2026-06-02-yieldseeker-stellar-mvp-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`, `.gitignore` | Tooling/config |
| `src/types.ts` | Domain types (PoolYield, RiskTolerance, ScoredPool, Decision, TxResult, Position) |
| `src/config.ts` | Env loading + network/Blend pool config (zod-validated) |
| `src/risk.ts` / `src/risk.test.ts` | Deterministic risk scoring + tolerance filter |
| `src/scanner.ts` / `src/scanner.test.ts` | Blend pool → PoolYield (APR calc, normalize) |
| `src/db.ts` / `src/db.test.ts` | SQLite state + activity log |
| `src/wallet.ts` / `src/wallet.test.ts` | Smart wallet + agent policy signer; sign/submit |
| `src/executor.ts` / `src/executor.test.ts` | rebalance = withdraw→deposit (simulate/sign/submit) |
| `src/agent.ts` / `src/agent.test.ts` | Claude tool-use loop; tools + zod validation |
| `src/orchestrator.ts` / `src/orchestrator.test.ts` | tick loop + guards (min-delta, cooldown, cap) |
| `src/api.ts` / `src/api.test.ts` | REST + `/events` SSE |
| `src/index.ts` | Entrypoint: wire everything, start loop + API |
| `scripts/verify-blend-testnet.ts` | Spike: confirm testnet Blend pool IDs + SDK API |
| `tests/smoke/testnet.smoke.test.ts` | E2E: one real rebalance on testnet (gated) |

**Conventions:** All money amounts are `bigint` in 7-decimal stroops (USDC on Stellar has 7 decimals). Unit tests never hit network or Anthropic — both are injected/mocked. Testnet smoke tests run only when `RUN_TESTNET_SMOKE=1`.

---

## Task 0: Project scaffold + tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.env.example`

- [ ] **Step 1: Initialize git + npm**

```bash
cd /Users/midex/Documents/hack-search
git init
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm i @stellar/stellar-sdk @blend-capital/blend-sdk @anthropic-ai/sdk better-sqlite3 express zod dotenv
npm i -D typescript tsx vitest @types/node @types/express @types/better-sqlite3
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src", "tests", "scripts"]
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["src/**/*.test.ts", "tests/**/*.test.ts"], environment: "node" },
});
```

- [ ] **Step 5: Create `.gitignore` and `.env.example`**

`.gitignore`:
```
node_modules
dist
.env
*.sqlite
.superpowers
```

`.env.example`:
```
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6
RISK_TOLERANCE=balanced
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
USDC_CONTRACT_ID=
BLEND_POOL_IDS=
AGENT_SIGNER_SECRET=
SMART_WALLET_ADDRESS=
PER_TX_CAP_USDC=2000
DAILY_CAP_USDC=5000
MIN_YIELD_DELTA_BPS=50
REBALANCE_COOLDOWN_SEC=120
SCAN_INTERVAL_SEC=30
RUN_TESTNET_SMOKE=0
```

- [ ] **Step 6: Add npm scripts to `package.json`**

Add to `"scripts"`:
```json
{
  "dev": "tsx src/index.ts",
  "test": "vitest run",
  "verify:blend": "tsx scripts/verify-blend-testnet.ts"
}
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "chore: scaffold YieldSeeker Stellar MVP project"
```

---

## Task 1: Domain types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Write `src/types.ts`**

```ts
export type RiskTolerance = "conservative" | "balanced" | "aggressive";

export interface PoolYield {
  poolId: string;          // Blend pool contract id
  name: string;
  asset: "USDC";
  apyBps: number;          // total supply APY in basis points (e.g. 860 = 8.6%)
  tvlUsdc: bigint;         // pool USDC TVL in stroops (7 decimals)
  utilizationBps: number;  // 0..10000
  oracleHealthy: boolean;  // false => flagged risky
}

export interface ScoredPool extends PoolYield {
  riskScore: number;       // 0 (safe) .. 100 (risky)
  eligible: boolean;       // passes tolerance filter
  reason?: string;         // why ineligible
}

export interface Position {
  poolId: string | null;   // null = idle / unallocated
  amountUsdc: bigint;      // stroops
}

export interface Decision {
  action: "hold" | "rebalance";
  toPool?: string;
  amountUsdc?: bigint;
  rationale: string;
}

export interface TxResult {
  hashes: string[];
  success: boolean;
  error?: string;
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors

```bash
git add src/types.ts && git commit -m "feat: domain types"
```

---

## Task 2: Risk scoring (deterministic)

**Files:**
- Create: `src/risk.ts`, `src/risk.test.ts`

- [ ] **Step 1: Write failing test `src/risk.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { scorePools } from "./risk.js";
import type { PoolYield } from "./types.js";

const base: PoolYield = {
  poolId: "P", name: "x", asset: "USDC",
  apyBps: 800, tvlUsdc: 100_000_0000000n, utilizationBps: 5000, oracleHealthy: true,
};

describe("scorePools", () => {
  it("flags unhealthy-oracle pools ineligible regardless of tolerance", () => {
    const out = scorePools([{ ...base, oracleHealthy: false }], "aggressive");
    expect(out[0].eligible).toBe(false);
    expect(out[0].reason).toMatch(/oracle/i);
  });

  it("conservative rejects low-TVL pools, balanced accepts them", () => {
    const lowTvl = { ...base, tvlUsdc: 1_000_0000000n }; // 1k USDC
    expect(scorePools([lowTvl], "conservative")[0].eligible).toBe(false);
    expect(scorePools([lowTvl], "balanced")[0].eligible).toBe(true);
  });

  it("higher utilization and lower TVL increase risk score", () => {
    const safe = scorePools([base], "balanced")[0];
    const risky = scorePools([{ ...base, utilizationBps: 9500, tvlUsdc: 5_000_0000000n }], "balanced")[0];
    expect(risky.riskScore).toBeGreaterThan(safe.riskScore);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/risk.test.ts`
Expected: FAIL ("scorePools" not exported / module not found)

- [ ] **Step 3: Implement `src/risk.ts`**

```ts
import type { PoolYield, ScoredPool, RiskTolerance } from "./types.js";

// Minimum acceptable TVL (stroops, 7 decimals) per tolerance.
const MIN_TVL: Record<RiskTolerance, bigint> = {
  conservative: 50_000_0000000n, // 50k USDC
  balanced: 5_000_0000000n,      // 5k USDC
  aggressive: 0n,
};
// Max acceptable risk score per tolerance.
const MAX_RISK: Record<RiskTolerance, number> = {
  conservative: 35, balanced: 65, aggressive: 100,
};

export function scorePools(pools: PoolYield[], tolerance: RiskTolerance): ScoredPool[] {
  return pools.map((p) => {
    // Risk from utilization (0..60) + low-TVL penalty (0..40).
    const utilRisk = Math.round((p.utilizationBps / 10000) * 60);
    const tvlRef = 100_000_0000000n; // 100k USDC reference
    const tvlRatio = p.tvlUsdc >= tvlRef ? 1 : Number(p.tvlUsdc) / Number(tvlRef);
    const tvlRisk = Math.round((1 - tvlRatio) * 40);
    const riskScore = Math.min(100, utilRisk + tvlRisk);

    let eligible = true;
    let reason: string | undefined;
    if (!p.oracleHealthy) { eligible = false; reason = "oracle unhealthy / flagged"; }
    else if (p.tvlUsdc < MIN_TVL[tolerance]) { eligible = false; reason = "TVL below tolerance floor"; }
    else if (riskScore > MAX_RISK[tolerance]) { eligible = false; reason = "risk score above tolerance"; }

    return { ...p, riskScore, eligible, reason };
  });
}

/** Best eligible pool by APY, or null. */
export function bestPool(scored: ScoredPool[]): ScoredPool | null {
  const eligible = scored.filter((p) => p.eligible);
  if (eligible.length === 0) return null;
  return eligible.reduce((a, b) => (b.apyBps > a.apyBps ? b : a));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/risk.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/risk.ts src/risk.test.ts && git commit -m "feat: deterministic risk scoring + tolerance filter"
```

---

## Task 3: Config loader

**Files:**
- Create: `src/config.ts`, `src/config.test.ts`

- [ ] **Step 1: Write failing test `src/config.test.ts`**

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/config.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/config.ts`**

```ts
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
```

- [ ] **Step 4: Run + commit**

Run: `npx vitest run src/config.test.ts` → Expected: PASS
```bash
git add src/config.ts src/config.test.ts && git commit -m "feat: zod-validated config loader"
```

---

## Task 4: SQLite state + activity log

**Files:**
- Create: `src/db.ts`, `src/db.test.ts`

- [ ] **Step 1: Write failing test `src/db.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { createDb } from "./db.js";

describe("db", () => {
  it("persists position and appends activity log", () => {
    const db = createDb(":memory:");
    db.setPosition({ poolId: "C_A", amountUsdc: 1000_0000000n });
    expect(db.getPosition()).toEqual({ poolId: "C_A", amountUsdc: 1000_0000000n });

    db.log("info", "scanned 2 pools");
    db.log("rebalance", "moved A->B", { hash: "abc" });
    const events = db.recentLog(10);
    expect(events.length).toBe(2);
    expect(events[0].message).toBe("moved A->B"); // newest first
  });

  it("sums rebalanced amount in the last 24h for daily cap", () => {
    const db = createDb(":memory:");
    db.recordRebalance(1000_0000000n, 1_000_000);
    db.recordRebalance(500_0000000n, 1_000_100);
    expect(db.rebalancedSince(0)).toBe(1500_0000000n);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/db.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/db.ts`**

```ts
import Database from "better-sqlite3";
import type { Position } from "./types.js";

export function createDb(path = "yieldseeker.sqlite") {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS position (id INTEGER PRIMARY KEY CHECK (id=1), poolId TEXT, amount TEXT);
    CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, kind TEXT, message TEXT, meta TEXT);
    CREATE TABLE IF NOT EXISTS rebalances (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, amount TEXT);
  `);

  return {
    setPosition(p: Position) {
      db.prepare(`INSERT INTO position (id,poolId,amount) VALUES (1,?,?)
                  ON CONFLICT(id) DO UPDATE SET poolId=excluded.poolId, amount=excluded.amount`)
        .run(p.poolId, p.amountUsdc.toString());
    },
    getPosition(): Position {
      const row = db.prepare(`SELECT poolId, amount FROM position WHERE id=1`).get() as any;
      if (!row) return { poolId: null, amountUsdc: 0n };
      return { poolId: row.poolId, amountUsdc: BigInt(row.amount) };
    },
    log(kind: string, message: string, meta?: unknown, now = Math.floor(Date.now() / 1000)) {
      db.prepare(`INSERT INTO activity (ts,kind,message,meta) VALUES (?,?,?,?)`)
        .run(now, kind, message, meta ? JSON.stringify(meta) : null);
    },
    recentLog(limit = 50) {
      return db.prepare(`SELECT ts,kind,message,meta FROM activity ORDER BY id DESC LIMIT ?`)
        .all(limit) as { ts: number; kind: string; message: string; meta: string | null }[];
    },
    recordRebalance(amount: bigint, now = Math.floor(Date.now() / 1000)) {
      db.prepare(`INSERT INTO rebalances (ts,amount) VALUES (?,?)`).run(now, amount.toString());
    },
    rebalancedSince(sinceTs: number): bigint {
      const rows = db.prepare(`SELECT amount FROM rebalances WHERE ts >= ?`).all(sinceTs) as { amount: string }[];
      return rows.reduce((s, r) => s + BigInt(r.amount), 0n);
    },
  };
}
export type Db = ReturnType<typeof createDb>;
```

- [ ] **Step 4: Run + commit**

Run: `npx vitest run src/db.test.ts` → Expected: PASS
```bash
git add src/db.ts src/db.test.ts && git commit -m "feat: sqlite state + activity log"
```

---

## Task 5: SPIKE — verify Blend testnet pools + SDK API

> Resolves spec risk #1 and #3. This is a throwaway script whose OUTPUT fills `.env` (USDC_CONTRACT_ID, BLEND_POOL_IDS) and confirms the exact `@blend-capital/blend-sdk` API used in Task 6/7.

**Files:**
- Create: `scripts/verify-blend-testnet.ts`

- [ ] **Step 1: Write `scripts/verify-blend-testnet.ts`**

```ts
// Spike: load known Blend testnet pool(s), print reserve data + APY inputs.
// Run, then copy real pool ids into .env (BLEND_POOL_IDS) and USDC into USDC_CONTRACT_ID.
import { rpc } from "@stellar/stellar-sdk";
import * as Blend from "@blend-capital/blend-sdk";

const RPC = process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
const NETWORK = "Test SDF Network ; September 2015";
// Candidate testnet pool ids come from Blend docs / discord; replace below after checking docs.blend.capital.
const CANDIDATE_POOLS = (process.env.BLEND_POOL_IDS ?? "").split(",").filter(Boolean);

async function main() {
  console.log("Blend SDK exports:", Object.keys(Blend).join(", "));
  const server = new rpc.Server(RPC, { allowHttp: RPC.startsWith("http://") });
  console.log("RPC health:", await server.getHealth());
  for (const id of CANDIDATE_POOLS) {
    try {
      // NOTE: confirm exact loader name against installed version (PoolV2 / Pool.load / PoolV2.load).
      const pool: any = await (Blend as any).PoolV2.load({ rpc: RPC, network: NETWORK } as any, id);
      console.log(`Pool ${id}: reserves=`, Object.keys(pool.reserves ?? {}));
    } catch (e) {
      console.error(`Pool ${id} load failed:`, (e as Error).message);
    }
  }
}
main();
```

- [ ] **Step 2: Find current testnet pool + USDC ids**

Run: open `https://docs.blend.capital` (Integrations) and the Blend testnet deployment list; record the testnet USDC SAC contract id and ≥2 pool contract ids. If testnet has fewer than 2 USDC pools, note it — Task 5b (optional) deploys a second test pool.

- [ ] **Step 3: Run the spike**

Run: `BLEND_POOL_IDS="<id1>,<id2>" npm run verify:blend`
Expected: prints SDK exports, RPC health "healthy", and reserve keys per pool. Record the **exact** loader/class names and reserve→APY fields you see; these pin down Task 6 (`scanner`) and Task 7 (`executor`).

- [ ] **Step 4: Fill `.env`**

Copy `.env.example` to `.env`; set `USDC_CONTRACT_ID`, `BLEND_POOL_IDS`, `ANTHROPIC_API_KEY`. Leave wallet vars for Task 8.

- [ ] **Step 5: Commit the spike script (not .env)**

```bash
git add scripts/verify-blend-testnet.ts && git commit -m "chore: blend testnet verification spike"
```

> **Decision gate:** If `PoolV2.load` differs from the above, update the adapter signature used in Tasks 6 & 7 to match what this spike printed. All Blend calls in later tasks go through `src/scanner.ts` and `src/executor.ts` only.

---

## Task 6: Scanner (Blend pool → PoolYield)

**Files:**
- Create: `src/scanner.ts`, `src/scanner.test.ts`

The scanner depends on a small injected `BlendReader` interface so it is unit-testable without network. The real implementation wraps the SDK API confirmed in Task 5.

- [ ] **Step 1: Write failing test `src/scanner.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { scanYields, type RawReserve } from "./scanner.js";

const reader = {
  async readReserve(poolId: string): Promise<RawReserve> {
    const map: Record<string, RawReserve> = {
      C_A: { poolId: "C_A", name: "Fixed Pool", supplyApr: 0.086, totalSupplyUsdc: 155_000_0000000n, utilization: 0.62, oracleStale: false },
      C_B: { poolId: "C_B", name: "YBX Pool", supplyApr: 0.094, totalSupplyUsdc: 40_000_0000000n, utilization: 0.71, oracleStale: true },
    };
    return map[poolId];
  },
};

describe("scanYields", () => {
  it("maps reserves to PoolYield with bps APY and oracle health", async () => {
    const out = await scanYields(reader, ["C_A", "C_B"]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ poolId: "C_A", apyBps: 860, oracleHealthy: true, utilizationBps: 6200 });
    expect(out[1]).toMatchObject({ poolId: "C_B", apyBps: 940, oracleHealthy: false });
  });

  it("skips pools that fail to read instead of throwing", async () => {
    const flaky = { async readReserve(id: string) { if (id === "BAD") throw new Error("rpc"); return reader.readReserve(id); } };
    const out = await scanYields(flaky as any, ["C_A", "BAD"]);
    expect(out.map((p) => p.poolId)).toEqual(["C_A"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/scanner.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/scanner.ts`**

```ts
import type { PoolYield } from "./types.js";

export interface RawReserve {
  poolId: string;
  name: string;
  supplyApr: number;        // fraction, e.g. 0.086
  totalSupplyUsdc: bigint;  // stroops
  utilization: number;      // 0..1
  oracleStale: boolean;
}

export interface BlendReader {
  readReserve(poolId: string): Promise<RawReserve>;
}

export async function scanYields(reader: BlendReader, poolIds: string[]): Promise<PoolYield[]> {
  const out: PoolYield[] = [];
  for (const id of poolIds) {
    try {
      const r = await reader.readReserve(id);
      out.push({
        poolId: r.poolId,
        name: r.name,
        asset: "USDC",
        apyBps: Math.round(r.supplyApr * 10000),
        tvlUsdc: r.totalSupplyUsdc,
        utilizationBps: Math.round(r.utilization * 10000),
        oracleHealthy: !r.oracleStale,
      });
    } catch {
      // Skip unreadable pool; orchestrator logs the gap.
    }
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/scanner.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Implement the real `BlendReader` (network adapter)**

Append to `src/scanner.ts`. Adjust field access to match the exact reserve shape printed by the Task 5 spike (the lines marked CONFIRM).

```ts
import { rpc } from "@stellar/stellar-sdk";
import * as Blend from "@blend-capital/blend-sdk";

export function createBlendReader(rpcUrl: string, networkPassphrase: string): BlendReader {
  return {
    async readReserve(poolId: string): Promise<RawReserve> {
      // CONFIRM loader signature from Task 5 spike output:
      const pool: any = await (Blend as any).PoolV2.load({ rpc: rpcUrl, network: networkPassphrase } as any, poolId);
      const usdcReserve: any = Object.values(pool.reserves).find((r: any) =>
        (r.tokenMetadata?.symbol ?? r.symbol) === "USDC"); // CONFIRM symbol field
      return {
        poolId,
        name: pool.metadata?.name ?? poolId.slice(0, 6),     // CONFIRM
        supplyApr: Number(usdcReserve.supplyApr ?? usdcReserve.estSupplyApy), // CONFIRM
        totalSupplyUsdc: BigInt(Math.round(Number(usdcReserve.totalSupply ?? 0))),
        utilization: Number(usdcReserve.getUtilization?.() ?? usdcReserve.utilization ?? 0),
        oracleStale: Boolean(usdcReserve.oracleStale ?? false),
      };
    },
  };
}
```

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit` → Expected: no errors
```bash
git add src/scanner.ts src/scanner.test.ts && git commit -m "feat: scanner (Blend reserve -> PoolYield) + network adapter"
```

---

## Task 7: SPIKE + Wallet (smart wallet + agent policy signer)

> Resolves spec risk #2. Targets the user's model: user authorizes once; the **agent** signs autonomously with a restricted ed25519 policy signer. For the backend MVP, the agent signer is a server-held ed25519 key registered to the smart wallet with a policy limiting it to Blend pool contracts + caps. **Fallback (bounded):** if registering a policy signer via `smart-account-kit`/`passkey-kit` proves too heavy in the timebox, use a funded plain testnet keypair as the signer and enforce caps in `executor`/`orchestrator` only (spec's "production upgrade" note). Either way the `Wallet` interface below is unchanged.

**Files:**
- Create: `src/wallet.ts`, `src/wallet.test.ts`

- [ ] **Step 1: Spike the wallet kit**

Run: `npm i smart-account-kit` (fallback `npm i passkey-kit`) and read its README. In a scratch `tsx` REPL, confirm how to (a) deploy/reference a smart wallet contract account on testnet, (b) add an ed25519 signer with a policy restricting target contract ids + amount. Record the exact calls. If neither path works headlessly in the timebox, take the funded-keypair fallback.

- [ ] **Step 2: Write failing test `src/wallet.test.ts`** (interface contract, no network)

```ts
import { describe, it, expect } from "vitest";
import { createKeypairWallet } from "./wallet.js";
import { Keypair } from "@stellar/stellar-sdk";

describe("wallet (keypair fallback)", () => {
  it("exposes an address and signs an xdr deterministically", () => {
    const kp = Keypair.random();
    const w = createKeypairWallet(kp, "Test SDF Network ; September 2015");
    expect(w.address()).toBe(kp.publicKey());
    expect(typeof w.signXdr("AAAA")).toBe("string"); // returns signed xdr/signature payload
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/wallet.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 4: Implement `src/wallet.ts`** (interface + keypair impl; policy-signer impl wraps same interface)

```ts
import { Keypair, TransactionBuilder, Transaction, FeeBumpTransaction } from "@stellar/stellar-sdk";

export interface Wallet {
  address(): string;
  /** Sign a base64 tx envelope XDR; return signed base64 XDR. */
  signXdr(xdr: string): string;
}

// MVP fallback: agent holds a funded ed25519 key. Caps enforced in executor/orchestrator.
export function createKeypairWallet(kp: Keypair, networkPassphrase: string): Wallet {
  return {
    address: () => kp.publicKey(),
    signXdr(xdr: string) {
      const tx = TransactionBuilder.fromXDR(xdr, networkPassphrase) as Transaction | FeeBumpTransaction;
      tx.sign(kp);
      return tx.toXDR();
    },
  };
}

// Target model: policy-signer on a smart wallet (contract account). Implement against the
// kit confirmed in Step 1; MUST satisfy the same Wallet interface. Restrict signer to
// Blend pool contract ids + per-tx cap so a compromised server cannot drain funds.
// export function createPolicySignerWallet(...): Wallet { ... }  // fill from Step 1 findings
```

- [ ] **Step 5: Run to verify it passes + commit**

Run: `npx vitest run src/wallet.test.ts` → Expected: PASS
```bash
git add src/wallet.ts src/wallet.test.ts && git commit -m "feat: wallet interface + keypair signer (policy-signer to follow)"
```

---

## Task 8: Executor (rebalance = withdraw → deposit)

**Files:**
- Create: `src/executor.ts`, `src/executor.test.ts`

Executor depends on injected `Wallet` and a `SorobanClient` interface (build/simulate/submit), so it is unit-testable. Real submit path uses `@stellar/stellar-sdk` rpc + Blend `submit`.

- [ ] **Step 1: Write failing test `src/executor.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { createExecutor, type SorobanClient } from "./executor.js";

function fakeClient(): SorobanClient {
  return {
    buildBlendSubmit: vi.fn(async (poolId, kind, amount) => `XDR:${kind}:${poolId}:${amount}`),
    simulate: vi.fn(async () => ({ ok: true })),
    submit: vi.fn(async (xdr: string) => ({ hash: "h:" + xdr, success: true })),
  };
}

describe("executor.rebalance", () => {
  it("withdraws from source then deposits to target and returns both hashes", async () => {
    const client = fakeClient();
    const wallet = { address: () => "G", signXdr: (x: string) => "signed:" + x };
    const exec = createExecutor(client, wallet);
    const res = await exec.rebalance("C_A", "C_B", 1000_0000000n);
    expect(res.success).toBe(true);
    expect(res.hashes).toHaveLength(2);
    expect(client.buildBlendSubmit).toHaveBeenNthCalledWith(1, "C_A", "withdraw", 1000_0000000n);
    expect(client.buildBlendSubmit).toHaveBeenNthCalledWith(2, "C_B", "deposit", 1000_0000000n);
  });

  it("aborts before deposit if withdraw simulation fails", async () => {
    const client = fakeClient();
    (client.simulate as any).mockResolvedValueOnce({ ok: false, error: "withdraw sim failed" });
    const wallet = { address: () => "G", signXdr: (x: string) => x };
    const res = await createExecutor(client, wallet).rebalance("C_A", "C_B", 1000_0000000n);
    expect(res.success).toBe(false);
    expect(client.submit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/executor.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/executor.ts`**

```ts
import type { Wallet } from "./wallet.js";
import type { TxResult } from "./types.js";

export interface SorobanClient {
  buildBlendSubmit(poolId: string, kind: "withdraw" | "deposit", amount: bigint): Promise<string>; // returns unsigned xdr
  simulate(xdr: string): Promise<{ ok: boolean; error?: string }>;
  submit(signedXdr: string): Promise<{ hash: string; success: boolean; error?: string }>;
}

export function createExecutor(client: SorobanClient, wallet: Wallet) {
  async function step(poolId: string, kind: "withdraw" | "deposit", amount: bigint): Promise<string> {
    const xdr = await client.buildBlendSubmit(poolId, kind, amount);
    const sim = await client.simulate(xdr);
    if (!sim.ok) throw new Error(`${kind} simulate failed: ${sim.error ?? "unknown"}`);
    const signed = wallet.signXdr(xdr);
    const res = await client.submit(signed);
    if (!res.success) throw new Error(`${kind} submit failed: ${res.error ?? "unknown"}`);
    return res.hash;
  }

  return {
    async rebalance(fromPool: string, toPool: string, amount: bigint): Promise<TxResult> {
      const hashes: string[] = [];
      try {
        hashes.push(await step(fromPool, "withdraw", amount));
        hashes.push(await step(toPool, "deposit", amount));
        return { hashes, success: true };
      } catch (e) {
        return { hashes, success: false, error: (e as Error).message };
      }
    },
  };
}
export type Executor = ReturnType<typeof createExecutor>;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/executor.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Implement the real `SorobanClient`**

Append to `src/executor.ts`. The Blend `submit` request shape comes from the Task 5 spike (Blend docs: `PoolContract.submit` with `Request[]` of `SupplyCollateral`/`WithdrawCollateral`).

```ts
import { rpc, TransactionBuilder, BASE_FEE, Account } from "@stellar/stellar-sdk";
import * as Blend from "@blend-capital/blend-sdk";

export function createSorobanClient(opts: {
  rpcUrl: string; networkPassphrase: string; walletAddress: string; usdcId: string;
}): SorobanClient {
  const server = new rpc.Server(opts.rpcUrl, { allowHttp: opts.rpcUrl.startsWith("http://") });
  const RequestType: any = (Blend as any).RequestType; // CONFIRM enum (SupplyCollateral=2, WithdrawCollateral=3) from Task 5
  return {
    async buildBlendSubmit(poolId, kind, amount) {
      const pool: any = new (Blend as any).PoolContract(poolId);
      const op = pool.submit({
        from: opts.walletAddress, spender: opts.walletAddress, to: opts.walletAddress,
        requests: [{
          request_type: kind === "deposit" ? RequestType.SupplyCollateral : RequestType.WithdrawCollateral,
          address: opts.usdcId, amount,
        }],
      }); // returns base64 InvokeHostFunction op xdr — CONFIRM exact return type
      const source = await server.getAccount(opts.walletAddress);
      const tx = new TransactionBuilder(new Account(source.accountId(), source.sequenceNumber()), {
        fee: BASE_FEE, networkPassphrase: opts.networkPassphrase,
      }).addOperation(typeof op === "string" ? (Blend as any).xdr.Operation.fromXDR(op, "base64") : op)
        .setTimeout(30).build();
      return tx.toXDR();
    },
    async simulate(xdr) {
      const tx = TransactionBuilder.fromXDR(xdr, opts.networkPassphrase);
      const sim = await server.simulateTransaction(tx as any);
      return rpc.Api.isSimulationError(sim) ? { ok: false, error: sim.error } : { ok: true };
    },
    async submit(signedXdr) {
      const tx = TransactionBuilder.fromXDR(signedXdr, opts.networkPassphrase);
      const sent = await server.sendTransaction(tx as any);
      if (sent.status === "ERROR") return { hash: sent.hash, success: false, error: JSON.stringify(sent.errorResult) };
      let g = await server.getTransaction(sent.hash);
      for (let i = 0; i < 10 && g.status === "NOT_FOUND"; i++) { await new Promise(r => setTimeout(r, 1000)); g = await server.getTransaction(sent.hash); }
      return { hash: sent.hash, success: g.status === "SUCCESS", error: g.status === "SUCCESS" ? undefined : g.status };
    },
  };
}
```

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit` → Expected: no errors (fix CONFIRM lines against spike output if needed)
```bash
git add src/executor.ts src/executor.test.ts && git commit -m "feat: executor rebalance (withdraw->deposit) + soroban client"
```

---

## Task 9: Agent (Claude tool-use loop)

**Files:**
- Create: `src/agent.ts`, `src/agent.test.ts`

The agent takes an injected `LlmClient` so tests are deterministic (no Anthropic call). The decision is produced by the LLM choosing the `rebalance` tool or answering `hold`.

- [ ] **Step 1: Write failing test `src/agent.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { decide, type LlmClient } from "./agent.js";
import type { ScoredPool, Position } from "./types.js";

const pools: ScoredPool[] = [
  { poolId: "C_A", name: "A", asset: "USDC", apyBps: 820, tvlUsdc: 100_000_0000000n, utilizationBps: 5000, oracleHealthy: true, riskScore: 20, eligible: true },
  { poolId: "C_B", name: "B", asset: "USDC", apyBps: 880, tvlUsdc: 100_000_0000000n, utilizationBps: 5200, oracleHealthy: true, riskScore: 22, eligible: true },
];
const position: Position = { poolId: "C_A", amountUsdc: 1000_0000000n };

it("returns a rebalance decision when the llm calls the rebalance tool", async () => {
  const llm: LlmClient = {
    async runToolLoop(_sys, _user, tools) {
      const t = tools.find((x) => x.name === "rebalance")!;
      return { toolName: "rebalance", input: t.validate({ toPool: "C_B", amountUsdc: "10000000000" }), text: "Moving to B for +0.6%." };
    },
  };
  const d = await decide(llm, { pools, position, tolerance: "balanced" });
  expect(d.action).toBe("rebalance");
  expect(d.toPool).toBe("C_B");
  expect(d.amountUsdc).toBe(10000000000n);
  expect(d.rationale).toMatch(/B/);
});

it("returns hold when the llm produces no tool call", async () => {
  const llm: LlmClient = { async runToolLoop() { return { toolName: null, input: null, text: "Staying put." }; } };
  const d = await decide(llm, { pools, position, tolerance: "balanced" });
  expect(d.action).toBe("hold");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/agent.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/agent.ts`**

```ts
import { z } from "zod";
import type { ScoredPool, Position, Decision, RiskTolerance } from "./types.js";

export interface ToolDef { name: string; description: string; schema: object; validate: (raw: unknown) => any; }
export interface LlmClient {
  runToolLoop(system: string, user: string, tools: ToolDef[]):
    Promise<{ toolName: string | null; input: any; text: string }>;
}

const rebalanceInput = z.object({ toPool: z.string(), amountUsdc: z.coerce.bigint() });

export interface DecisionContext { pools: ScoredPool[]; position: Position; tolerance: RiskTolerance; }

export async function decide(llm: LlmClient, ctx: DecisionContext): Promise<Decision> {
  const tools: ToolDef[] = [{
    name: "rebalance",
    description: "Move the user's USDC from the current pool into a better eligible pool.",
    schema: { type: "object", properties: { toPool: { type: "string" }, amountUsdc: { type: "string", description: "amount in stroops (7 decimals)" } }, required: ["toPool", "amountUsdc"] },
    validate: (raw) => rebalanceInput.parse(raw),
  }];

  const system = [
    "You are an autonomous DeFi yield agent on Stellar.",
    "Only move funds into pools marked eligible. Prefer the highest apyBps among eligible pools.",
    "If the current pool is already the best eligible one, do NOT rebalance — just explain why.",
    `User risk tolerance: ${ctx.tolerance}.`,
  ].join(" ");
  const user = JSON.stringify({ position: { ...ctx.position, amountUsdc: ctx.position.amountUsdc.toString() },
    pools: ctx.pools.map((p) => ({ ...p, tvlUsdc: p.tvlUsdc.toString() })) });

  const r = await llm.runToolLoop(system, user, tools);
  if (r.toolName === "rebalance" && r.input) {
    return { action: "rebalance", toPool: r.input.toPool, amountUsdc: r.input.amountUsdc, rationale: r.text || "rebalance" };
  }
  return { action: "hold", rationale: r.text || "hold" };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/agent.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Implement the real `LlmClient` (Anthropic)**

Append to `src/agent.ts`:

```ts
import Anthropic from "@anthropic-ai/sdk";

export function createAnthropicLlm(apiKey: string, model: string): LlmClient {
  const client = new Anthropic({ apiKey });
  return {
    async runToolLoop(system, user, tools) {
      const msg = await client.messages.create({
        model, max_tokens: 1024, system,
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema as any })),
        messages: [{ role: "user", content: user }],
      });
      const toolUse = msg.content.find((c) => c.type === "tool_use") as any;
      const text = msg.content.filter((c) => c.type === "text").map((c: any) => c.text).join(" ").trim();
      if (toolUse) {
        const def = tools.find((t) => t.name === toolUse.name);
        return { toolName: toolUse.name, input: def ? def.validate(toolUse.input) : toolUse.input, text };
      }
      return { toolName: null, input: null, text };
    },
  };
}
```

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit` → Expected: no errors
```bash
git add src/agent.ts src/agent.test.ts && git commit -m "feat: claude tool-use agent decision"
```

---

## Task 10: Orchestrator (tick loop + guards)

**Files:**
- Create: `src/orchestrator.ts`, `src/orchestrator.test.ts`

- [ ] **Step 1: Write failing test `src/orchestrator.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { runTick, type TickDeps } from "./orchestrator.js";
import type { PoolYield } from "./types.js";

const pools: PoolYield[] = [
  { poolId: "C_A", name: "A", asset: "USDC", apyBps: 820, tvlUsdc: 100_000_0000000n, utilizationBps: 5000, oracleHealthy: true },
  { poolId: "C_B", name: "B", asset: "USDC", apyBps: 900, tvlUsdc: 100_000_0000000n, utilizationBps: 5000, oracleHealthy: true },
];

function deps(over: Partial<TickDeps> = {}): TickDeps {
  return {
    scan: vi.fn(async () => pools),
    tolerance: "balanced",
    getPosition: () => ({ poolId: "C_A", amountUsdc: 1000_0000000n }),
    decide: vi.fn(async () => ({ action: "rebalance", toPool: "C_B", amountUsdc: 1000_0000000n, rationale: "+0.8%" })),
    rebalance: vi.fn(async () => ({ hashes: ["h1", "h2"], success: true })),
    commitPosition: vi.fn(),
    log: vi.fn(),
    recordRebalance: vi.fn(),
    rebalancedSince: () => 0n,
    minYieldDeltaBps: 50, perTxCapStroops: 2000_0000000n, dailyCapStroops: 5000_0000000n,
    cooldownSec: 120, lastRebalanceAt: 0, now: 100000,
    ...over,
  };
}

describe("runTick guards", () => {
  it("executes rebalance when delta and caps pass", async () => {
    const d = deps();
    const r = await runTick(d);
    expect(d.rebalance).toHaveBeenCalledWith("C_A", "C_B", 1000_0000000n);
    expect(d.commitPosition).toHaveBeenCalledWith({ poolId: "C_B", amountUsdc: 1000_0000000n });
    expect(r.acted).toBe(true);
  });

  it("skips when yield delta below threshold", async () => {
    const d = deps({ decide: vi.fn(async () => ({ action: "rebalance", toPool: "C_B", amountUsdc: 1000_0000000n, rationale: "tiny" })) });
    // target 900 vs current 820 = 80bps; raise threshold above it
    d.minYieldDeltaBps = 100;
    const r = await runTick(d);
    expect(d.rebalance).not.toHaveBeenCalled();
    expect(r.acted).toBe(false);
  });

  it("skips during cooldown", async () => {
    const r = await runTick(deps({ lastRebalanceAt: 99950, now: 100000, cooldownSec: 120 }));
    expect(r.acted).toBe(false);
  });

  it("clamps amount to per-tx cap", async () => {
    const d = deps({ getPosition: () => ({ poolId: "C_A", amountUsdc: 10_000_0000000n }),
      decide: vi.fn(async () => ({ action: "rebalance", toPool: "C_B", amountUsdc: 10_000_0000000n, rationale: "big" })) });
    await runTick(d);
    expect(d.rebalance).toHaveBeenCalledWith("C_A", "C_B", 2000_0000000n);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/orchestrator.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/orchestrator.ts`**

```ts
import { scorePools, bestPool } from "./risk.js";
import type { PoolYield, Position, Decision, TxResult, RiskTolerance } from "./types.js";

export interface TickDeps {
  scan: () => Promise<PoolYield[]>;
  tolerance: RiskTolerance;
  getPosition: () => Position;
  decide: (ctx: { pools: any; position: Position; tolerance: RiskTolerance }) => Promise<Decision>;
  rebalance: (from: string, to: string, amount: bigint) => Promise<TxResult>;
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

  // Guard: cooldown
  if (d.now - d.lastRebalanceAt < d.cooldownSec) { d.log("skip", "cooldown active"); return { acted: false, reason: "cooldown" }; }

  // Guard: min yield delta (target eligible best vs current)
  const target = scored.find((p) => p.poolId === decision.toPool);
  const current = scored.find((p) => p.poolId === pos.poolId);
  const best = bestPool(scored);
  if (!target || !target.eligible) { d.log("skip", "target not eligible"); return { acted: false, reason: "ineligible-target" }; }
  const deltaBps = target.apyBps - (current?.apyBps ?? 0);
  if (deltaBps < d.minYieldDeltaBps) { d.log("skip", `delta ${deltaBps}bps < ${d.minYieldDeltaBps}`); return { acted: false, reason: "below-delta" }; }
  if (best && target.poolId !== best.poolId) { d.log("skip", "target not the best eligible"); return { acted: false, reason: "not-best" }; }

  // Guard: caps
  let amount = decision.amountUsdc ?? pos.amountUsdc;
  if (amount > d.perTxCapStroops) amount = d.perTxCapStroops;
  const dayAgo = d.now - 86400;
  if (d.rebalancedSince(dayAgo) + amount > d.dailyCapStroops) { d.log("skip", "daily cap reached"); return { acted: false, reason: "daily-cap" }; }
  if (!pos.poolId) { d.log("skip", "no source position"); return { acted: false, reason: "no-source" }; }

  const res = await d.rebalance(pos.poolId, target.poolId, amount);
  if (!res.success) { d.log("error", `rebalance failed: ${res.error}`, res); return { acted: false, reason: "tx-failed" }; }

  d.recordRebalance(amount);
  d.commitPosition({ poolId: target.poolId, amountUsdc: amount });
  d.log("rebalance", `moved ${amount} stroops ${pos.poolId}->${target.poolId} (+${deltaBps}bps): ${decision.rationale}`, { hashes: res.hashes });
  return { acted: true, reason: "rebalanced" };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/orchestrator.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/orchestrator.ts src/orchestrator.test.ts && git commit -m "feat: orchestrator tick + guards (delta, cooldown, caps)"
```

---

## Task 11: API (REST + SSE)

**Files:**
- Create: `src/api.ts`, `src/api.test.ts`

- [ ] **Step 1: Write failing test `src/api.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { createApi } from "./api.js";

const db = {
  getPosition: () => ({ poolId: "C_A", amountUsdc: 1000_0000000n }),
  recentLog: () => [{ ts: 1, kind: "scan", message: "scanned 2 pools", meta: null }],
};
const state = { lastScan: [{ poolId: "C_A", name: "A", apyBps: 820 }] };

describe("api", () => {
  it("GET /position returns position with string amount", async () => {
    const app = createApi(db as any, state as any);
    const res = await app.inject({ method: "GET", url: "/position" });
    expect(res.json()).toEqual({ poolId: "C_A", amountUsdc: "10000000000" });
  });
  it("GET /activity returns recent log", async () => {
    const app = createApi(db as any, state as any);
    const res = await app.inject({ method: "GET", url: "/activity" });
    expect(res.json()[0].message).toBe("scanned 2 pools");
  });
});
```

> Uses `app.inject` (Fastify-style). If staying with express, swap to `supertest`: `npm i -D supertest` and `request(app).get("/position")`. Pick one in Step 3 and keep the test consistent.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/api.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/api.ts`** (Fastify for built-in `inject` testability)

Run first: `npm i fastify`

```ts
import Fastify from "fastify";
import type { Db } from "./db.js";

export interface SharedState { lastScan: unknown[]; }

export function createApi(db: Db, state: SharedState) {
  const app = Fastify();
  app.get("/position", async () => {
    const p = db.getPosition();
    return { poolId: p.poolId, amountUsdc: p.amountUsdc.toString() };
  });
  app.get("/scan", async () => state.lastScan);
  app.get("/activity", async () => db.recentLog(50));
  // SSE feed for the future frontend.
  app.get("/events", (req, reply) => {
    reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const timer = setInterval(() => {
      reply.raw.write(`data: ${JSON.stringify({ position: { ...db.getPosition(), amountUsdc: db.getPosition().amountUsdc.toString() }, log: db.recentLog(5) })}\n\n`);
    }, 2000);
    req.raw.on("close", () => clearInterval(timer));
  });
  return app;
}
```

- [ ] **Step 4: Run to verify it passes + commit**

Run: `npx vitest run src/api.test.ts` → Expected: PASS
```bash
git add src/api.ts src/api.test.ts package.json && git commit -m "feat: rest + sse api"
```

---

## Task 12: Entrypoint wiring

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Implement `src/index.ts`**

```ts
import "dotenv/config";
import { Keypair } from "@stellar/stellar-sdk";
import { parseConfig } from "./config.js";
import { createDb } from "./db.js";
import { createBlendReader, scanYields } from "./scanner.js";
import { createSorobanClient, createExecutor } from "./executor.js";
import { createKeypairWallet } from "./wallet.js";
import { createAnthropicLlm } from "./agent.js";
import { decide } from "./agent.js";
import { runTick } from "./orchestrator.js";
import { createApi, type SharedState } from "./api.js";

async function main() {
  const cfg = parseConfig(process.env);
  const db = createDb("yieldseeker.sqlite");
  const reader = createBlendReader(cfg.rpcUrl, cfg.networkPassphrase);
  const wallet = createKeypairWallet(Keypair.fromSecret(cfg.agentSignerSecret), cfg.networkPassphrase); // swap to policy-signer wallet when ready
  const soroban = createSorobanClient({ rpcUrl: cfg.rpcUrl, networkPassphrase: cfg.networkPassphrase, walletAddress: cfg.smartWalletAddress, usdcId: cfg.usdcContractId });
  const executor = createExecutor(soroban, wallet);
  const llm = createAnthropicLlm(cfg.anthropicApiKey, cfg.anthropicModel);

  const state: SharedState = { lastScan: [] };
  let lastRebalanceAt = 0;
  let running = false;

  const api = createApi(db, state);
  await api.listen({ port: 8787 });
  console.log("API on http://localhost:8787");

  const loop = async () => {
    if (running) return; // idempotency: never overlap ticks (spec §8)
    running = true;
    try {
      const now = Math.floor(Date.now() / 1000);
      const r = await runTick({
        scan: async () => { const s = await scanYields(reader, cfg.blendPoolIds); state.lastScan = s as any; return s; },
        tolerance: cfg.tolerance,
        getPosition: () => db.getPosition(),
        decide: (ctx) => decide(llm, ctx as any),
        rebalance: (f, t, a) => executor.rebalance(f, t, a),
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
```

- [ ] **Step 2: Typecheck + smoke-run**

Run: `npx tsc --noEmit` → Expected: no errors
Run (with `.env` filled from Task 5/7): `npm run dev` → Expected: "API on http://localhost:8787", a `scan` log line appears; `curl localhost:8787/activity` returns the scan event.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts && git commit -m "feat: entrypoint wiring (loop + api)"
```

---

## Task 13: End-to-end testnet smoke test (gated)

**Files:**
- Create: `tests/smoke/testnet.smoke.test.ts`

> Requires `.env` with a funded `SMART_WALLET_ADDRESS`/`AGENT_SIGNER_SECRET` and two Blend testnet pools holding the wallet's USDC. Runs only when `RUN_TESTNET_SMOKE=1`.

- [ ] **Step 1: Fund the testnet wallet**

Run: fund the agent account via Friendbot: `curl "https://friendbot.stellar.org/?addr=<G_AGENT_PUBLIC>"`. Acquire testnet USDC (Blend/SDF testnet faucet or mint via the test USDC issuer) and supply an initial position into pool A (one-time, via `verify:blend`-style script or the running loop).

- [ ] **Step 2: Write `tests/smoke/testnet.smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import "dotenv/config";
import { parseConfig } from "../../src/config.js";
import { createSorobanClient, createExecutor } from "../../src/executor.js";
import { createKeypairWallet } from "../../src/wallet.js";
import { Keypair } from "@stellar/stellar-sdk";

const run = process.env.RUN_TESTNET_SMOKE === "1";
describe.skipIf(!run)("testnet smoke", () => {
  it("performs one real withdraw->deposit rebalance and returns 2 tx hashes", async () => {
    const cfg = parseConfig(process.env);
    const wallet = createKeypairWallet(Keypair.fromSecret(cfg.agentSignerSecret), cfg.networkPassphrase);
    const soroban = createSorobanClient({ rpcUrl: cfg.rpcUrl, networkPassphrase: cfg.networkPassphrase, walletAddress: cfg.smartWalletAddress, usdcId: cfg.usdcContractId });
    const exec = createExecutor(soroban, wallet);
    const [a, b] = cfg.blendPoolIds;
    const res = await exec.rebalance(a, b, 10_0000000n); // 10 USDC
    expect(res.success).toBe(true);
    expect(res.hashes).toHaveLength(2);
    console.log("tx hashes:", res.hashes);
  }, 120_000);
});
```

- [ ] **Step 3: Run the gated smoke test**

Run: `RUN_TESTNET_SMOKE=1 npx vitest run tests/smoke/testnet.smoke.test.ts`
Expected: PASS; prints 2 real testnet tx hashes (verify on stellar.expert testnet).

- [ ] **Step 4: Final full test run + commit**

Run: `npm test` → Expected: all unit tests PASS (smoke skipped without the flag)
```bash
git add tests/smoke/testnet.smoke.test.ts && git commit -m "test: gated testnet e2e rebalance smoke"
```

---

## Done criteria

- `npm test` green (unit, no network/secrets).
- `npm run dev` starts the loop + API; activity log shows scan→decision lines.
- Gated smoke test executes a real testnet rebalance and returns 2 tx hashes.
- Policy-signer wallet implemented (or keypair fallback with caps enforced in orchestrator + documented as the one production-upgrade item).
- API exposes `/position`, `/scan`, `/activity`, `/events` for the later frontend phase.
