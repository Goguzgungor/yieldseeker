/**
 * Per-user smart-account registry (ARMA model) — async, MongoDB-backed.
 *
 * Maps each owner (G-address) → their deployed OZ SmartAccount + the agent's two
 * context-rule ids, plus each smart wallet's current position. The agent loop
 * reads this to supply every registered user's idle USDC.
 *
 * WHY Mongo (was in-memory `globalThis`): on Vercel the agent tick (a daily
 * Cron) runs in a DIFFERENT function instance than the one that handled a user's
 * `/api/register`, so an in-process map would be invisible to the loop — the
 * agent could never act on a user. A shared external store fixes that and lets
 * "every user can try the flow at least once" actually hold. The demo "Reset"
 * affordance still works (it clears the collections).
 *
 * `createMemoryRegistry()` (used when MONGODB_URI is unset, i.e. the test suite)
 * keeps the old globalThis behavior so unit tests stay offline + deterministic.
 */
import type { Position, UserRegistration } from "./types";
import { getCollection } from "./mongo";

interface UserDoc extends UserRegistration {
  _id: string; // === owner
}
interface PositionDoc {
  _id: string; // === smartWallet
  poolId: string | null;
  amount: string; // decimal stroops (Mongo has no native BigInt)
}

export interface Registry {
  registerUser(u: UserRegistration): Promise<void>;
  listUsers(): Promise<UserRegistration[]>;
  getUser(owner: string): Promise<UserRegistration | null>;
  removeUser(owner: string): Promise<boolean>;
  setUserPosition(smartWallet: string, p: Position): Promise<void>;
  getUserPosition(smartWallet: string): Promise<Position>;
  clearRegistry(): Promise<number>;
  userCount(): Promise<number>;
  registryStoreId(): string;
}

const idleUser = (): Position => ({ poolId: null, amountUsdc: 0n });

// ── Mongo implementation ──────────────────────────────────────────────────────

function createMongoRegistry(): Registry {
  return {
    async registerUser(u) {
      const coll = await getCollection<UserDoc>("users");
      // Upsert by owner; re-registering replaces wallet + rule ids in place.
      await coll.updateOne(
        { _id: u.owner },
        {
          $set: {
            owner: u.owner,
            smartWallet: u.smartWallet,
            poolRuleId: u.poolRuleId,
            usdcRuleId: u.usdcRuleId,
            createdAt: u.createdAt,
          },
        },
        { upsert: true },
      );
    },
    async listUsers() {
      const coll = await getCollection<UserDoc>("users");
      const rows = await coll
        .find({}, { projection: { _id: 0 } })
        .sort({ createdAt: 1, owner: 1 })
        .toArray();
      return rows as UserRegistration[];
    },
    async getUser(owner) {
      const coll = await getCollection<UserDoc>("users");
      const row = await coll.findOne({ _id: owner }, { projection: { _id: 0 } });
      return (row as UserRegistration | null) ?? null;
    },
    async removeUser(owner) {
      const users = await getCollection<UserDoc>("users");
      const u = await users.findOne({ _id: owner });
      if (!u) return false;
      await users.deleteOne({ _id: owner });
      const positions = await getCollection<PositionDoc>("positions");
      await positions.deleteOne({ _id: u.smartWallet });
      return true;
    },
    async setUserPosition(smartWallet, p) {
      const coll = await getCollection<PositionDoc>("positions");
      await coll.updateOne(
        { _id: smartWallet },
        { $set: { poolId: p.poolId, amount: p.amountUsdc.toString() } },
        { upsert: true },
      );
    },
    async getUserPosition(smartWallet) {
      const coll = await getCollection<PositionDoc>("positions");
      const row = await coll.findOne({ _id: smartWallet });
      if (!row) return idleUser();
      return { poolId: row.poolId, amountUsdc: BigInt(row.amount) };
    },
    async clearRegistry() {
      const users = await getCollection<UserDoc>("users");
      const removed = await users.countDocuments({});
      await users.deleteMany({});
      const positions = await getCollection<PositionDoc>("positions");
      await positions.deleteMany({});
      return removed;
    },
    async userCount() {
      const coll = await getCollection<UserDoc>("users");
      return coll.countDocuments({});
    },
    registryStoreId() {
      return "mongo:yieldseeker";
    },
  };
}

// ── In-memory implementation (tests / no MONGODB_URI) ─────────────────────────

interface MemoryStore {
  users: Map<string, UserRegistration>;
  positions: Map<string, Position>;
  id?: string;
}
function memStore(): MemoryStore {
  const g = globalThis as unknown as { __ysRegistry?: MemoryStore };
  return (g.__ysRegistry ??= { users: new Map(), positions: new Map() });
}

export function createMemoryRegistry(): Registry {
  return {
    async registerUser(u) {
      memStore().users.set(u.owner, { ...u });
    },
    async listUsers() {
      return [...memStore().users.values()].sort(
        (a, b) => a.createdAt - b.createdAt || a.owner.localeCompare(b.owner),
      );
    },
    async getUser(owner) {
      return memStore().users.get(owner) ?? null;
    },
    async removeUser(owner) {
      const s = memStore();
      const u = s.users.get(owner);
      if (!u) return false;
      s.users.delete(owner);
      s.positions.delete(u.smartWallet);
      return true;
    },
    async setUserPosition(smartWallet, p) {
      memStore().positions.set(smartWallet, { ...p });
    },
    async getUserPosition(smartWallet) {
      return memStore().positions.get(smartWallet) ?? idleUser();
    },
    async clearRegistry() {
      const s = memStore();
      const removed = s.users.size;
      s.users.clear();
      s.positions.clear();
      return removed;
    },
    async userCount() {
      return memStore().users.size;
    },
    registryStoreId() {
      const s = memStore();
      if (!s.id) s.id = `${process.pid}:${Math.random().toString(36).slice(2, 10)}`;
      return s.id;
    },
  };
}

// ── Module-level singleton + delegating API ───────────────────────────────────
// runtime.ts uses `import * as registry`, so we keep the flat function surface
// and pick the implementation once (Mongo when configured, else in-memory).

let impl: Registry | null = null;
function reg(): Registry {
  return (impl ??= process.env.MONGODB_URI ? createMongoRegistry() : createMemoryRegistry());
}

export const registerUser = (u: UserRegistration) => reg().registerUser(u);
export const listUsers = () => reg().listUsers();
export const getUser = (owner: string) => reg().getUser(owner);
export const removeUser = (owner: string) => reg().removeUser(owner);
export const setUserPosition = (smartWallet: string, p: Position) =>
  reg().setUserPosition(smartWallet, p);
export const getUserPosition = (smartWallet: string) => reg().getUserPosition(smartWallet);
export const clearRegistry = () => reg().clearRegistry();
export const userCount = () => reg().userCount();
export const registryStoreId = () => reg().registryStoreId();
