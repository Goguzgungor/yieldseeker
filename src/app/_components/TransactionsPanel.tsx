"use client";

import { useState } from "react";
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
 * Every row deep-links to the tx on stellar.expert (testnet). Renders as dark
 * glass ON the screen; collapsible (pure UI state) so it can get out of the
 * graph's way.
 */
export default function TransactionsPanel({ txs, poolLabel }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={collapsed ? "ys-tx collapsed" : "ys-tx"} aria-label="Agent transactions">
      <div className="ys-tx-head">
        <div className="ys-tx-kicker">AGENT TRANSACTIONS</div>
        <span className="ys-tx-count">{txs.length}</span>
        <button
          className="ys-tx-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand transactions" : "Collapse transactions"}
          title={collapsed ? "Expand" : "Collapse"}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path
              d="M2 3.5 L5 6.5 L8 3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="ys-tx-sub">supplies into {poolLabel ?? "the Blend testnet pool"}</div>

          <div className="ys-tx-list">
            {txs.length === 0 ? (
              <div className="ys-tx-empty ys-prose">
                No transactions yet — the agent supplies idle USDC on its next tick.
              </div>
            ) : (
              txs.map((tx, i) => (
                <a
                  key={`${tx.hash}-${i}`}
                  href={testnetTxUrl(tx.hash)}
                  target="_blank"
                  rel="noreferrer"
                  className="ys-tx-row"
                  title={`${tx.hash}\n${tx.message}`}
                >
                  <div className="ys-tx-row-top">
                    <span className="ys-tx-badge">{kindLabel(tx.kind)}</span>
                    {tx.amountStroops && (
                      <span className="ys-tx-amount">+{formatUsdc(tx.amountStroops)} USDC</span>
                    )}
                    <span className="ys-tx-ago">{formatTimeAgo(tx.ts)}</span>
                  </div>
                  <div className="ys-tx-row-bottom">
                    <span className="ys-tx-hash">{truncateAddress(tx.hash, 6, 6)}</span>
                    <span className="ys-tx-ext">↗</span>
                  </div>
                </a>
              ))
            )}
          </div>
        </>
      )}
    </aside>
  );
}
