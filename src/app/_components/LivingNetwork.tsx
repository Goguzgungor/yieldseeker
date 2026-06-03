"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import NetworkGraph from "./NetworkGraph";
import AnalysisPanel from "./AnalysisPanel";
import TransactionsPanel from "./TransactionsPanel";
import Onboarding from "./Onboarding";
import { useLivingData } from "./useLivingData";
import { useFreighter } from "./useFreighter";
import { useOnboarding } from "./useOnboarding";
import { extractAgentTxs, formatApy, networkLabel, truncateAddress } from "./format";
import { FREIGHTER_INSTALL_URL, testnetTxUrl } from "./links";

// Known yield-source protocols (rail order + glyph). A dot lights up when the
// latest scan actually contains pools from that protocol (derived from
// pool.protocol), so the rail honestly reflects the multi-protocol set the agent
// is watching — Blend and DeFindex today, the rest "· soon".
const PROTOCOLS = [
  { key: "blend", glyph: "B", label: "Blend" },
  { key: "defindex", glyph: "D", label: "DeFindex" },
  { key: "soroswap", glyph: "◴", label: "Soroswap" },
  { key: "aquarius", glyph: "≋", label: "Aquarius" },
  { key: "phoenix", glyph: "◍", label: "Phoenix" },
];

/** Returns a human-readable age string like "2m ago" or "just now". */
function useAgeLabel(updatedAt: number | null): string {
  const [label, setLabel] = useState("");
  useEffect(() => {
    if (updatedAt == null) { setLabel(""); return; }
    const compute = () => {
      const secs = Math.floor((Date.now() - updatedAt) / 1000);
      if (secs < 10) return "just now";
      if (secs < 60) return `${secs}s ago`;
      const mins = Math.floor(secs / 60);
      if (mins < 60) return `${mins}m ago`;
      return `${Math.floor(mins / 60)}h ago`;
    };
    setLabel(compute());
    const id = setInterval(() => setLabel(compute()), 15_000);
    return () => clearInterval(id);
  }, [updatedAt]);
  return label;
}

export default function LivingNetwork() {
  const { pools, scanUpdatedAt, position, activity, loading, scanning, rescan } = useLivingData();
  const wallet = useFreighter();
  const onboarding = useOnboarding(wallet.address);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [onboardOpen, setOnboardOpen] = useState(false);
  const ageLabel = useAgeLabel(scanUpdatedAt);

  // Gently open the onboarding panel the first time we learn a connected wallet
  // is NOT yet registered. Re-armed whenever the address changes so each newly
  // connected wallet gets one nudge (but never nags after the user closes it).
  const nudgedFor = useRef<string | null>(null);
  useEffect(() => {
    if (wallet.address && onboarding.registered === false && nudgedFor.current !== wallet.address) {
      nudgedFor.current = wallet.address;
      setOnboardOpen(true);
    }
    if (!wallet.address) setOnboardOpen(false);
  }, [wallet.address, onboarding.registered]);

  const selectedPool = useMemo(
    () => pools.find((p) => p.poolId === selectedId) ?? null,
    [pools, selectedId],
  );

  // Best eligible APY for the stat bar.
  const bestApy = useMemo(() => {
    const eligible = pools.filter((p) => p.eligible);
    if (!eligible.length) return null;
    return eligible.reduce((a, b) => (b.apyBps > a.apyBps ? b : a)).apyBps;
  }, [pools]);

  // Distinct protocols present in the latest scan → which rail dots light up.
  const activeProtocols = useMemo(() => new Set(pools.map((p) => p.protocol)), [pools]);

  // All agent transactions from the activity log.
  const agentTxs = useMemo(() => extractAgentTxs(activity), [activity]);

  // Per-user TX filter:
  //   • Registered user → only their own supplies (matched by smart wallet).
  //   • Wallet connected but NOT registered (setup mode / post-reset) → empty
  //     list so the panel feels clean before they onboard.
  //   • No wallet connected (visitor) → full list so the dashboard feels alive.
  const mySmartWallet = onboarding.registered ? onboarding.registered.smartWallet : null;
  const myTxs = useMemo(() => {
    if (mySmartWallet) return agentTxs.filter((tx) => tx.smartWallet === mySmartWallet);
    if (wallet.address) return []; // connected but not yet registered → clean slate
    return agentTxs; // visitor: show all agent activity
  }, [agentTxs, mySmartWallet, wallet.address]);

  // Ripple trigger: only fires for this user's latest TX, not someone else's.
  const latestTxHash = myTxs[0]?.hash ?? null;

  // Graph position: blue glow + ripple only appear once THIS user's USDC has
  // been supplied (their TX exists in the log). Neutral graph before that.
  const graphPosition = useMemo(
    () => (mySmartWallet && myTxs.length > 0 ? position : null),
    [mySmartWallet, myTxs, position],
  );

  const latestLog = activity[0];
  const active = scanning && !paused;

  return (
    <main style={styles.page}>
      <div style={styles.app}>
        {/* ───────── top bar ───────── */}
        <div style={styles.top}>
          <div style={styles.glyph}>
            <i style={styles.glyphInner} />
          </div>
          <div style={styles.pill}>
            YieldSeeker · Stellar
            <span style={styles.pillInfo} title="Autonomous DeFi yield agent">
              i
            </span>
          </div>
          <button
            style={styles.play}
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? "Resume" : "Pause"}
            title={paused ? "Resume scanning" : "Pause scanning"}
          >
            {paused ? "▶" : "⏸"}
          </button>
        </div>

        {/* ───────── left rail ───────── */}
        <div style={styles.rail}>
          {PROTOCOLS.map((r) => {
            const on = activeProtocols.has(r.key);
            return (
              <div
                key={r.key}
                className="ys-rail-dot"
                style={{ ...styles.railDot, ...(on ? styles.railDotOn : {}) }}
              >
                {r.glyph}
                <span
                  style={{
                    ...styles.railLabel,
                    ...(on ? styles.railLabelOn : styles.railLabelOff),
                  }}
                >
                  {on ? r.label : `${r.label} · soon`}
                </span>
              </div>
            );
          })}
        </div>

        {/* ───────── note ───────── */}
        <div style={styles.note}>
          {loading
            ? "Connecting to YieldSeeker…"
            : pools.length === 0
              ? "First scan in progress — agent discovering pools…"
              : `live network — agent watching ${pools.length} mainnet pool${
                  pools.length === 1 ? "" : "s"
                } across ${activeProtocols.size} protocol${activeProtocols.size === 1 ? "" : "s"}`}
        </div>

        {/* ───────── stage / graph ───────── */}
        <div style={styles.stage}>
          {pools.length === 0 ? (
            // Show empty stage only on genuine cold start (no prior snapshot).
            // If there IS a cached snapshot but pools still empty (corrupt/raced),
            // fall through to NetworkGraph with empty array (renders nothing).
            <EmptyStage loading={loading || scanUpdatedAt == null} />
          ) : (
            <NetworkGraph
              pools={pools}
              position={graphPosition}
              scanning={active}
              selectedId={selectedId}
              onSelect={setSelectedId}
              chosenTxHash={latestTxHash}
            />
          )}

          {/* agent transactions feed (right-docked): filtered to this user */}
          <TransactionsPanel txs={myTxs} />

          {/* activity ticker */}
          {latestLog && (
            <div style={styles.ticker}>
              <span style={tickerDotStyle(latestLog.kind)} />
              <span style={styles.tickerKind}>{latestLog.kind}</span>
              <span style={styles.tickerMsg}>{latestLog.message}</span>
              {/* If the log entry carries tx hashes (rebalance / peruser), link the first one */}
              {(() => {
                if (!latestLog.meta) return null;
                try {
                  const m = JSON.parse(latestLog.meta) as { hashes?: string[] };
                  const hash = m.hashes?.[0];
                  if (!hash) return null;
                  return (
                    <a
                      href={testnetTxUrl(hash)}
                      target="_blank"
                      rel="noreferrer"
                      style={styles.tickerTxLink}
                      title={hash}
                    >
                      {truncateAddress(hash, 4, 4)} ↗
                    </a>
                  );
                } catch {
                  return null;
                }
              })()}
            </div>
          )}
        </div>

        {/* ───────── bottom bar ───────── */}
        <div style={styles.bottom}>
          <Stat label="Pools" value={loading ? "—" : String(pools.length)} />
          <Stat label="Best APY" value={bestApy != null ? formatApy(bestApy) : "—"} />
          <Stat label="Agent TXs" value={loading ? "—" : String(myTxs.length)} />
          {onboarding.registered ? (
            <button
              type="button"
              style={{ ...styles.stat, cursor: "pointer", textAlign: "left" }}
              onClick={() => setOnboardOpen(true)}
              title="View your smart account"
            >
              <b style={{ ...styles.statLabel, color: "var(--blue)" }}>YOUR SA</b>
              <span style={styles.statValue}>
                {truncateAddress(onboarding.registered.smartWallet, 4, 4)}
              </span>
            </button>
          ) : (
            <Stat label="Network" value={networkLabel(wallet.network) || "Stellar"} />
          )}
          {ageLabel && (
            <div style={styles.freshness}>
              <span style={styles.freshnessLabel}>CACHE</span>
              <span style={styles.freshnessValue}>{ageLabel}</span>
            </div>
          )}

          {/* flexible spacer keeps the wallet + scan controls right-aligned */}
          <div style={{ flex: 1 }} />

          <WalletButton
            wallet={wallet}
            registered={!!onboarding.registered}
            onOpenAccount={() => setOnboardOpen(true)}
            onDisconnect={() => {
              // Disconnecting a registered wallet also clears its in-memory demo
              // registration, so reconnecting re-shows the onboarding (demo reset).
              if (onboarding.registered) void onboarding.resetDemo();
              wallet.disconnect();
            }}
          />

          <button
            style={{ ...styles.start, ...(active ? styles.startActive : {}) }}
            onClick={rescan}
            disabled={paused}
            title={paused ? "Resume to scan" : "Trigger a scan"}
          >
            {active ? (
              <>
                Scan
                <br />
                ning…
              </>
            ) : (
              <>
                Start
                <br />
                scan
              </>
            )}
          </button>
        </div>

        <AnalysisPanel pool={selectedPool} position={position} onClose={() => setSelectedId(null)} />
        <Onboarding
          ownerAddress={wallet.address}
          onboarding={onboarding}
          open={onboardOpen}
          onClose={() => setOnboardOpen(false)}
        />
      </div>

      {/* keyframes + hover interactions that inline styles can't express */}
      <style>{globalCss}</style>
    </main>
  );
}

// ── sub-components ───────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.stat}>
      <b style={styles.statLabel}>{label}</b>
      <span style={styles.statValue}>{value}</span>
    </div>
  );
}

function EmptyStage({ loading }: { loading: boolean }) {
  return (
    <div style={styles.empty}>
      <div className="ys-cloud" style={styles.cloud} />
      <div style={styles.center}>
        <div className={loading ? "ys-ring ys-ring-pulse" : "ys-ring"} style={styles.ring} />
        <div style={styles.centerName}>YIELDSEEKER AGENT</div>
        <div style={styles.centerAmt}>Autonomous yield agent</div>
        <div style={styles.centerHint}>
          {loading ? "first scan in progress…" : "awaiting first scan result…"}
        </div>
      </div>
    </div>
  );
}

function WalletButton({
  wallet,
  registered,
  onOpenAccount,
  onDisconnect,
}: {
  wallet: ReturnType<typeof useFreighter>;
  registered: boolean;
  onOpenAccount: () => void;
  onDisconnect: () => void;
}) {
  if (wallet.installed === false) {
    return (
      <a
        href={FREIGHTER_INSTALL_URL}
        target="_blank"
        rel="noreferrer"
        style={{ ...styles.connect, textDecoration: "none", display: "grid", placeItems: "center" }}
        title="Freighter wallet is required"
      >
        Install Freighter ↗
      </a>
    );
  }
  if (wallet.address) {
    // The chip opens the account / onboarding panel; a small ✕ disconnects, so
    // the primary action surfaces the user's smart account rather than dropping
    // the connection by accident.
    return (
      <div style={styles.walletConnected}>
        <button
          style={styles.walletChip}
          onClick={onOpenAccount}
          title={`${wallet.address}\nClick to ${registered ? "view your smart account" : "set up your account"}`}
        >
          <span className="ys-live-dot ys-live-on" />
          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>
              {truncateAddress(wallet.address, 4, 4)}
            </span>
            <span
              style={{
                fontSize: 9,
                color: registered ? "var(--blue)" : "var(--mut)",
                letterSpacing: "0.06em",
              }}
            >
              {registered ? "agent active · manage" : "set up account"}
            </span>
          </span>
        </button>
        <button
          style={styles.walletDisconnect}
          onClick={onDisconnect}
          aria-label="Disconnect wallet"
          title={registered ? "Disconnect (resets the demo for this wallet)" : "Disconnect"}
        >
          ✕
        </button>
      </div>
    );
  }
  return (
    <button style={styles.connect} onClick={wallet.connect} disabled={wallet.connecting}>
      {wallet.connecting ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}

// ── styles ───────────────────────────────────────────────────────────────────

type S = React.CSSProperties;

const tickerKindColor = (kind: string): string => {
  if (kind === "rebalance") return "#1f9d55";
  if (kind === "error" || kind === "skip") return "#d23f3f";
  if (kind === "decision") return "var(--blue)";
  return "#9a9aa0";
};

const tickerDotStyle = (kind: string): S => ({
  width: 7,
  height: 7,
  borderRadius: "50%",
  background: tickerKindColor(kind),
  flexShrink: 0,
});

const styles: Record<string, S> = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: "clamp(8px, 2vw, 28px)",
    background: "var(--bg)",
  },
  app: {
    position: "relative",
    width: "min(1280px, 100%)",
    height: "min(820px, calc(100vh - 40px))",
    minHeight: 600,
    overflow: "hidden",
    border: "1px solid var(--line)",
    borderRadius: 18,
    background: "var(--bg)",
  },
  // top
  top: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 64,
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "0 18px",
    zIndex: 12,
  },
  glyph: {
    width: 34,
    height: 34,
    border: "1.5px solid var(--ink)",
    borderRadius: 9,
    display: "grid",
    placeItems: "center",
    transform: "rotate(45deg)",
    flexShrink: 0,
  },
  glyphInner: { display: "block", width: 11, height: 11, border: "1.5px solid var(--ink)" },
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    background: "var(--chip)",
    borderRadius: 999,
    padding: "8px 12px",
    fontSize: 12.5,
    whiteSpace: "nowrap",
  },
  pillInfo: {
    width: 15,
    height: 15,
    border: "1px solid var(--mut)",
    borderRadius: "50%",
    display: "grid",
    placeItems: "center",
    fontSize: 9,
    color: "#777",
  },
  play: {
    width: 34,
    height: 34,
    borderRadius: 9,
    background: "var(--ink)",
    color: "#fff",
    display: "grid",
    placeItems: "center",
    fontSize: 13,
    flexShrink: 0,
  },
  timeline: {
    flex: 1,
    height: 34,
    borderRadius: 9,
    background: "var(--chip)",
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    gap: 10,
    overflow: "hidden",
    minWidth: 0,
  },
  timelineTrack: { flex: 1, display: "flex", alignItems: "center", gap: 5, overflow: "hidden" },
  tick: { width: 1, flexShrink: 0, borderRadius: 1 },
  live: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 9.5,
    letterSpacing: "0.16em",
    color: "var(--mut)",
    fontWeight: 600,
    flexShrink: 0,
  },
  // rail
  rail: {
    position: "absolute",
    left: 18,
    top: "50%",
    transform: "translateY(-50%)",
    display: "flex",
    flexDirection: "column",
    gap: 14,
    zIndex: 12,
  },
  railDot: {
    width: 46,
    height: 46,
    borderRadius: "50%",
    background: "var(--chip)",
    display: "grid",
    placeItems: "center",
    color: "var(--mut)",
    fontWeight: 700,
    fontSize: 14,
    position: "relative",
    transition: "transform 160ms ease",
  },
  railDotOn: {
    background: "var(--blue)",
    color: "#fff",
    boxShadow: "0 8px 22px -8px var(--blue)",
  },
  railLabel: {
    position: "absolute",
    left: 56,
    whiteSpace: "nowrap",
    color: "#fff",
    fontSize: 12,
    padding: "7px 11px",
    borderRadius: 8,
    pointerEvents: "none",
  },
  railLabelOn: { background: "var(--ink)", opacity: 1 },
  railLabelOff: { background: "var(--ink)", opacity: 0, transition: "opacity 140ms ease" },
  note: {
    position: "absolute",
    top: 74,
    left: "50%",
    transform: "translateX(-50%)",
    fontSize: 11,
    color: "var(--mut)",
    zIndex: 11,
    textAlign: "center",
    whiteSpace: "nowrap",
    maxWidth: "70%",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  // stage
  stage: { position: "absolute", top: 64, left: 0, right: 0, bottom: 84 },
  empty: { position: "absolute", inset: 0, display: "grid", placeItems: "center" },
  cloud: {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: 560,
    height: 460,
    transform: "translate(-50%,-50%)",
    backgroundImage:
      "radial-gradient(1px 1px at 10% 20%,#0b0b0c66,transparent),radial-gradient(1px 1px at 30% 60%,#0b0b0c55,transparent),radial-gradient(1px 1px at 50% 30%,#0b0b0c66,transparent),radial-gradient(1px 1px at 70% 70%,#0b0b0c44,transparent),radial-gradient(1px 1px at 85% 40%,#0b0b0c55,transparent),radial-gradient(1px 1px at 22% 80%,#0b0b0c44,transparent),radial-gradient(1px 1px at 60% 85%,#0b0b0c55,transparent),radial-gradient(1px 1px at 42% 48%,#0b0b0c66,transparent),radial-gradient(1px 1px at 78% 22%,#0b0b0c44,transparent)",
    backgroundSize:
      "120px 120px,90px 90px,140px 140px,100px 100px,110px 110px,130px 130px,95px 95px,80px 80px,115px 115px",
    opacity: 0.5,
  },
  center: { position: "relative", textAlign: "center", zIndex: 2 },
  ring: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    background: "var(--blue)",
    margin: "0 auto",
    boxShadow: "0 0 0 6px var(--blue-soft), 0 0 0 14px var(--blue-faint)",
  },
  centerName: { fontSize: 10, letterSpacing: "0.16em", color: "var(--mut)", marginTop: 14 },
  centerAmt: { fontSize: 15, fontWeight: 700, marginTop: 4 },
  centerHint: { fontSize: 11, color: "var(--mut)", marginTop: 10 },
  ticker: {
    position: "absolute",
    left: 18,
    bottom: 14,
    maxWidth: "min(560px, 60%)",
    display: "flex",
    alignItems: "center",
    gap: 9,
    background: "rgba(255,255,255,0.7)",
    backdropFilter: "blur(6px)",
    border: "1px solid var(--line)",
    borderRadius: 10,
    padding: "8px 12px",
    fontSize: 11.5,
    zIndex: 9,
  },
  tickerKind: {
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    fontSize: 9.5,
    color: "var(--mut)",
    fontWeight: 600,
    flexShrink: 0,
  },
  tickerMsg: {
    color: "var(--ink)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    flex: 1,
  },
  tickerTxLink: {
    flexShrink: 0,
    fontSize: 10.5,
    fontWeight: 600,
    color: "#2b4cff",
    textDecoration: "none",
    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
    whiteSpace: "nowrap" as const,
  },
  // bottom
  bottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 84,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "0 18px",
    zIndex: 12,
  },
  stat: {
    background: "var(--chip)",
    borderRadius: 12,
    padding: "9px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 1,
    flexShrink: 0,
  },
  statLabel: {
    fontSize: 9.5,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--mut)",
    fontWeight: 500,
  },
  statValue: { fontSize: 15, fontWeight: 600 },
  addr: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    background: "var(--chip)",
    borderRadius: 12,
    padding: "5px 5px 5px 14px",
    gap: 8,
    minWidth: 160,
  },
  addrInput: {
    flex: 1,
    border: 0,
    background: "transparent",
    fontSize: 13,
    outline: "none",
    color: "var(--ink)",
    minWidth: 0,
  },
  go: { background: "var(--ink)", color: "#fff", borderRadius: 9, padding: "8px 14px", fontSize: 12 },
  connect: {
    background: "var(--blue)",
    color: "#fff",
    borderRadius: 12,
    padding: "13px 18px",
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: "nowrap",
    flexShrink: 0,
    transition: "transform 140ms ease, box-shadow 140ms ease",
  },
  walletConnected: {
    background: "#fff",
    border: "1px solid var(--line)",
    borderRadius: 12,
    display: "flex",
    alignItems: "stretch",
    whiteSpace: "nowrap",
    flexShrink: 0,
    overflow: "hidden",
  },
  walletChip: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    padding: "8px 12px 8px 14px",
  },
  walletDisconnect: {
    width: 30,
    display: "grid",
    placeItems: "center",
    fontSize: 11,
    color: "var(--mut)",
    borderLeft: "1px solid var(--line)",
  },
  start: {
    width: 74,
    height: 74,
    borderRadius: "50%",
    background: "var(--ink)",
    color: "#fff",
    display: "grid",
    placeItems: "center",
    textAlign: "center",
    fontSize: 12,
    lineHeight: 1.15,
    flexShrink: 0,
    transition: "transform 160ms ease, box-shadow 200ms ease",
  },
  startActive: { boxShadow: "0 0 0 6px var(--blue-soft)", background: "var(--blue)" },
  freshness: {
    background: "var(--chip)",
    borderRadius: 12,
    padding: "9px 14px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 1,
    flexShrink: 0,
  },
  freshnessLabel: {
    fontSize: 9.5,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: "var(--mut)",
    fontWeight: 500,
    fontFamily: "monospace",
  },
  freshnessValue: { fontSize: 13, fontWeight: 500, color: "var(--mut)", fontFamily: "monospace" },
};

const globalCss = `
  @keyframes ys-tick-pulse {
    0%, 100% { transform: scaleY(1); opacity: 0.85; }
    50% { transform: scaleY(1.65); opacity: 1; }
  }
  .ys-timeline-track.ys-scanning .ys-tick { animation: ys-tick-pulse 1.4s ease-in-out infinite; }
  .ys-tick { transform-origin: center; }

  @keyframes ys-pulse-ring {
    0% { box-shadow: 0 0 0 6px var(--blue-soft), 0 0 0 14px var(--blue-faint); }
    50% { box-shadow: 0 0 0 10px var(--blue-soft), 0 0 0 22px var(--blue-faint); }
    100% { box-shadow: 0 0 0 6px var(--blue-soft), 0 0 0 14px var(--blue-faint); }
  }
  .ys-ring-pulse { animation: ys-pulse-ring 2.2s ease-in-out infinite; }

  @keyframes ys-cloud-drift {
    0% { transform: translate(-50%,-50%) scale(1); }
    50% { transform: translate(-50%,-51%) scale(1.02); }
    100% { transform: translate(-50%,-50%) scale(1); }
  }
  .ys-cloud { animation: ys-cloud-drift 14s ease-in-out infinite; }

  .ys-live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--mut); display: inline-block; }
  .ys-live-on { background: var(--blue); animation: ys-blink 1.8s ease-in-out infinite; }
  @keyframes ys-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

  .ys-rail-dot:hover { transform: scale(1.06); }
  .ys-rail-dot:hover > span { opacity: 1 !important; }

  /* onboarding active-step spinner: a small rotating blue arc inside the dot */
  .ys-step-ring {
    width: 13px; height: 13px; border-radius: 50%;
    border: 2px solid var(--blue-soft);
    border-top-color: var(--blue);
    display: inline-block;
    animation: ys-spin 0.8s linear infinite;
  }
  @keyframes ys-spin { to { transform: rotate(360deg); } }

  button:hover:not(:disabled) { filter: brightness(0.97); }
  a[style]:hover { transform: translateY(-1px); }
  canvas { cursor: grab; }
  canvas:active { cursor: grabbing; }
`;
