"use client";

import type { AgentTx } from "./format";
import { formatTimeAgo, formatUsdc, truncateAddress } from "./format";
import { testnetTxUrl } from "./links";

interface Props {
  txs: AgentTx[];
  /** Friendly name of the exec pool the agent supplies into (chrome only). */
  poolLabel?: string;
}

/** Short, human label for an agent tx kind. */
function kindLabel(kind: string): string {
  if (kind === "peruser") return "SUPPLY";
  if (kind === "rebalance") return "REBALANCE";
  return kind.toUpperCase();
}

/**
 * Right-docked feed of the agent's on-chain transactions — the supplies it
 * makes into our Blend testnet pool on behalf of each user's smart account.
 * Every row deep-links to the tx on stellar.expert (testnet). Floats over the
 * right edge of the graph; the pool analysis panel slides over it when open.
 */
export default function TransactionsPanel({ txs, poolLabel }: Props) {
  return (
    <aside style={styles.panel} aria-label="Agent transactions">
      <div style={styles.head}>
        <div style={styles.kicker}>AGENT TRANSACTIONS</div>
        <span style={styles.count}>{txs.length}</span>
      </div>
      <div style={styles.sub}>
        supplies into {poolLabel ?? "the Blend testnet pool"}
      </div>

      <div style={styles.list}>
        {txs.length === 0 ? (
          <div style={styles.empty}>
            No transactions yet — the agent supplies idle USDC into the pool on
            its next tick. They’ll show up here, linked to stellar.expert.
          </div>
        ) : (
          txs.map((tx, i) => (
            <a
              key={`${tx.hash}-${i}`}
              href={testnetTxUrl(tx.hash)}
              target="_blank"
              rel="noreferrer"
              style={styles.row}
              title={`${tx.hash}\n${tx.message}`}
            >
              <div style={styles.rowTop}>
                <span style={styles.badge}>{kindLabel(tx.kind)}</span>
                {tx.amountStroops && (
                  <span style={styles.amount}>+{formatUsdc(tx.amountStroops)} USDC</span>
                )}
                <span style={styles.ago}>{formatTimeAgo(tx.ts)}</span>
              </div>
              <div style={styles.rowBottom}>
                <span style={styles.hash}>{truncateAddress(tx.hash, 6, 6)}</span>
                <span style={styles.ext}>↗</span>
              </div>
            </a>
          ))
        )}
      </div>
    </aside>
  );
}

type S = React.CSSProperties;

const styles: Record<string, S> = {
  panel: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 248,
    maxHeight: "calc(100% - 24px)",
    display: "flex",
    flexDirection: "column",
    background: "rgba(255,255,255,0.82)",
    backdropFilter: "blur(8px)",
    border: "1px solid var(--line)",
    borderRadius: 14,
    padding: "12px 12px 8px",
    zIndex: 9,
    boxShadow: "0 18px 44px -28px rgba(11,11,12,0.4)",
  },
  head: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  kicker: {
    fontSize: 9.5,
    letterSpacing: "0.16em",
    color: "var(--mut)",
    fontWeight: 600,
  },
  count: {
    fontSize: 10,
    fontWeight: 700,
    color: "var(--blue)",
    background: "var(--blue-soft)",
    borderRadius: 999,
    padding: "1px 8px",
    minWidth: 16,
    textAlign: "center",
  },
  sub: { fontSize: 10, color: "var(--mut)", marginTop: 3, lineHeight: 1.4 },
  list: {
    marginTop: 10,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    overflowY: "auto",
  },
  empty: {
    fontSize: 11,
    color: "var(--mut)",
    lineHeight: 1.5,
    background: "var(--chip)",
    borderRadius: 10,
    padding: "11px 12px",
  },
  row: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    textDecoration: "none",
    color: "var(--ink)",
    background: "#fff",
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: "9px 11px",
    transition: "transform 140ms ease, box-shadow 140ms ease",
  },
  rowTop: { display: "flex", alignItems: "center", gap: 7 },
  badge: {
    fontSize: 8.5,
    fontWeight: 700,
    letterSpacing: "0.08em",
    color: "#1f9d55",
    background: "rgba(31,157,85,0.12)",
    borderRadius: 5,
    padding: "2px 6px",
  },
  amount: { fontSize: 11.5, fontWeight: 700, color: "var(--ink)" },
  ago: { fontSize: 9.5, color: "var(--mut)", marginLeft: "auto" },
  rowBottom: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  hash: {
    fontSize: 11,
    fontWeight: 600,
    color: "#2b4cff",
    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
  },
  ext: { fontSize: 11, color: "#2b4cff" },
};
