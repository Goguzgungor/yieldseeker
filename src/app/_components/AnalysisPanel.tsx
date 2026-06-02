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
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={styles.metricLabel}>{label}</span>
      <span style={{ ...styles.metricValue, color: accent ? "var(--blue)" : "var(--ink)" }}>
        {value}
      </span>
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
        style={{
          ...styles.scrim,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
        }}
      />
      <aside
        aria-hidden={!open}
        style={{
          ...styles.panel,
          transform: open ? "translateX(0)" : "translateX(105%)",
        }}
      >
        {pool && (
          <div style={styles.inner}>
            <div style={styles.header}>
              <div>
                <div style={styles.kicker}>POOL ANALYSIS</div>
                <h2 style={styles.title}>{pool.name}</h2>
                <div style={styles.subId}>{truncateAddress(pool.poolId, 6, 6)}</div>
              </div>
              <button onClick={onClose} aria-label="Close panel" style={styles.close}>
                ✕
              </button>
            </div>

            <div
              style={{
                ...styles.badge,
                background: pool.eligible ? "var(--blue-soft)" : "#ececec",
                color: pool.eligible ? "var(--blue)" : "#7a7a80",
                borderColor: pool.eligible ? "var(--blue)" : "#d6d6d0",
              }}
            >
              {pool.eligible ? "● ELIGIBLE" : "○ INELIGIBLE"}
              {isChosen && pool.eligible ? " · AGENT CHOICE" : ""}
            </div>
            {!pool.eligible && pool.reason && (
              <div style={styles.reason}>{pool.reason}</div>
            )}

            <div style={styles.grid}>
              <Metric label="APY" value={formatApy(pool.apyBps)} accent />
              <Metric label="TVL" value={formatTvl(pool.tvlUsdc)} />
              <Metric label="UTILIZATION" value={formatPct(pool.utilizationBps)} />
              <Metric
                label="ORACLE"
                value={pool.oracleHealthy ? "Healthy" : "Flagged"}
              />
            </div>

            {/* risk score bar */}
            <div style={styles.riskBlock}>
              <div style={styles.riskHead}>
                <span style={styles.metricLabel}>RISK SCORE</span>
                <span style={styles.riskNum}>{pool.riskScore}/100</span>
              </div>
              <div style={styles.riskTrack}>
                <div
                  style={{
                    ...styles.riskFill,
                    width: `${Math.min(100, pool.riskScore)}%`,
                    background: riskColor(pool.riskScore),
                  }}
                />
              </div>
              <div style={styles.riskScale}>
                <span>safe</span>
                <span>risky</span>
              </div>
            </div>

            {isChosen && position?.rationale && (
              <div style={styles.rationale}>
                <div style={styles.rationaleHead}>◆ AGENT RATIONALE</div>
                <p style={styles.rationaleText}>{position.rationale}</p>
              </div>
            )}

            <div style={styles.links}>
              <a
                href={blendPoolUrl(pool.poolId)}
                target="_blank"
                rel="noreferrer"
                style={{ ...styles.linkBtn, ...styles.linkPrimary }}
              >
                View on Blend ↗
              </a>
              <a
                href={stellarExpertUrl(pool.poolId)}
                target="_blank"
                rel="noreferrer"
                style={{ ...styles.linkBtn, ...styles.linkSecondary }}
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
  if (score <= 35) return "#1f9d55";
  if (score <= 65) return "#d08700";
  return "#d23f3f";
}

const styles: Record<string, React.CSSProperties> = {
  scrim: {
    position: "absolute",
    inset: 0,
    background: "rgba(11,11,12,0.04)",
    transition: "opacity 240ms ease",
    zIndex: 30,
  },
  panel: {
    position: "absolute",
    top: 12,
    right: 12,
    bottom: 12,
    width: 360,
    maxWidth: "calc(100% - 24px)",
    background: "#ffffff",
    border: "1px solid var(--line)",
    borderRadius: 16,
    boxShadow: "0 24px 60px -28px rgba(11,11,12,0.35)",
    transition: "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)",
    zIndex: 31,
    overflow: "hidden",
  },
  inner: { display: "flex", flexDirection: "column", gap: 16, padding: 22, height: "100%", overflowY: "auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  kicker: { fontSize: 9.5, letterSpacing: "0.18em", color: "var(--mut)", fontWeight: 500 },
  title: { fontSize: 18, fontWeight: 700, marginTop: 6, lineHeight: 1.2, wordBreak: "break-word" },
  subId: { fontSize: 11, color: "var(--mut)", marginTop: 4 },
  close: {
    width: 30,
    height: 30,
    borderRadius: 8,
    background: "var(--chip)",
    display: "grid",
    placeItems: "center",
    fontSize: 12,
    color: "#777",
    flexShrink: 0,
  },
  badge: {
    alignSelf: "flex-start",
    fontSize: 11,
    fontWeight: 600,
    padding: "6px 11px",
    borderRadius: 999,
    border: "1px solid",
    letterSpacing: "0.04em",
  },
  reason: {
    fontSize: 12,
    color: "#7a7a80",
    background: "#f6f6f2",
    borderRadius: 10,
    padding: "9px 12px",
    lineHeight: 1.45,
    marginTop: -6,
  },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: "4px 0" },
  metricLabel: {
    fontSize: 9.5,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--mut)",
    fontWeight: 500,
  },
  metricValue: { fontSize: 18, fontWeight: 700 },
  riskBlock: { display: "flex", flexDirection: "column", gap: 7 },
  riskHead: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
  riskNum: { fontSize: 13, fontWeight: 700 },
  riskTrack: { height: 7, borderRadius: 999, background: "#ecece7", overflow: "hidden" },
  riskFill: { height: "100%", borderRadius: 999, transition: "width 400ms ease" },
  riskScale: { display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--mut)", letterSpacing: "0.06em" },
  rationale: {
    background: "var(--blue-faint)",
    border: "1px solid var(--blue-soft)",
    borderRadius: 12,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 7,
  },
  rationaleHead: { fontSize: 10, letterSpacing: "0.14em", color: "var(--blue)", fontWeight: 600 },
  rationaleText: { fontSize: 12.5, lineHeight: 1.55, color: "var(--ink)" },
  links: { display: "flex", flexDirection: "column", gap: 9, marginTop: "auto", paddingTop: 6 },
  linkBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 15px",
    borderRadius: 11,
    fontSize: 13,
    fontWeight: 600,
    textDecoration: "none",
    transition: "transform 140ms ease, opacity 140ms ease",
  },
  linkPrimary: { background: "var(--blue)", color: "#fff" },
  linkSecondary: { background: "var(--chip)", color: "var(--ink)" },
};
