// Canonical outbound links for a pool. Opened in a new tab from the analysis
// panel.

/**
 * Blend mainnet UI deep link. The Blend app is an IPFS-hosted SPA; its dashboard
 * route accepts a `poolId` query param to focus a specific pool. This deep-link
 * path is best-effort (the SPA can change its client routing without notice); if
 * Blend ever stops honoring the param it still lands on the live dashboard.
 */
export function blendPoolUrl(poolId: string): string {
  return `https://mainnet.blend.capital/dashboard?poolId=${encodeURIComponent(poolId)}`;
}

/**
 * stellar.expert contract explorer. Reliable, stable URL shape for any Soroban
 * contract id on public network.
 */
export function stellarExpertUrl(poolId: string): string {
  return `https://stellar.expert/explorer/public/contract/${encodeURIComponent(poolId)}`;
}

/** Where to send users who don't have the Freighter extension installed. */
export const FREIGHTER_INSTALL_URL = "https://www.freighter.app/";
