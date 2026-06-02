// Pure formatting helpers shared across the Living Network UI. USDC amounts are
// 7-decimal stroops stored as decimal strings (BigInt-safe).

const STROOPS_PER_USDC = 10_000_000n;

/** Parse a stroop decimal string into a whole-USDC number (floored). */
export function stroopsToUsdc(stroops: string | null | undefined): number {
  if (!stroops) return 0;
  try {
    return Number(BigInt(stroops) / STROOPS_PER_USDC);
  } catch {
    return 0;
  }
}

/** "1,000" — grouped integer USDC from stroops. */
export function formatUsdc(stroops: string | null | undefined): string {
  return stroopsToUsdc(stroops).toLocaleString("en-US");
}

/** "$1,234,567" — grouped dollar TVL from stroops (no cents). */
export function formatTvl(stroops: string | null | undefined): string {
  return "$" + stroopsToUsdc(stroops).toLocaleString("en-US");
}

/** basis points -> "8.23%". */
export function formatApy(apyBps: number): string {
  return (apyBps / 100).toFixed(2) + "%";
}

/** basis points -> "90%". */
export function formatPct(bps: number): string {
  return Math.round(bps / 100) + "%";
}

/** G ABCD…WXYZ — truncate a Stellar G…/C… address for chrome. */
export function truncateAddress(addr: string | null | undefined, head = 4, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

/**
 * "BLEND · CDMA…FPVAI" — the pill label. Pools are commonly named like
 * "Blend Fixed V2"; when a name is just a raw contract id we fall back to a
 * BLEND · <short id> label that matches the visual reference.
 */
export function poolPillLabel(name: string, poolId: string): string {
  const looksLikeId = /^[CG][A-Z0-9]{30,}$/.test(name);
  const core = looksLikeId || !name ? truncateAddress(poolId, 4, 5) : name;
  const cleaned = core.replace(/^blend\s*[·:-]?\s*/i, "").trim();
  return `BLEND · ${cleaned.toUpperCase()}`;
}

/** Map a Stellar getNetwork() value to a friendly chrome label. */
export function networkLabel(network: string | null | undefined): string {
  if (!network) return "Stellar";
  const n = network.toUpperCase();
  if (n === "PUBLIC") return "Mainnet";
  if (n === "TESTNET") return "Testnet";
  if (n === "FUTURENET") return "Futurenet";
  return network;
}
