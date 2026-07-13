"use client";

import type { ApiPosition, ApiScoredPool } from "./types";
import { formatApy, formatPct, formatTvl, truncateAddress } from "./format";
import { blendPoolUrl, stellarExpertUrl } from "./links";

interface Props {
  pool: ApiScoredPool | null;
  position: ApiPosition | null;
  onClose: () => void;
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="ys-metric">
      <span className="ys-metric-label">{label}</span>
      <span className={accent ? "ys-metric-value accent" : "ys-metric-value"}>{value}</span>
    </div>
  );
}

export default function AnalysisPanel({ pool, position, onClose }: Props) {
  const open = !!pool;
  const isChosen = !!pool && position?.chosenPoolId === pool.poolId;

  return (
    <>
      {/* scrim */}
      <div
        onClick={onClose}
        className="ys-scrim"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
      />
      <aside
        aria-hidden={!open}
        className="ys-panel ys-panel--analysis"
        style={{ transform: open ? "translateX(0)" : "translateX(105%)" }}
      >
        {pool && (
          <div className="ys-panel-inner">
            <div className="ys-panel-head">
              <div>
                <div className="ys-kicker">POOL ANALYSIS</div>
                <h2 className="ys-panel-title">{pool.name}</h2>
                <div className="ys-sub-id">{truncateAddress(pool.poolId, 6, 6)}</div>
              </div>
              <button onClick={onClose} aria-label="Close panel" className="ys-close">
                ✕
              </button>
            </div>

            <div className={pool.eligible ? "ys-badge on" : "ys-badge off"}>
              {pool.eligible ? "● ELIGIBLE" : "○ INELIGIBLE"}
              {isChosen && pool.eligible ? " · AGENT CHOICE" : ""}
            </div>
            {!pool.eligible && pool.reason && (
              <div className="ys-reason ys-prose">{pool.reason}</div>
            )}

            <div className="ys-metric-grid">
              <Metric label="APY" value={formatApy(pool.apyBps)} accent />
              <Metric label="TVL" value={formatTvl(pool.tvlUsdc)} />
              <Metric label="UTILIZATION" value={formatPct(pool.utilizationBps)} />
              <Metric label="ORACLE" value={pool.oracleHealthy ? "Healthy" : "Flagged"} />
            </div>

            {/* risk score bar */}
            <div className="ys-risk">
              <div className="ys-risk-head">
                <span className="ys-metric-label">RISK SCORE</span>
                <span className="ys-risk-num">{pool.riskScore}/100</span>
              </div>
              <div className="ys-risk-track">
                <div
                  className="ys-risk-fill"
                  style={{
                    width: `${Math.min(100, pool.riskScore)}%`,
                    background: riskColor(pool.riskScore),
                  }}
                />
              </div>
              <div className="ys-risk-scale">
                <span>safe</span>
                <span>risky</span>
              </div>
            </div>

            {isChosen && position?.rationale && (
              <div className="ys-rationale">
                <div className="ys-rationale-head">◆ AGENT RATIONALE</div>
                <p className="ys-rationale-text ys-prose">{position.rationale}</p>
              </div>
            )}

            <div className="ys-panel-links">
              <a href={blendPoolUrl(pool.poolId)} target="_blank" rel="noreferrer" className="ys-cta">
                View on Blend ↗
              </a>
              <a
                href={stellarExpertUrl(pool.poolId)}
                target="_blank"
                rel="noreferrer"
                className="ys-cta-2"
              >
                View on stellar.expert ↗
              </a>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

function riskColor(score: number): string {
  if (score <= 35) return "var(--ok)";
  if (score <= 65) return "var(--warn)";
  return "var(--err)";
}
