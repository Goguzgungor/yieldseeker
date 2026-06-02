/**
 * Next.js instrumentation hook. Runs once when the server process boots.
 * Starts the continuous YieldSeeker agent loop — but only in the real Node
 * server runtime, never during `next build`, and never when explicitly disabled
 * (the escape hatch used by build/CI/tests so no Anthropic/RPC calls happen).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return; // only the Node server runtime
  if (process.env.NEXT_PHASE === "phase-production-build") return; // never during build
  if (process.env.AGENT_LOOP_ENABLED === "0") return; // escape hatch for tests/build
  const { startLoop } = await import("./lib/runtime");
  await startLoop();
}
