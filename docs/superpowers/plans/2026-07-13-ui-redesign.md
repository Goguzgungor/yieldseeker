# YieldSeeker "Bench Instrument" UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the YieldSeeker dashboard into a "bench instrument": warm-paper chrome around a dark glass screen where the living network glows — UI only, zero behavior changes.

**Architecture:** Move static styling from inline `style={}` objects into a design-token + class system in `globals.css` (dynamic, data-driven values stay inline). The stage becomes a dark "screen" panel; everything live (graph, rail, TX feed, ticker, readout) renders on it, everything touchable stays on paper. Canvas paint code in `NetworkGraph` gets a color-for-color remap.

**Tech Stack:** Next.js 16 App Router, React 19, plain CSS (`globals.css`), `next/font` (IBM Plex Mono + IBM Plex Sans), react-force-graph-2d canvas painting. No new dependencies.

**Source of truth:** `docs/superpowers/specs/2026-07-13-ui-redesign-design.md` — read it first. Its §2 token block and §4 paint-mapping table are copied verbatim into the tasks below; if you ever see a discrepancy, the spec wins.

## Global Constraints

- **UI only.** Identical component props, hooks, handlers, data flow, SSE/polling, wallet logic. If a change would alter *what happens* on click/load (not just how it looks), stop — it's out of scope. (Two spec-sanctioned exceptions, both pure presentation state: the TX-feed collapse `useState`, and a native `<details>` for onboarding fineprint.)
- **No new dependencies.** Only addition: `IBM_Plex_Sans` via the existing `next/font/google` mechanism.
- **No text below 10px. Hit targets ≥32px** (close ✕ and wallet-disconnect widen from 30px).
- **Class prefix `ys-`** (existing convention). All static styles as classes; inline only for data-driven values (panel transform, risk-bar width/color, ticker-dot color, step-dot state).
- **Laptop-first.** Tablet degradation at ≤1024px / ≤880px (Task 7). No phone layout. No `prefers-color-scheme` handling.
- **Test gate per task:** `npx tsc --noEmit` (expect: no output, exit 0) + visual check in the running app. There is no component-test infra (`src/app/**` is excluded from the vitest glob) — do not add one. `npm test` must stay green (verified in Task 7; nothing here touches `src/lib`).
- **Visual checks:** run `npm run dev` (populated graph needs the agent loop / a cached DB snapshot; if the graph is empty you're seeing the legitimate cold-start state — verify chrome + empty state, and defer populated-graph checks to Task 7's full pass).
- **Commit after every task** (repo convention: plain `style:`/`feat:` prefixes, `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer).

## File Structure

| File | Role in this plan |
|---|---|
| `src/app/globals.css` | Grows task-by-task: tokens+base (T1), shell/chrome/screen classes (T2), TX-feed classes (T4), shared panel + analysis classes (T5), onboarding classes (T6), media queries + alias removal (T7) |
| `src/app/layout.tsx` | T1: add IBM Plex Sans |
| `src/app/_components/LivingNetwork.tsx` | T2: classNames, screen wrapper, rail/note/ticker onto screen, SVG icons, LIVE chip, scan/copy fixes, delete `styles` object + injected `<style>` |
| `src/app/_components/NetworkGraph.tsx` | T3: paint-color remap, zoom padding, reduced-motion particle speed |
| `src/app/_components/TransactionsPanel.tsx` | T4: glass restyle + collapse toggle |
| `src/app/_components/AnalysisPanel.tsx` | T5: paper hierarchy; defines shared `.ys-panel` family |
| `src/app/_components/Onboarding.tsx` | T6: paper restyle, `<details>` fineprint, step dots |

Task order matters: T2 turns the screen dark, T3 makes the graph legible on it. **Known intermediate state:** after T2 and before T3, the populated graph is low-contrast on the dark screen (ink-on-dark). Verify T2 via chrome + empty state; that's expected.

---

### Task 1: Design-token foundation + IBM Plex Sans

**Files:**
- Modify: `src/app/globals.css` (full rewrite, below)
- Modify: `src/app/layout.tsx` (full rewrite, below)

**Interfaces:**
- Consumes: nothing.
- Produces (all later tasks rely on these): CSS custom properties exactly as in the code below (`--page`, `--paper`, `--paper-2`, `--ink`, `--ink-2`, `--mut`, `--line`, `--line-2`, `--screen`, `--screen-glass`, `--screen-line`, `--screen-line-2`, `--screen-ink`, `--screen-mut`, `--blue`, `--blue-soft`, `--blue-faint`, `--blue-bright`, `--blue-glow`, `--ok`, `--ok-bright`, `--warn`, `--warn-bright`, `--err`, `--err-bright`, `--r-sm`, `--r-md`, `--r-lg`, `--r-pill`); legacy aliases `--bg`, `--chip` (kept until Task 7 so not-yet-migrated inline styles keep working); font variables `--font-plex-mono`, `--font-plex-sans`; utility class `.ys-prose`.

- [ ] **Step 1: Rewrite `src/app/globals.css`** with exactly:

```css
/* ── design tokens ─────────────────────────────────────────────────────────
   Two worlds: "paper" (the instrument body — chrome, panels, controls) and
   "screen" (the dark glass viewport the living network renders on). */
:root {
  /* paper (chrome) */
  --page: #efede6;
  --paper: #faf9f5;
  --paper-2: #f1efe9;
  --ink: #141416;
  --ink-2: #55555c;
  --mut: #7d7d84;
  --line: #e3e1d9;
  --line-2: #cfcdc4;

  /* screen (viewport) */
  --screen: #0c0e13;
  --screen-glass: rgba(20, 24, 36, 0.85);
  --screen-line: rgba(255, 255, 255, 0.08);
  --screen-line-2: rgba(255, 255, 255, 0.14);
  --screen-ink: #e8eaf2;
  --screen-mut: #8a90a3;

  /* accent — brand blue on paper, luminous variant on the screen */
  --blue: #2b4cff;
  --blue-soft: rgba(43, 76, 255, 0.14);
  --blue-faint: rgba(43, 76, 255, 0.07);
  --blue-bright: #6d86ff;
  --blue-glow: rgba(109, 134, 255, 0.35);

  /* semantic (paper / screen) */
  --ok: #1f9d55;
  --ok-bright: #34d17b;
  --warn: #d08700;
  --warn-bright: #f0a83c;
  --err: #d23f3f;
  --err-bright: #ef6a6a;

  /* radii */
  --r-sm: 8px;
  --r-md: 12px;
  --r-lg: 16px;
  --r-pill: 999px;

  /* legacy aliases — removed in the cleanup task once no inline style
     references them anymore */
  --bg: var(--paper);
  --chip: var(--paper-2);
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body {
  height: 100%;
  background: var(--page);
  color: var(--ink);
  font-family: var(--font-plex-mono), ui-monospace, "SFMono-Regular", monospace;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

button {
  font-family: inherit;
  color: inherit;
  border: 0;
  background: none;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
}

input {
  font-family: inherit;
}

::selection {
  background: var(--blue-soft);
}

/* Sentence-length prose reads in Plex Sans; mono stays for data/labels. */
.ys-prose {
  font-family: var(--font-plex-sans), system-ui, sans-serif;
}

/* ── accessibility ── */
:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
}

.ys-screen :focus-visible {
  outline-color: var(--blue-bright);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 2: Rewrite `src/app/layout.tsx`** with exactly:

```tsx
import type { ReactNode } from "react";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-mono",
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

export const metadata = {
  title: "YieldSeeker · Stellar",
  description: "Autonomous DeFi yield agent on Stellar — the Living Network.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${plexMono.variable} ${plexSans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output, exit 0.

- [ ] **Step 4: Visual verify**

Run: `AGENT_LOOP_ENABLED=0 npm run dev`, open http://localhost:3000.
Expected: the app looks essentially like before (muted labels a touch darker — intended, `--mut` changed `#9a9aa0`→`#7d7d84`). Nothing broken, no missing colors (legacy `--bg`/`--chip` aliases cover old inline references).

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "style: design-token foundation (paper/screen palettes) + IBM Plex Sans

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Bench-instrument shell — LivingNetwork (frame, chrome, dark screen, rail, ticker)

**Files:**
- Modify: `src/app/globals.css` (append classes below)
- Modify: `src/app/_components/LivingNetwork.tsx` (JSX + helpers replaced below; hooks untouched)

**Interfaces:**
- Consumes: Task 1 tokens + `.ys-prose`.
- Produces: `.ys-screen` container class (Tasks 3/4 render inside it); global keyframes/classes other components already use — `.ys-live-dot`, `.ys-live-on`, `.ys-step-ring` (Onboarding renders these today via the injected style block, which this task deletes — they MUST land in `globals.css` here); `canvas` cursor rules.

**Known intermediate state:** the populated force-graph is low-contrast on the new dark screen until Task 3. Verify chrome/empty-state only.

- [ ] **Step 1: Append to `src/app/globals.css`:**

```css
/* ── frame ── */
.ys-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: clamp(8px, 2vw, 28px);
  background: var(--page);
}

.ys-frame {
  --bottom-h: 84px;
  position: relative;
  width: min(1280px, 100%);
  height: min(820px, calc(100vh - 40px));
  min-height: 600px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  background: var(--paper);
  box-shadow:
    0 1px 2px rgba(20, 20, 22, 0.04),
    0 8px 24px -12px rgba(20, 20, 22, 0.12);
}

/* ── top bar (paper) ── */
.ys-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 64px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 18px;
  z-index: 12;
}

.ys-glyph {
  width: 34px;
  height: 34px;
  border: 1.5px solid var(--ink);
  border-radius: 9px;
  display: grid;
  place-items: center;
  transform: rotate(45deg);
  flex-shrink: 0;
}

.ys-glyph i {
  display: block;
  width: 11px;
  height: 11px;
  border: 1.5px solid var(--ink);
}

.ys-title-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--paper-2);
  border: 1px solid var(--line);
  border-radius: var(--r-pill);
  padding: 8px 14px;
  font-size: 11.5px;
  white-space: nowrap;
}

.ys-title-pill b {
  font-weight: 600;
}

.ys-tagline {
  color: var(--mut);
}

.ys-live-chip {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  letter-spacing: 0.12em;
  font-weight: 600;
  color: var(--mut);
  flex-shrink: 0;
}

.ys-play {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  background: var(--ink);
  color: #fff;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  transition: background 140ms ease;
}

.ys-play:hover {
  background: #2a2a2e;
}

/* ── the screen (dark glass viewport) ── */
.ys-screen {
  position: absolute;
  top: 64px;
  left: 14px;
  right: 14px;
  bottom: var(--bottom-h);
  border-radius: var(--r-lg);
  background:
    radial-gradient(120% 90% at 50% 0%, rgba(109, 134, 255, 0.06), transparent 55%),
    var(--screen);
  box-shadow:
    inset 0 0 0 1px var(--screen-line),
    inset 0 12px 40px -24px rgba(0, 0, 0, 0.8);
  overflow: hidden;
}

/* protocol rail — ON the screen */
.ys-rail {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 8;
}

.ys-rail-dot {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background: rgba(20, 24, 36, 0.7);
  box-shadow: inset 0 0 0 1px var(--screen-line-2);
  display: grid;
  place-items: center;
  color: var(--screen-mut);
  font-weight: 700;
  font-size: 14px;
  position: relative;
  transition: transform 160ms ease;
}

.ys-rail-dot:hover {
  transform: scale(1.06);
}

.ys-rail-dot.on {
  background: var(--blue-bright);
  color: #0c0e13;
  box-shadow: 0 0 18px -2px var(--blue-glow);
}

.ys-rail-label {
  position: absolute;
  left: 56px;
  top: 50%;
  transform: translateY(-50%);
  white-space: nowrap;
  background: var(--screen-glass);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  box-shadow: inset 0 0 0 1px var(--screen-line);
  color: var(--screen-ink);
  font-size: 11.5px;
  padding: 7px 11px;
  border-radius: var(--r-sm);
  opacity: 0;
  pointer-events: none;
  transition: opacity 140ms ease;
}

.ys-rail-dot.on .ys-rail-label,
.ys-rail-dot:hover .ys-rail-label {
  opacity: 1;
}

/* status readout — ON the screen, top-center */
.ys-note {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 11px;
  color: var(--screen-mut);
  z-index: 7;
  text-align: center;
  white-space: nowrap;
  max-width: 70%;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* empty stage (cold start) — ON the screen */
.ys-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}

.ys-cloud {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 560px;
  height: 460px;
  transform: translate(-50%, -50%);
  background-image:
    radial-gradient(1px 1px at 10% 20%, rgba(232, 234, 242, 0.4), transparent),
    radial-gradient(1px 1px at 30% 60%, rgba(232, 234, 242, 0.33), transparent),
    radial-gradient(1px 1px at 50% 30%, rgba(232, 234, 242, 0.4), transparent),
    radial-gradient(1px 1px at 70% 70%, rgba(232, 234, 242, 0.27), transparent),
    radial-gradient(1px 1px at 85% 40%, rgba(232, 234, 242, 0.33), transparent),
    radial-gradient(1px 1px at 22% 80%, rgba(232, 234, 242, 0.27), transparent),
    radial-gradient(1px 1px at 60% 85%, rgba(232, 234, 242, 0.33), transparent),
    radial-gradient(1px 1px at 42% 48%, rgba(232, 234, 242, 0.4), transparent),
    radial-gradient(1px 1px at 78% 22%, rgba(232, 234, 242, 0.27), transparent);
  background-size:
    120px 120px, 90px 90px, 140px 140px, 100px 100px, 110px 110px,
    130px 130px, 95px 95px, 80px 80px, 115px 115px;
  opacity: 0.5;
}

.ys-center {
  position: relative;
  text-align: center;
  z-index: 2;
}

.ys-ring {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--blue-bright);
  margin: 0 auto;
  box-shadow:
    0 0 0 6px rgba(109, 134, 255, 0.14),
    0 0 0 14px rgba(109, 134, 255, 0.07),
    0 0 24px var(--blue-glow);
}

@keyframes ys-pulse-ring {
  0%,
  100% {
    box-shadow:
      0 0 0 6px rgba(109, 134, 255, 0.14),
      0 0 0 14px rgba(109, 134, 255, 0.07),
      0 0 24px var(--blue-glow);
  }
  50% {
    box-shadow:
      0 0 0 10px rgba(109, 134, 255, 0.14),
      0 0 0 22px rgba(109, 134, 255, 0.07),
      0 0 30px var(--blue-glow);
  }
}

.ys-ring-pulse {
  animation: ys-pulse-ring 2.2s ease-in-out infinite;
}

.ys-center-name {
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--screen-mut);
  margin-top: 14px;
}

.ys-center-amt {
  font-size: 15px;
  font-weight: 700;
  margin-top: 4px;
  color: var(--screen-ink);
}

.ys-center-hint {
  font-size: 11px;
  color: var(--screen-mut);
  margin-top: 10px;
}

/* activity ticker — ON the screen, bottom-left */
.ys-ticker {
  position: absolute;
  left: 12px;
  bottom: 12px;
  max-width: calc(100% - 320px);
  display: flex;
  align-items: center;
  gap: 9px;
  background: var(--screen-glass);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  box-shadow: inset 0 0 0 1px var(--screen-line);
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 11.5px;
  z-index: 9;
}

.ys-ticker-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.ys-ticker-kind {
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-size: 10px;
  color: var(--screen-mut);
  font-weight: 600;
  flex-shrink: 0;
}

.ys-ticker-msg {
  color: var(--screen-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.ys-ticker-link {
  flex-shrink: 0;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--blue-bright);
  text-decoration: none;
  white-space: nowrap;
}

/* ── bottom bar (paper) ── */
.ys-bottom {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 84px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 18px;
  z-index: 12;
}

.ys-stat {
  background: var(--paper-2);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: 9px 14px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-shrink: 0;
  text-align: left;
}

.ys-stat b {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mut);
  font-weight: 500;
}

.ys-stat span {
  font-size: 15px;
  font-weight: 600;
}

.ys-stat .ys-stat-dim {
  font-size: 13px;
  font-weight: 500;
  color: var(--mut);
}

.ys-stat .ys-stat-accent {
  color: var(--blue);
}

button.ys-stat {
  cursor: pointer;
  transition: border-color 140ms ease;
}

button.ys-stat:hover {
  border-color: var(--line-2);
}

.ys-spacer {
  flex: 1;
}

.ys-connect {
  background: var(--blue);
  color: #fff;
  border-radius: var(--r-md);
  padding: 13px 18px;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 140ms ease, transform 140ms ease;
}

.ys-connect:hover:not(:disabled) {
  background: #2341e6;
}

.ys-connect:active {
  transform: translateY(1px);
}

.ys-connect-link {
  text-decoration: none;
  display: grid;
  place-items: center;
}

.ys-wallet {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  display: flex;
  align-items: stretch;
  white-space: nowrap;
  flex-shrink: 0;
  overflow: hidden;
}

.ys-wallet-chip {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 12px 8px 14px;
  transition: background 140ms ease;
}

.ys-wallet-chip:hover {
  background: var(--paper-2);
}

.ys-wallet-addr {
  font-size: 13px;
  font-weight: 600;
}

.ys-wallet-status {
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--mut);
}

.ys-wallet-status.on {
  color: var(--blue);
}

.ys-wallet-x {
  width: 32px;
  display: grid;
  place-items: center;
  font-size: 11px;
  color: var(--mut);
  border-left: 1px solid var(--line);
  transition: color 140ms ease, background 140ms ease;
}

.ys-wallet-x:hover {
  color: var(--err);
  background: #fdf1f1;
}

.ys-scan {
  position: relative;
  width: 74px;
  height: 74px;
  border-radius: 50%;
  background: var(--ink);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: 11px;
  letter-spacing: 0.1em;
  font-weight: 600;
  flex-shrink: 0;
  transition: background 200ms ease, opacity 140ms ease;
}

.ys-scan:disabled {
  opacity: 0.45;
}

.ys-scan.scanning {
  background: var(--blue);
  font-size: 10px;
}

.ys-scan.scanning::after {
  content: "";
  position: absolute;
  inset: -7px;
  border-radius: 50%;
  border: 2px solid transparent;
  border-top-color: var(--blue);
  animation: ys-spin 1.2s linear infinite;
}

/* ── shared live/spinner primitives (used by Onboarding + wallet chip) ── */
.ys-live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--mut);
  display: inline-block;
  flex-shrink: 0;
}

.ys-live-on {
  background: var(--blue);
  animation: ys-blink 2.4s ease-in-out infinite;
}

@keyframes ys-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.ys-step-ring {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 2px solid var(--blue-soft);
  border-top-color: var(--blue);
  display: inline-block;
  animation: ys-spin 0.8s linear infinite;
}

@keyframes ys-spin {
  to {
    transform: rotate(360deg);
  }
}

canvas {
  cursor: grab;
}

canvas:active {
  cursor: grabbing;
}
```

- [ ] **Step 2: Rewrite `src/app/_components/LivingNetwork.tsx`.** Keep everything from the top of the file through the line `const active = scanning && !paused;` (imports, `PROTOCOLS`, `useAgeLabel`, the whole hook/memo block inside `LivingNetwork()`) **byte-for-byte unchanged**. Replace everything from the `return (` of `LivingNetwork` to the end of the file with:

```tsx
  return (
    <main className="ys-page">
      <div className="ys-frame">
        {/* ───────── top bar (paper) ───────── */}
        <div className="ys-top">
          <div className="ys-glyph">
            <i />
          </div>
          <div className="ys-title-pill" title="Autonomous DeFi yield agent">
            <b>YieldSeeker</b>
            <span>· Stellar</span>
            <span className="ys-tagline">· autonomous agent</span>
          </div>
          <span className="ys-live-chip">
            <span className={paused ? "ys-live-dot" : "ys-live-dot ys-live-on"} />
            {paused ? "PAUSED" : "LIVE"}
          </span>
          <button
            className="ys-play"
            onClick={() => setPaused((p) => !p)}
            aria-label={paused ? "Resume" : "Pause"}
            title={paused ? "Resume scanning" : "Pause scanning"}
          >
            {paused ? (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M3 1.5 L10.5 6 L3 10.5 Z" fill="currentColor" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <rect x="2.5" y="1.5" width="2.6" height="9" rx="1" fill="currentColor" />
                <rect x="6.9" y="1.5" width="2.6" height="9" rx="1" fill="currentColor" />
              </svg>
            )}
          </button>
        </div>

        {/* ───────── the screen (dark glass viewport) ───────── */}
        <div className="ys-screen">
          {/* protocol rail */}
          <div className="ys-rail">
            {PROTOCOLS.map((r) => {
              const on = activeProtocols.has(r.key);
              return (
                <div key={r.key} className={on ? "ys-rail-dot on" : "ys-rail-dot"}>
                  {r.glyph}
                  <span className="ys-rail-label">{on ? r.label : `${r.label} · soon`}</span>
                </div>
              );
            })}
          </div>

          {/* status readout */}
          <div className="ys-note">
            {loading
              ? "Connecting to YieldSeeker…"
              : pools.length === 0
                ? "First scan in progress — agent discovering pools…"
                : `live network — agent watching ${pools.length} mainnet pool${
                    pools.length === 1 ? "" : "s"
                  } across ${activeProtocols.size} protocol${activeProtocols.size === 1 ? "" : "s"}`}
          </div>

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
            <div className="ys-ticker">
              <span
                className="ys-ticker-dot"
                style={{ background: tickerDotColor(latestLog.kind) }}
              />
              <span className="ys-ticker-kind">{latestLog.kind}</span>
              <span className="ys-ticker-msg">{latestLog.message}</span>
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
                      className="ys-ticker-link"
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

        {/* ───────── bottom bar (paper) ───────── */}
        <div className="ys-bottom">
          <Stat label="Pools" value={loading ? "—" : String(pools.length)} />
          <Stat label="Best APY" value={bestApy != null ? formatApy(bestApy) : "—"} />
          <Stat label="Agent TXs" value={loading ? "—" : String(myTxs.length)} />
          {onboarding.registered ? (
            <button
              type="button"
              className="ys-stat"
              onClick={() => setOnboardOpen(true)}
              title="View your smart account"
            >
              <b className="ys-stat-accent">ACCOUNT</b>
              <span>{truncateAddress(onboarding.registered.smartWallet, 4, 4)}</span>
            </button>
          ) : (
            <Stat label="Network" value={networkLabel(wallet.network) || "Stellar"} />
          )}
          {ageLabel && (
            <div className="ys-stat">
              <b>Updated</b>
              <span className="ys-stat-dim">{ageLabel}</span>
            </div>
          )}

          {/* flexible spacer keeps the wallet + scan controls right-aligned */}
          <div className="ys-spacer" />

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
            className={active ? "ys-scan scanning" : "ys-scan"}
            onClick={rescan}
            disabled={paused}
            title={paused ? "Resume to scan" : "Trigger a scan"}
          >
            {active ? "SCANNING" : "SCAN"}
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
    </main>
  );
}

// ── sub-components ───────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="ys-stat">
      <b>{label}</b>
      <span>{value}</span>
    </div>
  );
}

function EmptyStage({ loading }: { loading: boolean }) {
  return (
    <div className="ys-empty">
      <div className="ys-cloud" />
      <div className="ys-center">
        <div className={loading ? "ys-ring ys-ring-pulse" : "ys-ring"} />
        <div className="ys-center-name">YIELDSEEKER AGENT</div>
        <div className="ys-center-amt">Autonomous yield agent</div>
        <div className="ys-center-hint">
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
        className="ys-connect ys-connect-link"
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
      <div className="ys-wallet">
        <button
          className="ys-wallet-chip"
          onClick={onOpenAccount}
          title={`${wallet.address}\nClick to ${registered ? "view your smart account" : "set up your account"}`}
        >
          <span className="ys-live-dot ys-live-on" />
          <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <span className="ys-wallet-addr">{truncateAddress(wallet.address, 4, 4)}</span>
            <span className={registered ? "ys-wallet-status on" : "ys-wallet-status"}>
              {registered ? "agent active · manage" : "set up account"}
            </span>
          </span>
        </button>
        <button
          className="ys-wallet-x"
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
    <button className="ys-connect" onClick={wallet.connect} disabled={wallet.connecting}>
      {wallet.connecting ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}

// Ticker kind → dot color (bright semantic variants — the ticker sits on the
// dark screen).
const tickerDotColor = (kind: string): string => {
  if (kind === "rebalance") return "var(--ok-bright)";
  if (kind === "error" || kind === "skip") return "var(--err-bright)";
  if (kind === "decision") return "var(--blue-bright)";
  return "var(--screen-mut)";
};
```

This deletes: the whole `const styles` object, `tickerKindColor`/`tickerDotStyle`, the `type S` alias, the `globalCss` template string, and the `<style>{globalCss}</style>` element. Nothing else in the file changes. Note the structural moves: the rail and note now live INSIDE the screen div; `title` moved onto the pill (the dead "i" dot is gone); `CACHE`→`Updated`, `YOUR SA`→`ACCOUNT`, scan button text is single-line.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output, exit 0. (If `S` or `styles` are reported unused/undefined anywhere, you missed a deletion or left a reference.)

- [ ] **Step 4: Visual verify** (`AGENT_LOOP_ENABLED=0 npm run dev`)

- Page shows a warm-paper card on a slightly darker desk background, with a soft shadow.
- Dark glass screen inset in the middle; on cold start: luminous breathing ring, dust, readable labels.
- Rail chips sit on the screen's left; hover scales + shows glass tooltip; active protocols luminous.
- Top bar: glyph · title pill with muted tagline · LIVE chip breathing · SVG pause icon (click → PAUSED, triangle icon).
- Bottom bar: bordered chips, `UPDATED` label, wallet button, round SCAN button one-line; click SCAN → blue + rotating arc + "SCANNING" (loop disabled: it may finish fast).
- Ticker (if any activity) renders dark glass bottom-left.
- Expected flaw: populated graph (if your DB has a snapshot) is low-contrast — fixed in Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/app/_components/LivingNetwork.tsx
git commit -m "style: bench-instrument shell — dark glass screen, paper chrome, rail/ticker on screen

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: NetworkGraph — dark-screen paint palette

**Files:**
- Modify: `src/app/_components/NetworkGraph.tsx` (surgical edits below; all layout/physics/hit-area logic untouched)

**Interfaces:**
- Consumes: renders inside `.ys-screen` (Task 2); canvas stays transparent — the screen provides the background.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Replace the color constants** (lines right after the `_forceCollide` block):

Old:
```ts
const INK = "#0b0b0c";
const BLUE = "#2b4cff";
const DIM = "#5a5a5e";
const GREY_DOT = "#b8b8bc";
```

New:
```ts
// Screen-world palette (the canvas renders on the dark glass viewport).
const SCREEN_INK = "#e8eaf2";
const SCREEN_MUT = "#8a90a3";
const BLUE_BRIGHT = "#6d86ff";
const PILL_FILL = "#1a1e29";
const PILL_STROKE = "rgba(255,255,255,0.14)";
const PILL_FILL_DIM = "rgba(26,30,41,0.55)";
const PILL_STROKE_DIM = "rgba(255,255,255,0.07)";
```

- [ ] **Step 2: Add a reduced-motion hook** directly below the new constants (spec §7: particles slow to 0.002, no scanning speed-up):

```ts
/** Tracks the OS "reduce motion" preference so canvas particles calm down. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return reduced;
}
```

Inside `NetworkGraph()`, first line of the body: `const reducedMotion = usePrefersReducedMotion();`

- [ ] **Step 3: Apply the paint remap.** Exact replacements (old → new), top to bottom:

1. `fg.zoomToFit(500, 60);` → `fg.zoomToFit(500, 48);`
2. `linkColor`: `l.chosen ? BLUE : l.eligible ? "rgba(11,11,12,0.5)" : "rgba(11,11,12,0.18)"` → `l.chosen ? BLUE_BRIGHT : l.eligible ? "rgba(232,234,242,0.30)" : "rgba(232,234,242,0.10)"`
3. `linkDirectionalParticleSpeed={scanning ? 0.012 : 0.006}` → `linkDirectionalParticleSpeed={reducedMotion ? 0.002 : scanning ? 0.012 : 0.006}`
4. `linkDirectionalParticleColor={() => BLUE}` → `linkDirectionalParticleColor={() => BLUE_BRIGHT}`
5. Dust: `ctx.fillStyle = "rgba(11,11,12,0.28)";` → `ctx.fillStyle = "rgba(232,234,242,0.12)";`
6. Agent halos/core:
   - `ctx.fillStyle = "rgba(43,76,255,0.06)";` → `"rgba(109,134,255,0.07)"`
   - `ctx.fillStyle = "rgba(43,76,255,0.13)";` → `"rgba(109,134,255,0.16)"`
   - `ctx.fillStyle = BLUE;` (r=5 core) → `ctx.fillStyle = BLUE_BRIGHT;`
   - `ctx.fillStyle = "#9a9aa0";` (YIELDSEEKER AGENT) → `ctx.fillStyle = SCREEN_MUT;`
   - `ctx.fillStyle = INK;` (agent status label) → `ctx.fillStyle = SCREEN_INK;`
7. Pool pill fill+stroke — replace this block:
```ts
            roundRect(ctx, rectX, rectY, w, h, 4.5);
            ctx.fillStyle = isDim ? DIM : INK;
            ctx.fill();
            if (isChosen || selected) ctx.restore();
```
with:
```ts
            roundRect(ctx, rectX, rectY, w, h, 4.5);
            ctx.fillStyle = isDim ? PILL_FILL_DIM : PILL_FILL;
            ctx.fill();
            ctx.lineWidth = 0.5;
            ctx.strokeStyle = isDim ? PILL_STROKE_DIM : PILL_STROKE;
            ctx.stroke();
            if (isChosen || selected) ctx.restore();
```
8. Chosen glow: `ctx.shadowColor = "rgba(43,76,255,0.45)"; ctx.shadowBlur = 14;` → `ctx.shadowColor = "rgba(109,134,255,0.40)"; ctx.shadowBlur = 12;`
9. Chosen/selected outline: `ctx.strokeStyle = BLUE;` → `ctx.strokeStyle = BLUE_BRIGHT;` (the one after `ctx.lineWidth = 1;`)
10. Best-only dashed outline: `ctx.strokeStyle = "rgba(43,76,255,0.42)";` → `"rgba(109,134,255,0.55)"`
11. TX badge: `ctx.shadowColor = "rgba(43,76,255,0.5)";` → `"rgba(109,134,255,0.5)"`; `ctx.fillStyle = BLUE;` (badge fill) → `ctx.fillStyle = BLUE_BRIGHT;`; `ctx.fillStyle = "#ffffff";` (badge text, the `bText` one) → `ctx.fillStyle = "#0c0e13";` (white on `#6d86ff` fails contrast — spec §4)
12. Ripple: `` ctx.strokeStyle = `rgba(43,76,255,${alpha.toFixed(2)})`; `` → `` ctx.strokeStyle = `rgba(109,134,255,${alpha.toFixed(2)})`; `` and `const alpha = (1 - frac) * 0.52;` → `const alpha = (1 - frac) * 0.45;`
13. ✷ mark colors: `isChosen ? "#9db0ff" : isBestOnly ? "rgba(255,255,255,0.88)" : isDim ? "rgba(255,255,255,0.55)" : "#ffffff"` → `isChosen ? "#a9b8ff" : isBestOnly ? "rgba(232,234,242,0.9)" : isDim ? "rgba(232,234,242,0.45)" : SCREEN_INK`
14. Pill label text: `ctx.fillStyle = isDim ? "rgba(255,255,255,0.78)" : "#ffffff";` → `ctx.fillStyle = isDim ? "rgba(232,234,242,0.55)" : SCREEN_INK;`
15. Endpoint dot: `const dotColor = isChosen ? BLUE : isDim ? GREY_DOT : INK;` → `const dotColor = isChosen ? BLUE_BRIGHT : isDim ? "rgba(232,234,242,0.35)" : SCREEN_INK;` and its chosen halo `ctx.strokeStyle = "rgba(43,76,255,0.28)";` → `"rgba(109,134,255,0.28)"`
16. Ineligible reason caption: `ctx.fillStyle = "#9a9aa0";` → `ctx.fillStyle = SCREEN_MUT;`

After these, `grep -n "INK\|GREY_DOT\|\"#2b4cff\"\|43,76,255" src/app/_components/NetworkGraph.tsx` must only hit `SCREEN_INK` — zero old constants or old rgba values left (also confirm `DIM` is gone; `const DIM` and `const GREY_DOT` declarations are deleted with Step 1).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output, exit 0.

- [ ] **Step 5: Visual verify** (needs a populated graph — run `npm run dev` with your normal env; if no data, seed by letting the loop tick once, or defer to Task 7's full pass)

- Pills: dark glass with faint white stroke, light mono text; ineligible ones dimmer with dashed faint links.
- Best eligible pool: dashed luminous outline. Chosen (funds deployed): luminous border, soft glow, blue particles flowing.
- Agent: luminous core + halo, readable labels. Dust faint. Everything legible on the dark screen.
- With OS "Reduce Motion" enabled (macOS: System Settings → Accessibility → Display), particles crawl slowly even while scanning.

- [ ] **Step 6: Commit**

```bash
git add src/app/_components/NetworkGraph.tsx
git commit -m "style: dark-screen graph palette — glass pills, luminous accents

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: TransactionsPanel — dark glass feed with collapse

**Files:**
- Modify: `src/app/globals.css` (append classes below)
- Modify: `src/app/_components/TransactionsPanel.tsx` (full rewrite below)

**Interfaces:**
- Consumes: Task 1 tokens, `.ys-prose`; renders inside `.ys-screen` (Task 2).
- Produces: nothing consumed by later tasks. Props (`txs`, `poolLabel`) unchanged.

- [ ] **Step 1: Append to `src/app/globals.css`:**

```css
/* ── transactions feed (dark glass, ON the screen) ── */
.ys-tx {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 248px;
  max-height: calc(100% - 24px);
  display: flex;
  flex-direction: column;
  background: var(--screen-glass);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  box-shadow:
    inset 0 0 0 1px var(--screen-line),
    0 12px 32px -16px rgba(0, 0, 0, 0.6);
  border-radius: var(--r-md);
  padding: 12px 12px 8px;
  z-index: 9;
}

.ys-tx.collapsed {
  padding-bottom: 12px;
}

.ys-tx-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ys-tx-kicker {
  font-size: 10px;
  letter-spacing: 0.16em;
  color: var(--screen-mut);
  font-weight: 600;
  flex: 1;
}

.ys-tx-count {
  font-size: 10px;
  font-weight: 700;
  color: var(--blue-bright);
  background: rgba(109, 134, 255, 0.14);
  border-radius: var(--r-pill);
  padding: 1px 8px;
  min-width: 16px;
  text-align: center;
}

.ys-tx-toggle {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  color: var(--screen-mut);
  border-radius: 6px;
  transition: color 140ms ease, background 140ms ease;
}

.ys-tx-toggle:hover {
  color: var(--screen-ink);
  background: rgba(255, 255, 255, 0.06);
}

.ys-tx-toggle svg {
  transition: transform 200ms ease;
}

.ys-tx.collapsed .ys-tx-toggle svg {
  transform: rotate(-90deg);
}

.ys-tx-sub {
  font-size: 10px;
  color: var(--screen-mut);
  margin-top: 3px;
  line-height: 1.4;
}

.ys-tx-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
}

.ys-tx-empty {
  font-size: 11px;
  color: var(--screen-mut);
  line-height: 1.5;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 10px;
  padding: 11px 12px;
}

.ys-tx-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
  text-decoration: none;
  color: var(--screen-ink);
  background: rgba(255, 255, 255, 0.04);
  box-shadow: inset 0 0 0 1px var(--screen-line);
  border-radius: 10px;
  padding: 9px 11px;
  transition: box-shadow 140ms ease, transform 140ms ease;
}

.ys-tx-row:hover {
  box-shadow: inset 0 0 0 1px var(--screen-line-2);
  transform: translateY(-1px);
}

.ys-tx-row-top {
  display: flex;
  align-items: center;
  gap: 7px;
}

.ys-tx-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--ok-bright);
  background: rgba(52, 209, 123, 0.12);
  border-radius: 5px;
  padding: 2px 6px;
}

.ys-tx-amount {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--screen-ink);
}

.ys-tx-ago {
  font-size: 10px;
  color: var(--screen-mut);
  margin-left: auto;
}

.ys-tx-row-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ys-tx-hash {
  font-size: 11px;
  font-weight: 600;
  color: var(--blue-bright);
}

.ys-tx-ext {
  font-size: 11px;
  color: var(--blue-bright);
}
```

- [ ] **Step 2: Rewrite `src/app/_components/TransactionsPanel.tsx`** with exactly:

```tsx
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
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output, exit 0.

- [ ] **Step 4: Visual verify**

- Feed renders as dark glass top-right of the screen; empty copy is the new short one, in Plex Sans.
- Chevron collapses to a single header row (chevron rotates); expand restores. Keyboard: Tab reaches the chevron, focus ring is luminous blue.
- With TXs present: green SUPPLY badge, light amount, muted time, luminous hash; row hover lifts 1px.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/app/_components/TransactionsPanel.tsx
git commit -m "style: glass transactions feed on the screen, collapsible

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: AnalysisPanel — paper hierarchy (defines the shared panel family)

**Files:**
- Modify: `src/app/globals.css` (append classes below)
- Modify: `src/app/_components/AnalysisPanel.tsx` (full rewrite below)

**Interfaces:**
- Consumes: Task 1 tokens, `.ys-prose`.
- Produces (Task 6 reuses these exact classes): `.ys-scrim`, `.ys-panel`, `.ys-panel--analysis`, `.ys-panel-inner`, `.ys-panel-head`, `.ys-kicker`, `.ys-panel-title`, `.ys-sub-id`, `.ys-close`, `.ys-badge` (+ `.on`/`.off`), `.ys-reason`, `.ys-metric-grid`, `.ys-metric`, `.ys-metric-label`, `.ys-metric-value` (+ `.accent`), `.ys-cta`, `.ys-cta-2`, `.ys-inline-link`.

- [ ] **Step 1: Append to `src/app/globals.css`:**

```css
/* ── slide-over paper panels (analysis + onboarding) ── */
.ys-scrim {
  position: absolute;
  inset: 0;
  background: rgba(12, 14, 19, 0.18);
  transition: opacity 240ms ease;
  z-index: 30;
}

.ys-panel {
  --panel-w: 380px;
  position: absolute;
  top: 12px;
  right: 12px;
  bottom: 12px;
  width: min(var(--panel-w), calc(100vw - 32px));
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  box-shadow: 0 24px 60px -28px rgba(11, 11, 12, 0.35);
  transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
  z-index: 31;
  overflow: hidden;
}

.ys-panel--analysis {
  --panel-w: 360px;
}

.ys-panel-inner {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 22px;
  height: 100%;
  overflow-y: auto;
}

.ys-panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.ys-kicker {
  font-size: 10px;
  letter-spacing: 0.18em;
  color: var(--mut);
  font-weight: 500;
}

.ys-panel-title {
  font-size: 20px;
  font-weight: 700;
  margin-top: 6px;
  line-height: 1.2;
  word-break: break-word;
}

.ys-sub-id {
  font-size: 11.5px;
  color: var(--mut);
  margin-top: 4px;
}

.ys-close {
  width: 32px;
  height: 32px;
  border-radius: var(--r-sm);
  background: var(--paper-2);
  display: grid;
  place-items: center;
  font-size: 12px;
  color: var(--ink-2);
  flex-shrink: 0;
  transition: background 140ms ease;
}

.ys-close:hover {
  background: var(--line);
}

.ys-badge {
  align-self: flex-start;
  font-size: 11px;
  font-weight: 600;
  padding: 6px 11px;
  border-radius: var(--r-pill);
  border: 1px solid;
  letter-spacing: 0.04em;
}

.ys-badge.on {
  background: var(--blue-soft);
  color: var(--blue);
  border-color: var(--blue);
}

.ys-badge.off {
  background: var(--paper-2);
  color: var(--ink-2);
  border-color: var(--line-2);
}

.ys-reason {
  font-size: 12.5px;
  color: var(--ink-2);
  background: var(--paper-2);
  border-radius: 10px;
  padding: 11px 13px;
  line-height: 1.5;
}

/* hairline-divided 2×2 metric grid */
.ys-metric-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
}

.ys-metric-grid > .ys-metric {
  padding: 10px 0 10px 14px;
  border-bottom: 1px solid var(--line);
  border-left: 1px solid var(--line);
}

.ys-metric-grid > .ys-metric:nth-child(odd) {
  border-left: 0;
  padding-left: 0;
}

.ys-metric-grid > .ys-metric:nth-last-child(-n + 2) {
  border-bottom: 0;
}

.ys-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ys-metric-label {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--mut);
  font-weight: 500;
}

.ys-metric-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--ink);
  word-break: break-word;
}

.ys-metric-value.accent {
  color: var(--blue);
}

/* risk bar */
.ys-risk {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.ys-risk-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.ys-risk-num {
  font-size: 13px;
  font-weight: 700;
}

.ys-risk-track {
  height: 6px;
  border-radius: var(--r-pill);
  background: var(--paper-2);
  box-shadow: inset 0 0 0 1px var(--line);
  overflow: hidden;
}

.ys-risk-fill {
  height: 100%;
  border-radius: var(--r-pill);
  transition: width 400ms ease;
}

.ys-risk-scale {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--mut);
  letter-spacing: 0.06em;
}

/* agent rationale — quiet quote block */
.ys-rationale {
  background: var(--blue-faint);
  border-left: 2px solid var(--blue);
  border-radius: 0 10px 10px 0;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.ys-rationale-head {
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--blue);
  font-weight: 600;
}

.ys-rationale-text {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--ink);
}

/* panel CTAs */
.ys-panel-links {
  display: flex;
  flex-direction: column;
  gap: 9px;
  margin-top: auto;
  padding-top: 6px;
}

.ys-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 13px 16px;
  border-radius: var(--r-md);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  background: var(--blue);
  color: #fff;
  transition: background 140ms ease, transform 140ms ease;
}

.ys-cta:hover:not(:disabled) {
  background: #2341e6;
}

.ys-cta:active:not(:disabled) {
  transform: translateY(1px);
}

.ys-cta:disabled {
  opacity: 0.45;
}

.ys-cta-2 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 13px 16px;
  border-radius: var(--r-md);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  background: var(--paper-2);
  color: var(--ink);
  border: 1px solid var(--line);
  transition: border-color 140ms ease, transform 140ms ease;
}

.ys-cta-2:hover {
  border-color: var(--line-2);
}

.ys-inline-link {
  color: var(--blue);
  text-decoration: none;
  font-weight: 600;
}
```

- [ ] **Step 2: Rewrite `src/app/_components/AnalysisPanel.tsx`** with exactly:

```tsx
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
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output, exit 0.

- [ ] **Step 4: Visual verify** (needs pools; click a pool pill)

- Panel slides in over the dark screen — reads as a paper report; scrim dims the app.
- Kicker/title/address hierarchy clear; badge correct for eligible/ineligible; ineligible reason in Plex Sans.
- Metric grid shows hairline dividers (no floating boxes); APY accented blue.
- Risk bar: thin, correct color by score (≤35 green, ≤65 amber, else red).
- Chosen pool (if funds deployed): rationale renders as left-bordered quote block.
- CTAs full width: solid blue primary, bordered secondary. ✕ is 32px, focus-visible ring shows.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/app/_components/AnalysisPanel.tsx
git commit -m "style: analysis panel paper hierarchy + shared ys-panel family

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Onboarding — paper restyle, step dots, collapsible fineprint

**Files:**
- Modify: `src/app/globals.css` (append classes below)
- Modify: `src/app/_components/Onboarding.tsx` (full rewrite below)

**Interfaces:**
- Consumes: Task 5's `.ys-scrim`, `.ys-panel`, `.ys-panel-inner`, `.ys-panel-head`, `.ys-kicker`, `.ys-panel-title`, `.ys-sub-id`, `.ys-close`, `.ys-badge on`, `.ys-reason`, `.ys-metric-grid`/`.ys-metric`/`.ys-metric-label`/`.ys-metric-value`, `.ys-cta`, `.ys-inline-link`; Task 2's `.ys-live-dot ys-live-on`, `.ys-step-ring`; Task 1's `.ys-prose`.
- Produces: nothing consumed by later tasks. Props unchanged.

- [ ] **Step 1: Append to `src/app/globals.css`:**

```css
/* ── onboarding specifics ── */
.ys-status-banner {
  display: flex;
  align-items: center;
  gap: 9px;
  background: var(--blue-faint);
  border: 1px solid var(--blue-soft);
  border-radius: var(--r-md);
  padding: 12px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}

.ys-metric-link {
  font-size: 13px;
  font-weight: 700;
  color: var(--blue);
  text-decoration: none;
  word-break: break-word;
}

.ys-metric-value.small {
  font-size: 13px;
}

.ys-block {
  background: var(--paper-2);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ys-position-amt {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.ys-position-pool {
  font-size: 12px;
  color: var(--ink-2);
  line-height: 1.5;
}

.ys-exec-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ys-exec-link {
  font-size: 12px;
  font-weight: 600;
  color: var(--blue);
  text-decoration: none;
}

/* step list */
.ys-steps {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ys-step {
  display: flex;
  gap: 13px;
  padding: 10px 0;
  align-items: flex-start;
}

.ys-step-dot {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--line-2);
  color: var(--mut);
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.ys-step-dot.done {
  background: var(--blue);
  box-shadow: none;
  color: #fff;
}

.ys-step-dot.active {
  background: var(--blue-soft);
  box-shadow: none;
  color: var(--blue);
}

.ys-step-dot.error {
  background: #fde8e8;
  box-shadow: none;
  color: var(--err);
}

.ys-step-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.ys-step-title {
  font-size: 13.5px;
  font-weight: 600;
}

.ys-step-hint {
  font-size: 11.5px;
  color: var(--ink-2);
  line-height: 1.5;
  word-break: break-word;
}

/* faucet + amount */
.ys-faucet-note {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12.5px;
  color: var(--ink-2);
  background: var(--blue-faint);
  border: 1px solid var(--blue-soft);
  border-radius: 10px;
  padding: 11px 13px;
  line-height: 1.5;
}

.ys-faucet-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--blue);
  background: #fff;
  border: 1px solid var(--blue-soft);
  border-radius: var(--r-pill);
  padding: 2px 8px;
  font-family: var(--font-plex-mono), ui-monospace, monospace;
}

.ys-amount {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.ys-amount-row {
  display: flex;
  align-items: center;
  background: var(--paper-2);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: 10px 14px;
  gap: 8px;
  transition: border-color 140ms ease, box-shadow 140ms ease;
}

.ys-amount-row:focus-within {
  border-color: var(--blue);
  box-shadow: 0 0 0 2px var(--blue-soft);
}

.ys-amount-input {
  flex: 1;
  border: 0;
  background: transparent;
  font-size: 18px;
  font-weight: 700;
  outline: none;
  color: var(--ink);
  min-width: 0;
}

.ys-amount-unit {
  font-size: 12px;
  color: var(--mut);
  font-weight: 600;
  letter-spacing: 0.08em;
}

.ys-cap-hint {
  font-size: 10.5px;
  color: var(--mut);
  line-height: 1.5;
}

.ys-balance {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--paper-2);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: 12px 14px;
}

.ys-balance-value {
  font-size: 16px;
  font-weight: 700;
  color: var(--blue);
}

.ys-error {
  font-size: 12px;
  color: var(--err);
  background: #fdeaea;
  border: 1px solid #f3c6c6;
  border-radius: 10px;
  padding: 10px 12px;
  line-height: 1.45;
  word-break: break-word;
}

.ys-reset {
  background: transparent;
  color: var(--mut);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: 11px 16px;
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
  transition: color 140ms ease, border-color 140ms ease;
}

.ys-reset:hover:not(:disabled) {
  color: var(--ink-2);
  border-color: var(--line-2);
}

.ys-reset:disabled {
  opacity: 0.45;
}

.ys-reset-hint {
  font-size: 10.5px;
  color: var(--mut);
  line-height: 1.5;
  margin-top: -6px;
}

/* collapsible fineprint */
.ys-fineprint {
  margin-top: auto;
  font-size: 10.5px;
}

.ys-fineprint summary {
  cursor: pointer;
  color: var(--mut);
  font-weight: 600;
  letter-spacing: 0.04em;
  list-style-position: inside;
}

.ys-fineprint summary:hover {
  color: var(--ink-2);
}

.ys-fineprint p {
  color: var(--mut);
  line-height: 1.6;
  margin-top: 8px;
  font-size: 11px;
}

.ys-code {
  font-family: var(--font-plex-mono), ui-monospace, monospace;
  background: var(--paper-2);
  padding: 1px 4px;
  border-radius: 4px;
  font-size: 10px;
  color: var(--ink);
}
```

- [ ] **Step 2: Rewrite `src/app/_components/Onboarding.tsx`.** Keep the imports, `EXEC_POOL_ID` / `EXEC_USDC_CONTRACT_ID` constants, `Props`, `STEP_TITLES`, `STEP_HINTS`, and the component docstring unchanged. Replace the `Onboarding` component body and everything below it with:

```tsx
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
        className="ys-scrim"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
      />
      <aside
        aria-hidden={!open}
        className="ys-panel"
        style={{ transform: open ? "translateX(0)" : "translateX(105%)" }}
      >
        {open && (
          <div className="ys-panel-inner">
            <div className="ys-panel-head">
              <div>
                <div className="ys-kicker">{registered ? "YOUR ACCOUNT" : "GET STARTED"}</div>
                <h2 className="ys-panel-title">
                  {registered ? "Agent active" : "Onboard to YieldSeeker"}
                </h2>
                <div className="ys-sub-id">
                  {ownerAddress ? truncateAddress(ownerAddress, 6, 6) : "connect a wallet"}
                </div>
              </div>
              <button onClick={onClose} aria-label="Close panel" className="ys-close">
                ✕
              </button>
            </div>

            {!ownerAddress && (
              <div className="ys-reason ys-prose">
                Connect your Freighter wallet to create a smart account and let the agent manage
                your idle USDC.
              </div>
            )}

            {ownerAddress && loadingStatus && registered === null && (
              <div className="ys-reason ys-prose">Checking your account…</div>
            )}

            {ownerAddress && registered && (
              <RegisteredView user={registered} onResetDemo={resetDemo} resetting={resetting} />
            )}

            {ownerAddress && registered === false && (
              <>
                <div className="ys-badge on">○ NOT YET ONBOARDED</div>

                <div className="ys-steps">
                  {steps.map((s, i) => (
                    <StepRow key={s.key} step={s} index={i + 1} />
                  ))}
                </div>

                <div className="ys-faucet-note ys-prose">
                  <span className="ys-faucet-badge">SELF-SERVE</span>
                  We&rsquo;ll mint test USDC straight to your smart account — no external USDC
                  needed.
                </div>

                <div className="ys-amount">
                  <label className="ys-metric-label" htmlFor="ys-fund-amount">
                    TEST USDC TO MINT
                  </label>
                  <div className="ys-amount-row">
                    <input
                      id="ys-fund-amount"
                      className="ys-amount-input"
                      value={amount}
                      inputMode="decimal"
                      disabled={running}
                      onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                      spellCheck={false}
                    />
                    <span className="ys-amount-unit">USDC</span>
                  </div>
                  <div className="ys-cap-hint ys-prose">
                    Faucet mints up to 5,000 USDC / request. Agent spending is then on-chain capped
                    at 5,000 USDC / day.
                  </div>
                </div>

                {saUsdcStroops !== null && (
                  <div className="ys-balance">
                    <span className="ys-metric-label">SMART ACCOUNT USDC</span>
                    <span className="ys-balance-value">{formatUsdc(saUsdcStroops)} USDC</span>
                  </div>
                )}

                {error && <div className="ys-error ys-prose">{error}</div>}

                <button
                  className="ys-cta"
                  style={{ justifyContent: "center" }}
                  disabled={running || !amountValid}
                  onClick={() => void start(amountNum)}
                >
                  {running ? "Setting up…" : "Get test USDC & activate"}
                </button>

                <details className="ys-fineprint">
                  <summary>How signing works</summary>
                  <p className="ys-prose">
                    Step 3 mints our own testnet USDC into your smart account (we control the USDC
                    issuer on testnet), so you never need to source USDC. Step 2 is signed by a
                    backend demo owner: Freighter&rsquo;s <code className="ys-code">signAuthEntry</code>{" "}
                    only signs the standard Soroban auth preimage, not the OpenZeppelin
                    SmartAccount&rsquo;s custom AuthPayload digest (which appends the context-rule
                    ids). Steps 1 and 4 are signed natively in your Freighter wallet.
                    {smartWallet && (
                      <>
                        {" "}
                        Smart account:{" "}
                        <a
                          href={testnetContractUrl(smartWallet)}
                          target="_blank"
                          rel="noreferrer"
                          className="ys-inline-link"
                        >
                          {truncateAddress(smartWallet, 4, 4)} ↗
                        </a>
                      </>
                    )}
                    {agent && (
                      <>
                        {" "}
                        Agent signer:{" "}
                        <code className="ys-code">{truncateAddress(agent.agentPublicKey, 4, 4)}</code>.
                      </>
                    )}
                  </p>
                </details>
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

  return (
    <>
      <div className="ys-status-banner">
        <span className="ys-live-dot ys-live-on" />
        <span>Agent active — managing your USDC</span>
      </div>

      <div className="ys-metric-grid">
        {/* Smart account: clickable testnet contract link */}
        <div className="ys-metric">
          <span className="ys-metric-label">SMART ACCOUNT</span>
          <a
            href={testnetContractUrl(user.smartWallet)}
            target="_blank"
            rel="noreferrer"
            className="ys-metric-link"
            title={user.smartWallet}
          >
            {truncateAddress(user.smartWallet, 5, 5)} ↗
          </a>
        </div>
        <Metric label="SUPPLIED" value={`${supplied} USDC`} accent />
        <Metric label="POOL RULE" value={`#${user.poolRuleId}`} small />
        <Metric label="USDC RULE" value={`#${user.usdcRuleId} · capped`} small />
      </div>

      <div className="ys-block">
        <div className="ys-metric-label">CURRENT POSITION</div>
        {user.position.poolId ? (
          <>
            <div className="ys-position-amt">{supplied} USDC</div>
            <div className="ys-position-pool ys-prose">
              in{" "}
              <a
                href={stellarExpertUrl(user.position.poolId)}
                target="_blank"
                rel="noreferrer"
                className="ys-inline-link"
              >
                {truncateAddress(user.position.poolId, 5, 5)} ↗
              </a>{" "}
              (mainnet reference pool)
            </div>
          </>
        ) : (
          <div className="ys-position-pool ys-prose">
            Idle — the agent will supply your USDC into the best eligible pool on its next tick.
          </div>
        )}
      </div>

      {/* Exec contracts block — testnet contract links */}
      <div className="ys-block">
        <div className="ys-metric-label">TESTNET EXEC CONTRACTS</div>
        <div className="ys-exec-row">
          <span className="ys-metric-label">EXEC POOL</span>
          <a
            href={testnetContractUrl(EXEC_POOL_ID)}
            target="_blank"
            rel="noreferrer"
            className="ys-exec-link"
            title={EXEC_POOL_ID}
          >
            {truncateAddress(EXEC_POOL_ID, 4, 4)} ↗
          </a>
        </div>
        <div className="ys-exec-row">
          <span className="ys-metric-label">USDC</span>
          <a
            href={testnetContractUrl(EXEC_USDC_CONTRACT_ID)}
            target="_blank"
            rel="noreferrer"
            className="ys-exec-link"
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
        className="ys-cta"
        style={{ justifyContent: "center" }}
      >
        View smart account ↗
      </a>

      <button
        type="button"
        onClick={() => void onResetDemo()}
        disabled={resetting}
        className="ys-reset"
        title="Forget this account in the demo registry and re-show onboarding"
      >
        {resetting ? "Resetting…" : "Reset demo"}
      </button>
      <div className="ys-reset-hint ys-prose">
        Resets the in-memory demo registry for this wallet — your on-chain smart account is
        untouched; the onboarding re-appears so you can run the flow again.
      </div>
    </>
  );
}

function StepRow({ step, index }: { step: OnboardingStep; index: number }) {
  const mark =
    step.status === "done" ? "✓" : step.status === "error" ? "✕" : step.status === "active" ? "" : index;
  const dotClass =
    step.status === "done"
      ? "ys-step-dot done"
      : step.status === "active"
        ? "ys-step-dot active"
        : step.status === "error"
          ? "ys-step-dot error"
          : "ys-step-dot";
  return (
    <div className="ys-step">
      <div className={dotClass}>
        {step.status === "active" ? <span className="ys-step-ring" /> : mark}
      </div>
      <div className="ys-step-body">
        <div className="ys-step-title">{STEP_TITLES[step.key]}</div>
        <div className="ys-step-hint ys-prose">
          {step.detail ? (
            step.txHash ? (
              <a href={testnetTxUrl(step.txHash)} target="_blank" rel="noreferrer" className="ys-inline-link">
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
  small,
}: {
  label: string;
  value: string;
  accent?: boolean;
  small?: boolean;
}) {
  return (
    <div className="ys-metric">
      <span className="ys-metric-label">{label}</span>
      <span
        className={[
          "ys-metric-value",
          accent ? "accent" : "",
          small ? "small" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </span>
    </div>
  );
}
```

This deletes the entire `styles` object and `type S` at the bottom of the file. Note: the `Metric` prop `mono` is renamed to `small` (it only ever controlled font-size 13 — the class name now says what it does; both call sites are inside this same file and are updated above).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output, exit 0.

- [ ] **Step 4: Visual verify** (open via wallet chip / ACCOUNT button; without Freighter you can still verify the disconnected state: "Connect your Freighter wallet…" prose renders in the panel)

- Setup view: badge, 4 steps with hairline number rings, faucet note, amount input (focus ring on the row), CTA full-width centered; "How signing works" is collapsed — opens to the full explanation.
- Registered view: banner with breathing dot, hairline metric grid (SUPPLIED accented; rule ids smaller), 28px position amount, exec-contracts block, centered CTA, quiet reset button + hint.
- All sentence-prose renders in Plex Sans; labels/numbers stay mono.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/app/_components/Onboarding.tsx
git commit -m "style: onboarding panel restyle — step rings, collapsible fineprint

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Tablet degradation, alias cleanup, full verification pass

**Files:**
- Modify: `src/app/globals.css` (append media queries; remove legacy aliases)

**Interfaces:**
- Consumes: everything above.
- Produces: final state.

- [ ] **Step 1: Append to `src/app/globals.css`:**

```css
/* ── tablet degradation (laptop-first; nothing below ~768px is a target) ── */
@media (max-width: 1024px) {
  .ys-tagline {
    display: none;
  }

  .ys-tx {
    width: 220px;
  }
}

@media (max-width: 880px) {
  .ys-frame {
    --bottom-h: 132px;
  }

  .ys-bottom {
    height: auto;
    min-height: 84px;
    flex-wrap: wrap;
    align-content: center;
    padding: 10px 14px;
    row-gap: 8px;
  }

  .ys-screen {
    left: 10px;
    right: 10px;
  }

  .ys-rail-dot {
    width: 40px;
    height: 40px;
  }
}
```

- [ ] **Step 2: Remove the legacy aliases.** First prove nothing references them:

Run: `grep -rn "var(--bg)\|var(--chip)" src/`
Expected: no matches. (If there are matches, migrate those spots to `var(--paper)` / `var(--paper-2)` first.)

Then delete these two lines (and their comment) from `:root` in `globals.css`:

```css
  /* legacy aliases — removed in the cleanup task once no inline style
     references them anymore */
  --bg: var(--paper);
  --chip: var(--paper-2);
```

- [ ] **Step 3: Typecheck + unit tests**

Run: `npx tsc --noEmit`
Expected: no output, exit 0.
Run: `npm test`
Expected: all existing tests pass (nothing in `src/lib` was touched).

- [ ] **Step 4: Full visual pass** (spec §11 checklist — `npm run dev` with your normal env for populated states)

- Visitor (no wallet): paper card, dark screen; the TX feed shows its empty state (the per-user filter yields no rows for visitors — current behavior, unchanged).
- Cold start: EmptyStage breathing ring on glass.
- Populated graph: eligible/ineligible/best/chosen pill treatments; ripple on new TX; readable at arm's length.
- TX feed: expanded / collapsed / empty.
- Ticker with each kind color if observable.
- Analysis panel open over the screen; onboarding setup + registered views; paused state (PAUSED chip, disabled scan); scanning state (blue + arc).
- Resize to 1024px and 880px: tagline drops, feed narrows, bottom bar wraps without overlapping the screen.
- Keyboard-only pass: Tab order reaches pause, chevron, stats button, wallet, scan, panel close; focus rings visible on both paper and screen.
- OS Reduce Motion: DOM animations stop, particles crawl.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "style: tablet degradation + legacy token cleanup

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
