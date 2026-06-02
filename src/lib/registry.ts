/**
 * In-memory, DEMO-RESETTABLE per-user registry (ARMA model).
 *
 * The per-user smart-account registry + per-user positions used to live in
 * SQLite (`users` / `positions` tables). For the demo we want them IN-MEMORY so
 * every server restart — and the explicit reset affordance — re-shows the
 * Freighter onboarding instead of remembering past runs.
 *
 * WHY `globalThis` (and not a module-level singleton):
 *   In this Next.js setup the instrumentation loop (`src/instrumentation.ts` →
 *   `startLoop`) and the route handlers (`/api/register`, `/api/users`, …) can
 *   resolve SEPARATE in-memory instances of the same module — that is exactly
 *   the bug that forced the scan/decision KV cache into SQLite. A value stashed
 *   on `globalThis`, however, is shared across all module instances WITHIN one
 *   Node process, so the loop and the routes see the same registry. It does NOT
 *   persist across server restarts, which is precisely the demo behavior we want
 *   (fresh process ⇒ empty registry ⇒ onboarding shows again).
 *
 * If — and only if — `globalThis` sharing turned out NOT to hold here (the loop
 * couldn't see a route-written registration), the documented fallback is a
 * SQLite table cleared on server startup (ephemeral DB → still resets per demo).
 * See `verifyRegistryGlobalSharing()` + the report for which path is in use.
 */
import type { Position, UserRegistration } from "./types";

/** Shape of the process-wide registry stash. */
interface RegistryStore {
  /** owner G-address → registration. */
  users: Map<string, UserRegistration>;
  /** smart wallet C-address → position. */
  positions: Map<string, Position>;
}

/**
 * The single process-wide store, created lazily on `globalThis` so it is shared
 * between the instrumentation loop and the route handlers (see the file header).
 * Using `??=` means the first module instance to touch it creates the Maps and
 * every later instance reuses the SAME object.
 */
function store(): RegistryStore {
  const g = globalThis as unknown as { __ysRegistry?: RegistryStore };
  return (g.__ysRegistry ??= { users: new Map(), positions: new Map() });
}

// ── Users ────────────────────────────────────────────────────────────────────

/**
 * Register (or upsert) a user's smart account + agent context-rule ids. `owner`
 * is the key, so re-registering the same owner replaces its row in place. The
 * insertion ORDER is preserved (Map keeps insertion order), which gives a stable
 * loop order; re-registering an existing owner keeps its original position.
 */
export function registerUser(u: UserRegistration): void {
  store().users.set(u.owner, { ...u });
}

/**
 * All registered users, oldest first. Maps preserve insertion order, but a
 * re-registered owner keeps its slot, so we additionally sort by `createdAt`
 * (then owner) to stay deterministic — matching the previous SQLite ordering.
 */
export function listUsers(): UserRegistration[] {
  return [...store().users.values()].sort(
    (a, b) => a.createdAt - b.createdAt || a.owner.localeCompare(b.owner),
  );
}

/** Look up one user by owner G-address, or null if not registered. */
export function getUser(owner: string): UserRegistration | null {
  return store().users.get(owner) ?? null;
}

/**
 * Remove a single user (and any position for their smart wallet) so the demo
 * onboarding re-appears for that owner. Returns true if a user was removed.
 */
export function removeUser(owner: string): boolean {
  const s = store();
  const u = s.users.get(owner);
  if (!u) return false;
  s.users.delete(owner);
  s.positions.delete(u.smartWallet);
  return true;
}

// ── Per-user positions (keyed by smart wallet) ────────────────────────────────

/** Persist the position for a specific smart wallet (upsert). */
export function setUserPosition(smartWallet: string, p: Position): void {
  store().positions.set(smartWallet, { ...p });
}

/** Read a smart wallet's position; idle (null pool, 0) if none stored. */
export function getUserPosition(smartWallet: string): Position {
  return store().positions.get(smartWallet) ?? { poolId: null, amountUsdc: 0n };
}

// ── Reset ──────────────────────────────────────────────────────────────────--

/**
 * Clear the ENTIRE registry (all users + positions) so the whole demo can be
 * re-run without restarting the server. Returns the number of users removed.
 */
export function clearRegistry(): number {
  const s = store();
  const removed = s.users.size;
  s.users.clear();
  s.positions.clear();
  return removed;
}

/** Current registered-user count (used by `/api/reset` + the sharing probe). */
export function userCount(): number {
  return store().users.size;
}

/**
 * Diagnostic: prove the `globalThis` registry is the SAME object across module
 * instances. Returns a stable per-process id derived from the live store object,
 * so the route handler + the loop can be observed pointing at one store.
 * (We tag the store with a hidden id the first time this is called.)
 */
export function registryStoreId(): string {
  const s = store() as RegistryStore & { __id?: string };
  if (!s.__id) {
    s.__id = `${process.pid}:${Math.random().toString(36).slice(2, 10)}`;
  }
  return s.__id;
}
