# Multi-Yield-Source (read-side) + DeFindex Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Abstract yield sources behind a `YieldSource` interface so the scanner can read from multiple protocols, then add DeFindex (on-chain, read-only) as a second mainnet scan source alongside Blend.

**Architecture:** A `YieldSource` exposes `readPool(id) → PoolYield | null`. Blend is refactored behind `createBlendSource(blendReader)`; a new `createDefindexSource(blendReader, strategies, tvlReader?)` derives APY/utilization/oracle from each DeFindex strategy's underlying Blend pool and reads TVL on-chain from the strategy contract (with a config fallback). The scanner iterates sources and concatenates results. Execution stays on the testnet Blend pool — `executor`, `agent`, `orchestrator`, `discovery` are untouched. DeFindex is disabled by default (empty config ⇒ current behavior).

**Tech Stack:** TypeScript, Next.js, Vitest, `@stellar/stellar-sdk` (Soroban RPC `simulateTransaction` + `scValToNative`), `@blend-capital/blend-sdk`, Zod, better-sqlite3.

---

## Phase 1 — YieldSource abstraction (Blend behind the interface)

### Task 1: Introduce `YieldSource`, `scanSource`, `createBlendSource`; propagate `protocol`

This is one cohesive change: adding the required `protocol` field touches every `PoolYield`/`ScoredPool` producer and fixture, so they move together to keep the suite green.

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/scanner.ts`
- Modify: `src/lib/serialize.ts`
- Test (rewrite): `src/lib/scanner.test.ts`
- Test (fixture update): `src/lib/risk.test.ts`
- Test (fixture update): `src/lib/serialize.test.ts`

- [ ] **Step 1: Rewrite `src/lib/scanner.test.ts` (failing tests for the new API)**

```typescript
import { describe, it, expect } from "vitest";
import { scanSource, createBlendSource, type RawReserve, type BlendReader } from "./scanner";
import type { PoolYield, YieldSource } from "./types";

const fakeSource: YieldSource = {
  protocol: "test",
  async readPool(poolId) {
    const map: Record<string, PoolYield> = {
      C_A: { protocol: "test", poolId: "C_A", name: "A", asset: "USDC", apyBps: 860, tvlUsdc: 155_000_0000000n, utilizationBps: 6200, oracleHealthy: true },
    };
    return map[poolId] ?? null;
  },
};

describe("scanSource", () => {
  it("collects a PoolYield for each readable pool", async () => {
    const out = await scanSource(fakeSource, ["C_A"]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ protocol: "test", poolId: "C_A", apyBps: 860 });
  });

  it("skips pools that return null or throw", async () => {
    const flaky: YieldSource = {
      protocol: "test",
      async readPool(id) {
        if (id === "BAD") throw new Error("rpc");
        if (id === "NULL") return null;
        return fakeSource.readPool(id);
      },
    };
    const out = await scanSource(flaky, ["C_A", "BAD", "NULL"]);
    expect(out.map((p) => p.poolId)).toEqual(["C_A"]);
  });
});

const blendReader: BlendReader = {
  async readReserve(poolId: string): Promise<RawReserve> {
    const map: Record<string, RawReserve> = {
      C_A: { poolId: "C_A", name: "Fixed Pool", supplyApr: 0.086, totalSupplyUsdc: 155_000_0000000n, utilization: 0.62, oracleStale: false },
      C_B: { poolId: "C_B", name: "YBX Pool", supplyApr: 0.094, totalSupplyUsdc: 40_000_0000000n, utilization: 0.71, oracleStale: true },
    };
    return map[poolId];
  },
};

describe("createBlendSource", () => {
  it("maps a Blend reserve to a protocol-tagged PoolYield", async () => {
    const src = createBlendSource(blendReader);
    expect(src.protocol).toBe("blend");
    expect(await src.readPool("C_A")).toMatchObject({
      protocol: "blend", poolId: "C_A", apyBps: 860, oracleHealthy: true, utilizationBps: 6200, tvlUsdc: 155_000_0000000n,
    });
    expect(await src.readPool("C_B")).toMatchObject({ protocol: "blend", poolId: "C_B", apyBps: 940, oracleHealthy: false });
  });
});
```

- [ ] **Step 2: Run the scanner test to confirm it fails**

Run: `npx vitest run src/lib/scanner.test.ts`
Expected: FAIL — `scanSource` / `createBlendSource` / `YieldSource` are not exported yet.

- [ ] **Step 3: Add `protocol` + `YieldSource` to `src/lib/types.ts`**

Change the `PoolYield` interface (add the first field) and append `YieldSource`:

```typescript
export interface PoolYield {
  protocol: string;        // yield source protocol, e.g. "blend" | "defindex"
  poolId: string;          // pool / strategy contract id
  name: string;
  asset: "USDC";
  apyBps: number;          // total supply APY in basis points (e.g. 860 = 8.6%)
  tvlUsdc: bigint;         // USDC TVL in stroops (7 decimals)
  utilizationBps: number;  // 0..10000
  oracleHealthy: boolean;  // false => flagged risky
}

/** One protocol's adapter: reads a pool/strategy id into a normalized PoolYield. */
export interface YieldSource {
  readonly protocol: string;
  readPool(poolId: string): Promise<PoolYield | null>;
}
```

- [ ] **Step 4: Replace `scanYields` with `scanSource` + `createBlendSource` in `src/lib/scanner.ts`**

Update the import on line 3 and replace the `scanYields` function (lines 18-37) with the two new exports. Keep `RawReserve`, `BlendReader`, and `createBlendReader` exactly as they are.

```typescript
// line 3 — import YieldSource alongside PoolYield
import type { PoolYield, YieldSource } from "./types";
```

```typescript
// replace the old `scanYields` function with:
export async function scanSource(source: YieldSource, poolIds: string[]): Promise<PoolYield[]> {
  const out: PoolYield[] = [];
  for (const id of poolIds) {
    try {
      const py = await source.readPool(id);
      if (py) out.push(py);
    } catch {
      // Skip unreadable pool; orchestrator logs the gap.
    }
  }
  return out;
}

/** Wrap a Blend reserve reader as a YieldSource (maps RawReserve -> PoolYield). */
export function createBlendSource(reader: BlendReader): YieldSource {
  return {
    protocol: "blend",
    async readPool(poolId: string): Promise<PoolYield | null> {
      const r = await reader.readReserve(poolId);
      if (!r) return null;
      return {
        protocol: "blend",
        poolId: r.poolId,
        name: r.name,
        asset: "USDC",
        apyBps: Math.round(r.supplyApr * 10000),
        tvlUsdc: r.totalSupplyUsdc,
        utilizationBps: Math.round(r.utilization * 10000),
        oracleHealthy: !r.oracleStale,
      };
    },
  };
}
```

- [ ] **Step 5: Add `protocol` to the serialized shape in `src/lib/serialize.ts`**

`serializeScoredPool` already spreads `...p`, so `protocol` flows through at runtime; just declare it on the interface (add as the first field of `SerializedScoredPool`):

```typescript
export interface SerializedScoredPool {
  protocol: string;
  poolId: string;
  name: string;
  asset: "USDC";
  apyBps: number;
  tvlUsdc: string;
  utilizationBps: number;
  oracleHealthy: boolean;
  riskScore: number;
  eligible: boolean;
  reason?: string;
}
```

- [ ] **Step 6: Update the `risk.test.ts` fixture to include `protocol`**

In `src/lib/risk.test.ts`, add `protocol: "blend",` as the first field of the `base` object (line 5-8):

```typescript
const base: PoolYield = {
  protocol: "blend",
  poolId: "P", name: "x", asset: "USDC",
  apyBps: 800, tvlUsdc: 100_000_0000000n, utilizationBps: 5000, oracleHealthy: true,
};
```

- [ ] **Step 7: Update the `serialize.test.ts` fixtures + expectations to include `protocol`**

In `src/lib/serialize.test.ts`, add `protocol: "blend",` as the first field of both `scored[]` input objects AND both expected output objects (the `toEqual` arg). Each of the four objects (2 input ScoredPool, 2 expected SerializedScoredPool) gets `protocol: "blend",` prepended. Example for the first input object:

```typescript
{
  protocol: "blend",
  poolId: "C_A", name: "A", asset: "USDC", apyBps: 820, tvlUsdc: 100_000_0000000n,
  utilizationBps: 5000, oracleHealthy: true, riskScore: 35, eligible: true,
},
```

And the matching expected object:

```typescript
{
  protocol: "blend",
  poolId: "C_A", name: "A", asset: "USDC", apyBps: 820, tvlUsdc: "1000000000000",
  utilizationBps: 5000, oracleHealthy: true, riskScore: 35, eligible: true,
},
```

(Apply the same `protocol: "blend",` addition to the `C_B` input and `C_B` expected objects.)

- [ ] **Step 8: Run the full test suite to verify green**

Run: `npx vitest run`
Expected: PASS — all suites, including the rewritten `scanner.test.ts` and updated `risk`/`serialize` fixtures.

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If `runtime.ts` errors because `scanYields` is gone, that is fixed in Task 2 — but `tsc` will flag it now; proceed to Task 2 before committing if so.)

- [ ] **Step 10: Commit**

```bash
git add src/lib/types.ts src/lib/scanner.ts src/lib/serialize.ts src/lib/scanner.test.ts src/lib/risk.test.ts src/lib/serialize.test.ts
git commit -m "refactor: introduce YieldSource abstraction; Blend behind createBlendSource"
```

> Note: if `tsc` in Step 9 flagged `runtime.ts`, stage it together with Task 2's change and commit once after Task 2 to keep history clean. Otherwise commit here.

### Task 2: Wire runtime to scan via `blendSource` + `scanSource`

**Files:**
- Modify: `src/lib/runtime.ts`

- [ ] **Step 1: Update imports (lines 4-5 area)**

Replace the scanner import line:

```typescript
// before:
// import { createBlendReader, scanYields, type BlendReader } from "./scanner";
// after:
import { createBlendReader, createBlendSource, scanSource } from "./scanner";
```

And add `YieldSource` to the type import from `./types` (line 17):

```typescript
import type { Position, ScoredPool, Decision, YieldSource } from "./types";
```

- [ ] **Step 2: Swap the `reader` field for `blendSource` on the `Runtime` interface**

In the `Runtime` interface (around line 39), replace `reader: BlendReader;` with:

```typescript
  blendSource: YieldSource;
```

- [ ] **Step 3: Build the source in `getRuntime` and store it**

Around line 85, after `const reader = createBlendReader(...)`, add the source; then in the `runtime = { ... }` literal (around line 111) replace `reader,` with `blendSource,`:

```typescript
const reader = createBlendReader(cfg.scanRpcUrl, cfg.scanNetworkPassphrase, cfg.scanUsdcContractId);
const blendSource = createBlendSource(reader);
```

```typescript
// in the runtime object literal, replace `reader,` with:
    blendSource,
```

- [ ] **Step 4: Use `scanSource` in the tick (around line 134-135)**

```typescript
// before:
//   const poolIds = rt.poolIds && rt.poolIds.length ? rt.poolIds : rt.cfg.scanBlendPoolIds;
//   const s = await scanYields(rt.reader, poolIds);
// after:
        const poolIds = rt.poolIds && rt.poolIds.length ? rt.poolIds : rt.cfg.scanBlendPoolIds;
        const s = await scanSource(rt.blendSource, poolIds);
```

- [ ] **Step 5: Typecheck + test**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass (runtime has no unit test; behavior is unchanged).

- [ ] **Step 6: Commit**

```bash
git add src/lib/runtime.ts
git commit -m "refactor: runtime scans via blendSource/scanSource"
```

---

## Phase 2 — DeFindex on-chain scan source

### Task 3: Add optional `SCAN_DEFINDEX_STRATEGIES` config

**Files:**
- Modify: `src/lib/config.ts`
- Test: `src/lib/config.test.ts`

- [ ] **Step 1: Add failing config tests to `src/lib/config.test.ts`**

Append inside the `describe("parseConfig")` block:

```typescript
  it("defaults DeFindex strategies to an empty list when omitted", () => {
    const c = parseConfig(env);
    expect(c.scanDefindexStrategies).toEqual([]);
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
```

- [ ] **Step 2: Run config tests to confirm failure**

Run: `npx vitest run src/lib/config.test.ts`
Expected: FAIL — `scanDefindexStrategies` is undefined.

- [ ] **Step 3: Implement the config field in `src/lib/config.ts`**

Add the schema key inside `Schema` (after `SCAN_BACKSTOP_ID`, line 19):

```typescript
  // DeFindex (mainnet, scan-only). JSON array; empty/omitted => disabled.
  SCAN_DEFINDEX_STRATEGIES: z.string().default("[]"),
```

Add the strategy item schema + type near the top (after the `Schema` definition, before `toStroops`):

```typescript
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
```

Inside `parseConfig`, after `const e = Schema.parse(env);`, parse the strategies, and add the field to the returned object (next to the other `scan*` fields):

```typescript
  const defindexStrategies = z
    .array(DefindexStrategySchema)
    .parse(JSON.parse(e.SCAN_DEFINDEX_STRATEGIES))
    .map((s) => ({
      strategyId: s.strategyId,
      blendPoolId: s.blendPoolId,
      name: s.name,
      fallbackTvlUsdc: toStroops(s.fallbackTvlUsdc),
    }));
```

```typescript
    // in the returned object, alongside scanBackstopId:
    scanDefindexStrategies: defindexStrategies,
```

- [ ] **Step 4: Run config tests to verify green**

Run: `npx vitest run src/lib/config.test.ts`
Expected: PASS (including the existing 4 tests — the default `"[]"` keeps the no-DeFindex env working).

- [ ] **Step 5: Commit**

```bash
git add src/lib/config.ts src/lib/config.test.ts
git commit -m "feat: optional SCAN_DEFINDEX_STRATEGIES config (scan-only)"
```

### Task 4: Spike — confirm the DeFindex strategy's on-chain TVL getter

Resolves the one unknown: the exact read-only getter on the DeFindex USDC strategy contract that returns total managed USDC, and which Blend pool it autocompounds into. Mirrors the existing `scripts/verify-*.ts` spikes.

**Files:**
- Create: `scripts/verify-defindex-strategy.ts`

- [ ] **Step 1: Write the probe script**

```typescript
// Usage: npx tsx scripts/verify-defindex-strategy.ts
// Probes the DeFindex USDC fixed-pool strategy on Stellar mainnet for a
// no-arg, read-only getter returning total managed funds (i128 stroops).
import { rpc, Contract, Account, TransactionBuilder, BASE_FEE, scValToNative } from "@stellar/stellar-sdk";

const RPC_URL = "https://mainnet.sorobanrpc.com";
const PASSPHRASE = "Public Global Stellar Network ; September 2015";
// DeFindex USDC fixed-pool strategy (re-validate against paltalabs/defindex mainnet.contracts.json)
const STRATEGY_ID = "CDB2WMKQQNVZMEBY7Q7GZ5C7E7IAFSNMZ7GGVD6WKTCEWK7XOIAVZSAP";
// Null account is a valid source for read-only simulation (no funding needed).
const NULL_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const CANDIDATES = ["fetch_total_managed_funds", "total_managed_funds", "total_assets", "total_supply", "balance"];

const server = new rpc.Server(RPC_URL);

async function tryGetter(fn: string) {
  try {
    const contract = new Contract(STRATEGY_ID);
    const tx = new TransactionBuilder(new Account(NULL_ACCOUNT, "0"), { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
      .addOperation(contract.call(fn))
      .setTimeout(30)
      .build();
    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) return `ERROR: ${sim.error}`;
    return `OK -> ${JSON.stringify(scValToNative(sim.result!.retval), (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`;
  } catch (e) {
    return `THROW: ${(e as Error).message}`;
  }
}

(async () => {
  console.log(`Strategy: ${STRATEGY_ID}`);
  for (const fn of CANDIDATES) console.log(`  ${fn}(): ${await tryGetter(fn)}`);
})();
```

- [ ] **Step 2: Run the spike**

Run: `npx tsx scripts/verify-defindex-strategy.ts`
Expected: one of the candidates prints `OK -> <number>`. Record **which getter** returned the TVL and its scale (stroops vs whole USDC). If none return a no-arg total (e.g. only `balance` works and needs an address), record that — Task 6 will then keep the config fallback and note the limitation.

- [ ] **Step 3: Record the finding**

Note the confirmed getter name in a one-line comment at the top of `scripts/verify-defindex-strategy.ts` (e.g. `// CONFIRMED 2026-06-03: fetch_total_managed_funds() -> i128 stroops`). Task 6 uses this name.

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-defindex-strategy.ts
git commit -m "chore: spike to confirm DeFindex strategy TVL getter"
```

### Task 5: `createDefindexSource` (APY/util/oracle from Blend, TVL via reader/fallback)

**Files:**
- Create: `src/lib/defindex.ts`
- Test: `src/lib/defindex.test.ts`

- [ ] **Step 1: Write failing tests in `src/lib/defindex.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { createDefindexSource, type StrategyTvlReader } from "./defindex";
import type { BlendReader, RawReserve } from "./scanner";
import type { DefindexStrategyConfig } from "./config";

const blendReader: BlendReader = {
  async readReserve(poolId: string): Promise<RawReserve> {
    return { poolId, name: "Blend Fixed", supplyApr: 0.086, totalSupplyUsdc: 155_000_0000000n, utilization: 0.62, oracleStale: false };
  },
};
const strategies: DefindexStrategyConfig[] = [
  { strategyId: "C_STRAT_USDC", blendPoolId: "C_BLEND_FIXED", name: "DeFindex USDC · Blend Fixed", fallbackTvlUsdc: 1_000_0000000n },
];

describe("createDefindexSource", () => {
  it("derives APY/utilization/oracle from the underlying Blend pool, tagged defindex", async () => {
    const src = createDefindexSource(blendReader, strategies);
    expect(src.protocol).toBe("defindex");
    expect(await src.readPool("C_STRAT_USDC")).toMatchObject({
      protocol: "defindex", poolId: "C_STRAT_USDC", name: "DeFindex USDC · Blend Fixed",
      apyBps: 860, utilizationBps: 6200, oracleHealthy: true,
    });
  });

  it("uses configured fallback TVL when no on-chain reader is provided", async () => {
    const src = createDefindexSource(blendReader, strategies);
    expect((await src.readPool("C_STRAT_USDC"))?.tvlUsdc).toBe(1_000_0000000n);
  });

  it("prefers live on-chain strategy TVL when a reader returns a value", async () => {
    const tvlReader: StrategyTvlReader = { async readTotalManagedFunds() { return 7_500_0000000n; } };
    const src = createDefindexSource(blendReader, strategies, tvlReader);
    expect((await src.readPool("C_STRAT_USDC"))?.tvlUsdc).toBe(7_500_0000000n);
  });

  it("falls back to config TVL when the on-chain reader returns null or throws", async () => {
    const nullReader: StrategyTvlReader = { async readTotalManagedFunds() { return null; } };
    const throwReader: StrategyTvlReader = { async readTotalManagedFunds() { throw new Error("rpc"); } };
    expect((await createDefindexSource(blendReader, strategies, nullReader).readPool("C_STRAT_USDC"))?.tvlUsdc).toBe(1_000_0000000n);
    expect((await createDefindexSource(blendReader, strategies, throwReader).readPool("C_STRAT_USDC"))?.tvlUsdc).toBe(1_000_0000000n);
  });

  it("returns null for an unknown strategy id", async () => {
    const src = createDefindexSource(blendReader, strategies);
    expect(await src.readPool("C_UNKNOWN")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run src/lib/defindex.test.ts`
Expected: FAIL — `./defindex` does not exist.

- [ ] **Step 3: Implement `src/lib/defindex.ts`**

```typescript
import type { PoolYield, YieldSource } from "./types";
import type { BlendReader } from "./scanner";
import type { DefindexStrategyConfig } from "./config";

/** Reads a DeFindex strategy's total managed USDC (stroops) on-chain. */
export interface StrategyTvlReader {
  readTotalManagedFunds(strategyId: string): Promise<bigint | null>;
}

/**
 * DeFindex as a scan-only YieldSource. Each strategy autocompounds into a Blend
 * fixed pool, so APY / utilization / oracle health are read from that underlying
 * Blend pool (cfg.blendPoolId). TVL is read on-chain from the strategy when a
 * StrategyTvlReader is supplied, otherwise the configured fallback is used.
 */
export function createDefindexSource(
  blendReader: BlendReader,
  strategies: DefindexStrategyConfig[],
  tvlReader?: StrategyTvlReader,
): YieldSource {
  const byId = new Map(strategies.map((s) => [s.strategyId, s]));
  return {
    protocol: "defindex",
    async readPool(strategyId: string): Promise<PoolYield | null> {
      const cfg = byId.get(strategyId);
      if (!cfg) return null;

      const r = await blendReader.readReserve(cfg.blendPoolId);
      if (!r) return null;

      let tvlUsdc = cfg.fallbackTvlUsdc;
      if (tvlReader) {
        try {
          const live = await tvlReader.readTotalManagedFunds(strategyId);
          if (live !== null) tvlUsdc = live;
        } catch {
          // keep fallback TVL
        }
      }

      return {
        protocol: "defindex",
        poolId: strategyId,
        name: cfg.name,
        asset: "USDC",
        apyBps: Math.round(r.supplyApr * 10000),
        tvlUsdc,
        utilizationBps: Math.round(r.utilization * 10000),
        oracleHealthy: !r.oracleStale,
      };
    },
  };
}
```

- [ ] **Step 4: Run to verify green**

Run: `npx vitest run src/lib/defindex.test.ts`
Expected: PASS (6 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/defindex.ts src/lib/defindex.test.ts
git commit -m "feat: createDefindexSource (scan-only, APY from underlying Blend pool)"
```

### Task 6: On-chain strategy TVL reader + wire DeFindex into runtime + docs

**Files:**
- Modify: `src/lib/defindex.ts` (add `createDefindexStrategyTvlReader`)
- Modify: `src/lib/runtime.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add the on-chain TVL reader to `src/lib/defindex.ts`**

Use the getter confirmed in Task 4. If Task 4 found no no-arg total getter, leave `tvlReader` unused in Step 3 (DeFindex still works on config fallback TVL) and skip this step's wiring of the reader.

```typescript
import { rpc, Contract, Account, TransactionBuilder, BASE_FEE, scValToNative } from "@stellar/stellar-sdk";

// Valid null source account for read-only simulation (no funding required).
const SIM_SOURCE = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

export function createDefindexStrategyTvlReader(opts: {
  rpcUrl: string;
  networkPassphrase: string;
  /** Getter confirmed by scripts/verify-defindex-strategy.ts (Task 4). */
  getter: string;
}): StrategyTvlReader {
  const server = new rpc.Server(opts.rpcUrl, { allowHttp: opts.rpcUrl.startsWith("http://") });
  return {
    async readTotalManagedFunds(strategyId: string): Promise<bigint | null> {
      const contract = new Contract(strategyId);
      const tx = new TransactionBuilder(new Account(SIM_SOURCE, "0"), {
        fee: BASE_FEE,
        networkPassphrase: opts.networkPassphrase,
      })
        .addOperation(contract.call(opts.getter))
        .setTimeout(30)
        .build();
      const sim = await server.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(sim) || !sim.result) return null;
      const val = scValToNative(sim.result.retval);
      return typeof val === "bigint" ? val : null;
    },
  };
}
```

- [ ] **Step 2: Add a unit test for the reader's decode/fallback contract**

Append to `src/lib/defindex.test.ts` — this verifies the source consumes the reader correctly (the RPC itself is exercised by the Task 4 spike, not mocked here):

```typescript
import { createDefindexStrategyTvlReader } from "./defindex";

describe("createDefindexStrategyTvlReader", () => {
  it("constructs a reader exposing readTotalManagedFunds", () => {
    const reader = createDefindexStrategyTvlReader({
      rpcUrl: "https://mainnet.sorobanrpc.com",
      networkPassphrase: "Public Global Stellar Network ; September 2015",
      getter: "fetch_total_managed_funds",
    });
    expect(typeof reader.readTotalManagedFunds).toBe("function");
  });
});
```

Run: `npx vitest run src/lib/defindex.test.ts` → Expected: PASS.

- [ ] **Step 3: Wire DeFindex into `src/lib/runtime.ts`**

Add the import (line 6 area):

```typescript
import { createDefindexSource, createDefindexStrategyTvlReader } from "./defindex";
```

Add to the `Runtime` interface (near `blendSource`):

```typescript
  defindexSource: YieldSource | null;
```

In `getRuntime`, after `const blendSource = createBlendSource(reader);`, build the DeFindex source (replace `"fetch_total_managed_funds"` with the Task 4 getter):

```typescript
  const defindexSource = cfg.scanDefindexStrategies.length
    ? createDefindexSource(
        reader,
        cfg.scanDefindexStrategies,
        createDefindexStrategyTvlReader({
          rpcUrl: cfg.scanRpcUrl,
          networkPassphrase: cfg.scanNetworkPassphrase,
          getter: "fetch_total_managed_funds",
        }),
      )
    : null;
```

Add `defindexSource,` to the `runtime = { ... }` object literal (next to `blendSource,`).

In the tick scan (after `const s = await scanSource(rt.blendSource, poolIds);`), append DeFindex rows:

```typescript
        const s = await scanSource(rt.blendSource, poolIds);
        if (rt.defindexSource) {
          const dfx = await scanSource(
            rt.defindexSource,
            rt.cfg.scanDefindexStrategies.map((x) => x.strategyId),
          );
          s.push(...dfx);
        }
```

- [ ] **Step 4: Document the env var in `.env.example`**

Append (re-validate ids against `paltalabs/defindex` `public/mainnet.contracts.json` and the strategy's actual underlying Blend pool found in Task 4):

```bash
# DeFindex (mainnet, scan-only) — optional. JSON array; empty/omitted = disabled.
# APY/utilization/oracle come from the underlying Blend pool (blendPoolId);
# TVL is read on-chain from the strategy, falling back to fallbackTvlUsdc.
SCAN_DEFINDEX_STRATEGIES=[{"strategyId":"CDB2WMKQQNVZMEBY7Q7GZ5C7E7IAFSNMZ7GGVD6WKTCEWK7XOIAVZSAP","blendPoolId":"CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD","name":"DeFindex USDC · Blend Fixed","fallbackTvlUsdc":0}]
```

- [ ] **Step 5: Typecheck + full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all suites pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/defindex.ts src/lib/defindex.test.ts src/lib/runtime.ts .env.example
git commit -m "feat: wire DeFindex scan source into runtime (on-chain TVL + fallback)"
```

- [ ] **Step 7 (optional manual verification): run the app and confirm a DeFindex row appears**

Set `SCAN_DEFINDEX_STRATEGIES` in `.env` (using the Task 4-verified ids), start the app, and confirm `/api/scan` returns a row with `protocol: "defindex"` and a sensible APY. Falls back silently to Blend-only if DeFindex RPC reads fail.

---

## Self-Review

**Spec coverage:**
- §3 `YieldSource` interface → Task 1 (types.ts) ✓
- §4 scanner refactor (`scanSource`, `createBlendSource`) → Task 1 ✓
- §4 `defindex.ts` new source → Tasks 4-6 ✓
- §4 config `SCAN_DEFINDEX_STRATEGIES` → Task 3 ✓
- §4 runtime wiring (two sources merged) → Tasks 2, 6 ✓
- §5 `PoolYield.protocol` + serialize propagation → Task 1 (Steps 3, 5-7) ✓
- §6 data flow (scan both → scorePools → execute testnet unchanged) → Task 6 Step 3 ✓
- §8 risk fairness → resolved by design (utilization from underlying Blend); `risk.ts` untouched, per 2026-06-03 spec update ✓
- §9 error handling (skip unreadable, DeFindex isolated) → Task 1 `scanSource` try/catch + Task 5 fallback ✓
- §10 tests → Tasks 1, 3, 5, 6 ✓
- §11 spike (strategy getter) → Task 4 ✓; SDK-API rejected (documented) ✓

**Placeholder scan:** No "TBD"/"add error handling" placeholders. The one external unknown (strategy getter name) is resolved by the Task 4 spike and defaults to `fetch_total_managed_funds` with graceful null-fallback, so the code compiles and degrades safely even if the spike revises it.

**Type consistency:** `YieldSource.readPool → PoolYield | null` used identically in Tasks 1/5/6. `DefindexStrategyConfig` (Task 3) consumed unchanged in Task 5/6. `StrategyTvlReader.readTotalManagedFunds(strategyId) → bigint | null` consistent across Tasks 5/6. `createBlendSource(reader)` / `createDefindexSource(blendReader, strategies, tvlReader?)` signatures match their call sites in `runtime.ts`.

**Untouched (verified):** `agent.ts`, `orchestrator.ts`, `executor.ts`, `wallet.ts`, `discovery.ts`, DB schema, frontend — no task modifies them.
