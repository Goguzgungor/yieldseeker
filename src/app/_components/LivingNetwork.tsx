"use client";

import { useMemo, useState } from "react";
import NetworkGraph from "./NetworkGraph";
import AnalysisPanel from "./AnalysisPanel";
import { useLivingData } from "./useLivingData";
import { useFreighter } from "./useFreighter";
import { formatApy, formatUsdc, networkLabel, truncateAddress } from "./format";
import { FREIGHTER_INSTALL_URL } from "./links";

const RAIL = [
  { key: "blend", glyph: "B", label: "Blend", on: true },
  { key: "soon1", glyph: "◴", label: "Soroswap · soon", on: false },
  { key: "soon2", glyph: "≋", label: "Aquarius · soon", on: false },
  { key: "soon3", glyph: "◍", label: "Phoenix · soon", on: false },
];

const TICK_COUNT = 32;

export default function LivingNetwork() {
  const { pools, position, activity, loading, scanning, connected, rescan } = useLivingData();
  const wallet = useFreighter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [addrInput, setAddrInput] = useState("");

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

  const idleUsdc = formatUsdc(position?.amountUsdc);
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
          <Timeline active={active} connected={connected} />
        </div>

        {/* ───────── left rail ───────── */}
        <div style={styles.rail}>
          {RAIL.map((r) => (
            <div
              key={r.key}
              className="ys-rail-dot"
              style={{ ...styles.railDot, ...(r.on ? styles.railDotOn : {}) }}
            >
              {r.glyph}
              <span
                style={{
                  ...styles.railLabel,
                  ...(r.on ? styles.railLabelOn : styles.railLabelOff),
                }}
              >
                {r.label}
              </span>
            </div>
          ))}
        </div>

        {/* ───────── note ───────── */}
        <div style={styles.note}>
          {loading
            ? "Connecting to YieldSeeker…"
            : pools.length === 0
              ? "Scanning Blend pools… (agent loop idle — start a scan)"
              : `live network — agent watching ${pools.length} mainnet Blend pool${
                  pools.length === 1 ? "" : "s"
                }`}
        </div>

        {/* ───────── stage / graph ───────── */}
        <div style={styles.stage}>
          {pools.length === 0 ? (
            <EmptyStage loading={loading} idleUsdc={idleUsdc} />
          ) : (
            <NetworkGraph
              pools={pools}
              position={position}
              scanning={active}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}

          {/* activity ticker */}
          {latestLog && (
            <div style={styles.ticker}>
              <span style={tickerDotStyle(latestLog.kind)} />
              <span style={styles.tickerKind}>{latestLog.kind}</span>
              <span style={styles.tickerMsg}>{latestLog.message}</span>
            </div>
          )}
        </div>

        {/* ───────── bottom bar ───────── */}
        <div style={styles.bottom}>
          <Stat label="Pools" value={loading ? "—" : String(pools.length)} />
          <Stat label="Best APY" value={bestApy != null ? formatApy(bestApy) : "—"} />
          <Stat label="Idle USDC" value={loading ? "—" : idleUsdc} />
          <Stat label="Network" value={networkLabel(wallet.network) || "Stellar"} />

          <form
            style={styles.addr}
            onSubmit={(e) => {
              e.preventDefault();
              const v = addrInput.trim();
              if (/^[CG][A-Z0-9]{30,}$/.test(v)) {
                window.open(
                  `https://stellar.expert/explorer/public/${v.startsWith("C") ? "contract" : "account"}/${v}`,
                  "_blank",
                  "noreferrer",
                );
              }
            }}
          >
            <input
              style={styles.addrInput}
              placeholder="G… / C… inspect address"
              value={addrInput}
              onChange={(e) => setAddrInput(e.target.value)}
              spellCheck={false}
            />
            <button type="submit" style={styles.go}>
              Go
            </button>
          </form>

          <WalletButton wallet={wallet} />

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
      </div>

      {/* keyframes + hover interactions that inline styles can't express */}
      <style>{globalCss}</style>
    </main>
  );
}

// ── sub-components ───────────────────────────────────────────────────────────

function Timeline({ active, connected }: { active: boolean; connected: boolean }) {
  return (
    <div style={styles.timeline}>
      <div
        className={active ? "ys-timeline-track ys-scanning" : "ys-timeline-track"}
        style={styles.timelineTrack}
      >
        {Array.from({ length: TICK_COUNT }).map((_, i) => {
          const tall = i % 6 === 2;
          return (
            <span
              key={i}
              className="ys-tick"
              style={{
                ...styles.tick,
                height: tall ? 18 : 11,
                background: tall ? "var(--ink)" : "#c7c7c0",
                animationDelay: `${(i * 90) % 2000}ms`,
              }}
            />
          );
        })}
      </div>
      <span style={{ ...styles.live, opacity: connected ? 1 : 0.4 }}>
        <span className={connected ? "ys-live-dot ys-live-on" : "ys-live-dot"} />
        {connected ? "LIVE" : "···"}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={styles.stat}>
      <b style={styles.statLabel}>{label}</b>
      <span style={styles.statValue}>{value}</span>
    </div>
  );
}

function EmptyStage({ loading, idleUsdc }: { loading: boolean; idleUsdc: string }) {
  return (
    <div style={styles.empty}>
      <div className="ys-cloud" style={styles.cloud} />
      <div style={styles.center}>
        <div className={loading ? "ys-ring ys-ring-pulse" : "ys-ring"} style={styles.ring} />
        <div style={styles.centerName}>YIELDSEEKER AGENT</div>
        <div style={styles.centerAmt}>{idleUsdc} USDC idle</div>
        <div style={styles.centerHint}>
          {loading ? "connecting…" : "scanning Blend pools…"}
        </div>
      </div>
    </div>
  );
}

function WalletButton({ wallet }: { wallet: ReturnType<typeof useFreighter> }) {
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
    return (
      <button
        style={styles.walletConnected}
        onClick={wallet.disconnect}
        title={`${wallet.address}\nClick to disconnect`}
      >
        <span className="ys-live-dot ys-live-on" />
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>
            {truncateAddress(wallet.address, 4, 4)}
          </span>
          <span style={{ fontSize: 9, color: "var(--mut)", letterSpacing: "0.06em" }}>
            {networkLabel(wallet.network)} · disconnect
          </span>
        </span>
      </button>
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
    padding: "8px 14px",
    display: "flex",
    alignItems: "center",
    gap: 9,
    whiteSpace: "nowrap",
    flexShrink: 0,
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

  button:hover:not(:disabled) { filter: brightness(0.97); }
  a[style]:hover { transform: translateY(-1px); }
  canvas { cursor: grab; }
  canvas:active { cursor: grabbing; }
`;
