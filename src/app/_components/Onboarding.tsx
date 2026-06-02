"use client";

import { useState } from "react";
import type { OnboardingState, OnboardingStep, RegisteredUser, StepKey } from "./useOnboarding";
import { formatUsdc, truncateAddress } from "./format";
import { stellarExpertUrl, testnetContractUrl, testnetTxUrl } from "./links";

// Testnet exec contract ids — surfaced as explorer links in the registered view.
const EXEC_POOL_ID = "CBI7WAUQ4NPQFZW4C3MDSVFAZJWV3RCLZSTTMA5OZ6BTPEQMOZZNSZ3Z";
const EXEC_USDC_CONTRACT_ID = "CD2R7WREEPGIAXZL4ASB76Y6PWTY6ZZXZ6C64AIKFDIG36YKQPNY6B2I";

interface Props {
  /** Connected Freighter address; null when disconnected. */
  ownerAddress: string | null;
  onboarding: OnboardingState;
  open: boolean;
  onClose: () => void;
}

const STEP_TITLES: Record<StepKey, string> = {
  deploy: "Create smart account",
  authorize: "Authorize agent",
  fund: "Get test USDC",
  register: "Activate",
};

const STEP_HINTS: Record<StepKey, string> = {
  deploy: "Deploy your personal OpenZeppelin smart account on Stellar testnet.",
  authorize: "Grant the agent a capped, on-chain rule to manage only your USDC.",
  fund: "We mint test USDC straight into your smart account — no external USDC needed.",
  register: "Hand off to the autonomous agent loop.",
};

/**
 * Per-user Freighter onboarding panel. Slides in from the right (matches
 * AnalysisPanel). Shows the registered dashboard slice when the connected owner
 * already has a smart account, otherwise a 4-step setup flow.
 */
export default function Onboarding({ ownerAddress, onboarding, open, onClose }: Props) {
  const {
    registered,
    loadingStatus,
    steps,
    running,
    error,
    smartWallet,
    start,
    agent,
    saUsdcStroops,
    resetDemo,
    resetting,
  } = onboarding;
  const [amount, setAmount] = useState("500");

  const amountNum = Number(amount);
  // The faucet caps each mint at 5,000 USDC (see /api/faucet).
  const amountValid = Number.isFinite(amountNum) && amountNum > 0 && amountNum <= 5000;

  return (
    <>
      <div
        onClick={onClose}
        style={{ ...styles.scrim, opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
      />
      <aside
        aria-hidden={!open}
        style={{ ...styles.panel, transform: open ? "translateX(0)" : "translateX(105%)" }}
      >
        {open && (
          <div style={styles.inner}>
            <div style={styles.header}>
              <div>
                <div style={styles.kicker}>{registered ? "YOUR ACCOUNT" : "GET STARTED"}</div>
                <h2 style={styles.title}>
                  {registered ? "Agent active" : "Onboard to YieldSeeker"}
                </h2>
                <div style={styles.subId}>
                  {ownerAddress ? truncateAddress(ownerAddress, 6, 6) : "connect a wallet"}
                </div>
              </div>
              <button onClick={onClose} aria-label="Close panel" style={styles.close}>
                ✕
              </button>
            </div>

            {!ownerAddress && (
              <div style={styles.reason}>
                Connect your Freighter wallet to create a smart account and let the agent manage
                your idle USDC.
              </div>
            )}

            {ownerAddress && loadingStatus && registered === null && (
              <div style={styles.reason}>Checking your account…</div>
            )}

            {ownerAddress && registered && (
              <RegisteredView user={registered} onResetDemo={resetDemo} resetting={resetting} />
            )}

            {ownerAddress && registered === false && (
              <>
                <div
                  style={{
                    ...styles.badge,
                    background: "var(--blue-soft)",
                    color: "var(--blue)",
                    borderColor: "var(--blue)",
                  }}
                >
                  ○ NOT YET ONBOARDED
                </div>

                <div style={styles.stepList}>
                  {steps.map((s, i) => (
                    <StepRow key={s.key} step={s} index={i + 1} />
                  ))}
                </div>

                <div style={styles.faucetNote}>
                  <span style={styles.faucetBadge}>SELF-SERVE</span>
                  We&rsquo;ll mint test USDC straight to your smart account — no external USDC
                  needed.
                </div>

                <div style={styles.amountBlock}>
                  <label style={styles.metricLabel} htmlFor="ys-fund-amount">
                    TEST USDC TO MINT
                  </label>
                  <div style={styles.amountRow}>
                    <input
                      id="ys-fund-amount"
                      style={styles.amountInput}
                      value={amount}
                      inputMode="decimal"
                      disabled={running}
                      onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                      spellCheck={false}
                    />
                    <span style={styles.amountUnit}>USDC</span>
                  </div>
                  <div style={styles.capHint}>
                    Faucet mints up to 5,000 USDC / request. Agent spending is then on-chain capped
                    at 5,000 USDC / day.
                  </div>
                </div>

                {saUsdcStroops !== null && (
                  <div style={styles.balanceReadout}>
                    <span style={styles.metricLabel}>SMART ACCOUNT USDC</span>
                    <span style={styles.balanceValue}>{formatUsdc(saUsdcStroops)} USDC</span>
                  </div>
                )}

                {error && <div style={styles.errorBox}>{error}</div>}

                <button
                  style={{ ...styles.cta, ...(running || !amountValid ? styles.ctaDisabled : {}) }}
                  disabled={running || !amountValid}
                  onClick={() => void start(amountNum)}
                >
                  {running ? "Setting up…" : "Get test USDC & activate"}
                </button>

                <div style={styles.fineprint}>
                  Step 3 mints our own testnet USDC into your smart account (we control the USDC
                  issuer on testnet), so you never need to source USDC. Step 2 is signed by a backend
                  demo owner: Freighter&rsquo;s <code style={styles.code}>signAuthEntry</code> only
                  signs the standard Soroban auth preimage, not the OpenZeppelin SmartAccount&rsquo;s
                  custom AuthPayload digest (which appends the context-rule ids). Steps 1 and 4 are
                  signed natively in your Freighter wallet.
                  {smartWallet && (
                    <>
                      {" "}
                      Smart account:{" "}
                      <a
                        href={testnetContractUrl(smartWallet)}
                        target="_blank"
                        rel="noreferrer"
                        style={styles.inlineLink}
                      >
                        {truncateAddress(smartWallet, 4, 4)} ↗
                      </a>
                    </>
                  )}
                  {agent && (
                    <>
                      {" "}
                      Agent signer: <code style={styles.code}>{truncateAddress(agent.agentPublicKey, 4, 4)}</code>.
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </aside>
    </>
  );
}

// ── sub-components ───────────────────────────────────────────────────────────

function RegisteredView({
  user,
  onResetDemo,
  resetting,
}: {
  user: RegisteredUser;
  onResetDemo: () => Promise<void>;
  resetting: boolean;
}) {
  const supplied = user.position.poolId ? formatUsdc(user.position.amountUsdc) : "0";

  // Pull the most recent supply tx hash from the activity log via meta (if any).
  // The activity log entries for "peruser" and "rebalance" carry { hashes: string[] }.
  // We surface the first hash as a "latest tx" link; the log is fetched on mount
  // via the SSE / polling path and lives in useLivingData, but since RegisteredView
  // only gets `user` we read it from a data attribute we don't have — instead we
  // derive this from the position meta exposed by the server (future) or skip for now.
  // Current approach: show a static link row for exec pool + USDC.

  return (
    <>
      <div style={styles.statusBanner}>
        <span className="ys-live-dot ys-live-on" />
        <span>Agent active — managing your USDC</span>
      </div>

      <div style={styles.grid}>
        {/* Smart account: clickable testnet contract link */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={styles.metricLabel}>SMART ACCOUNT</span>
          <a
            href={testnetContractUrl(user.smartWallet)}
            target="_blank"
            rel="noreferrer"
            style={styles.metricLink}
            title={user.smartWallet}
          >
            {truncateAddress(user.smartWallet, 5, 5)} ↗
          </a>
        </div>
        <Metric label="SUPPLIED" value={`${supplied} USDC`} accent />
        <Metric label="POOL RULE" value={`#${user.poolRuleId}`} mono />
        <Metric label="USDC RULE" value={`#${user.usdcRuleId} · capped`} mono />
      </div>

      <div style={styles.positionBlock}>
        <div style={styles.metricLabel}>CURRENT POSITION</div>
        {user.position.poolId ? (
          <>
            <div style={styles.positionAmt}>{supplied} USDC</div>
            <div style={styles.positionPool}>
              in{" "}
              <a
                href={stellarExpertUrl(user.position.poolId)}
                target="_blank"
                rel="noreferrer"
                style={styles.inlineLink}
              >
                {truncateAddress(user.position.poolId, 5, 5)} ↗
              </a>
              {" "}(mainnet reference pool)
            </div>
          </>
        ) : (
          <div style={styles.positionPool}>
            Idle — the agent will supply your USDC into the best eligible pool on its next tick.
          </div>
        )}
      </div>

      {/* Exec contracts block — testnet contract links */}
      <div style={styles.execBlock}>
        <div style={styles.metricLabel}>TESTNET EXEC CONTRACTS</div>
        <div style={styles.execRow}>
          <span style={styles.execLabel}>EXEC POOL</span>
          <a
            href={testnetContractUrl(EXEC_POOL_ID)}
            target="_blank"
            rel="noreferrer"
            style={styles.execLink}
            title={EXEC_POOL_ID}
          >
            {truncateAddress(EXEC_POOL_ID, 4, 4)} ↗
          </a>
        </div>
        <div style={styles.execRow}>
          <span style={styles.execLabel}>USDC</span>
          <a
            href={testnetContractUrl(EXEC_USDC_CONTRACT_ID)}
            target="_blank"
            rel="noreferrer"
            style={styles.execLink}
            title={EXEC_USDC_CONTRACT_ID}
          >
            {truncateAddress(EXEC_USDC_CONTRACT_ID, 4, 4)} ↗
          </a>
        </div>
      </div>

      <a
        href={testnetContractUrl(user.smartWallet)}
        target="_blank"
        rel="noreferrer"
        style={{ ...styles.cta, textDecoration: "none", display: "grid", placeItems: "center" }}
      >
        View smart account ↗
      </a>

      <button
        type="button"
        onClick={() => void onResetDemo()}
        disabled={resetting}
        style={{ ...styles.resetBtn, ...(resetting ? styles.ctaDisabled : {}) }}
        title="Forget this account in the demo registry and re-show onboarding"
      >
        {resetting ? "Resetting…" : "Reset demo"}
      </button>
      <div style={styles.resetHint}>
        Resets the in-memory demo registry for this wallet — your on-chain smart account is
        untouched; the onboarding re-appears so you can run the flow again.
      </div>
    </>
  );
}

function StepRow({ step, index }: { step: OnboardingStep; index: number }) {
  const mark =
    step.status === "done" ? "✓" : step.status === "error" ? "✕" : step.status === "active" ? "" : index;
  return (
    <div style={styles.stepRow}>
      <div
        style={{
          ...styles.stepDot,
          ...(step.status === "done" ? styles.stepDotDone : {}),
          ...(step.status === "active" ? styles.stepDotActive : {}),
          ...(step.status === "error" ? styles.stepDotError : {}),
        }}
        className={step.status === "active" ? "ys-step-spin" : undefined}
      >
        {step.status === "active" ? <span className="ys-step-ring" /> : mark}
      </div>
      <div style={styles.stepBody}>
        <div style={styles.stepTitle}>{STEP_TITLES[step.key]}</div>
        <div style={styles.stepHint}>
          {step.detail ? (
            step.txHash ? (
              <a href={testnetTxUrl(step.txHash)} target="_blank" rel="noreferrer" style={styles.inlineLink}>
                {step.detail.length > 42 ? truncateAddress(step.detail, 8, 8) : step.detail} ↗
              </a>
            ) : (
              step.detail
            )
          ) : (
            STEP_HINTS[step.key]
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
  mono,
}: {
  label: string;
  value: string;
  accent?: boolean;
  mono?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={styles.metricLabel}>{label}</span>
      <span
        style={{
          ...styles.metricValue,
          color: accent ? "var(--blue)" : "var(--ink)",
          fontSize: mono ? 13 : 18,
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ── styles ───────────────────────────────────────────────────────────────────

type S = React.CSSProperties;

const styles: Record<string, S> = {
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
    width: 380,
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
  title: { fontSize: 18, fontWeight: 700, marginTop: 6, lineHeight: 1.2 },
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
    fontSize: 12.5,
    color: "#5a5a60",
    background: "#f6f6f2",
    borderRadius: 10,
    padding: "11px 13px",
    lineHeight: 1.5,
  },
  statusBanner: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    background: "var(--blue-faint)",
    border: "1px solid var(--blue-soft)",
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--ink)",
  },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: "2px 0" },
  metricLabel: {
    fontSize: 9.5,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "var(--mut)",
    fontWeight: 500,
  },
  metricValue: { fontSize: 18, fontWeight: 700, wordBreak: "break-word" },
  metricLink: {
    fontSize: 13,
    fontWeight: 700,
    color: "#2b4cff",
    textDecoration: "none",
    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
    letterSpacing: "-0.01em",
    wordBreak: "break-word" as const,
  },
  execBlock: {
    background: "var(--chip)",
    borderRadius: 12,
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  execRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  execLabel: {
    fontSize: 9.5,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    color: "var(--mut)",
    fontWeight: 500,
  },
  execLink: {
    fontSize: 12,
    fontWeight: 600,
    color: "#2b4cff",
    textDecoration: "none",
    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
    letterSpacing: "-0.01em",
  },
  positionBlock: {
    background: "var(--chip)",
    borderRadius: 12,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  positionAmt: { fontSize: 22, fontWeight: 700 },
  positionPool: { fontSize: 12, color: "#5a5a60", lineHeight: 1.5 },
  // step list
  stepList: { display: "flex", flexDirection: "column", gap: 2 },
  stepRow: { display: "flex", gap: 13, padding: "10px 0", alignItems: "flex-start" },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: "50%",
    background: "var(--chip)",
    color: "var(--mut)",
    display: "grid",
    placeItems: "center",
    fontSize: 12,
    fontWeight: 700,
    flexShrink: 0,
    position: "relative",
  },
  stepDotDone: { background: "var(--blue)", color: "#fff" },
  stepDotActive: { background: "var(--blue-soft)", color: "var(--blue)" },
  stepDotError: { background: "#fde8e8", color: "#d23f3f" },
  stepBody: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 },
  stepTitle: { fontSize: 13.5, fontWeight: 600 },
  stepHint: { fontSize: 11.5, color: "#7a7a80", lineHeight: 1.5, wordBreak: "break-word" },
  // amount
  amountBlock: { display: "flex", flexDirection: "column", gap: 7 },
  amountRow: {
    display: "flex",
    alignItems: "center",
    background: "var(--chip)",
    borderRadius: 12,
    padding: "10px 14px",
    gap: 8,
  },
  amountInput: {
    flex: 1,
    border: 0,
    background: "transparent",
    fontSize: 18,
    fontWeight: 700,
    outline: "none",
    color: "var(--ink)",
    minWidth: 0,
  },
  amountUnit: { fontSize: 12, color: "var(--mut)", fontWeight: 600, letterSpacing: "0.08em" },
  capHint: { fontSize: 10.5, color: "var(--mut)", lineHeight: 1.5 },
  // self-serve faucet
  faucetNote: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    fontSize: 12.5,
    color: "#5a5a60",
    background: "var(--blue-faint)",
    border: "1px solid var(--blue-soft)",
    borderRadius: 10,
    padding: "11px 13px",
    lineHeight: 1.5,
  },
  faucetBadge: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.12em",
    color: "var(--blue)",
    background: "#fff",
    border: "1px solid var(--blue-soft)",
    borderRadius: 999,
    padding: "2px 8px",
  },
  balanceReadout: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    background: "var(--chip)",
    borderRadius: 12,
    padding: "12px 14px",
  },
  balanceValue: {
    fontSize: 16,
    fontWeight: 700,
    color: "var(--blue)",
    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
  },
  errorBox: {
    fontSize: 12,
    color: "#d23f3f",
    background: "#fdeaea",
    border: "1px solid #f3c6c6",
    borderRadius: 10,
    padding: "10px 12px",
    lineHeight: 1.45,
    wordBreak: "break-word",
  },
  cta: {
    background: "var(--blue)",
    color: "#fff",
    borderRadius: 12,
    padding: "14px 18px",
    fontSize: 14,
    fontWeight: 600,
    transition: "transform 140ms ease, opacity 140ms ease",
  },
  ctaDisabled: { opacity: 0.45, cursor: "not-allowed" },
  resetBtn: {
    background: "transparent",
    color: "var(--mut)",
    border: "1px solid var(--line)",
    borderRadius: 12,
    padding: "11px 16px",
    fontSize: 12.5,
    fontWeight: 600,
    letterSpacing: "0.02em",
    transition: "color 140ms ease, border-color 140ms ease",
  },
  resetHint: { fontSize: 10, color: "var(--mut)", lineHeight: 1.5, marginTop: -6 },
  fineprint: { fontSize: 10.5, color: "var(--mut)", lineHeight: 1.6, marginTop: "auto" },
  code: {
    fontFamily: "var(--font-plex-mono), ui-monospace, monospace",
    background: "var(--chip)",
    padding: "1px 4px",
    borderRadius: 4,
    fontSize: 10,
    color: "var(--ink)",
  },
  inlineLink: { color: "var(--blue)", textDecoration: "none", fontWeight: 600 },
};
