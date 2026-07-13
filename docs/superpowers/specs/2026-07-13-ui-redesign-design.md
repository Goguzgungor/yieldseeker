# YieldSeeker UI Redesign — "Bench Instrument"

**Date:** 2026-07-13
**Status:** Approved
**Scope:** UI only. Zero behavior, API, data-flow, or dependency changes (one exception: a second `next/font` face from the same IBM Plex family).

## Goal

Take the existing light "paper + Plex Mono" dashboard from coherent-but-flat to a precise, daily-use instrument: a warm-paper body (controls, stats, reports) around a **dark glass screen** where the living network glows. Optimized for daily use — calm motion, good density, readability — not demo spectacle.

**The rule that drives every layout decision:** everything *live* (graph, protocol rail, TX feed, ticker, status readout) renders **on the screen** (dark); everything the user *touches or reads* (top bar, stat chips, wallet, scan button, slide-in panels) stays **on paper** (light).

## User decisions (locked)

| Question | Decision |
|---|---|
| Visual direction | Instrument hybrid: light paper chrome + dark glass viewport stage |
| Structural scope | Polish + targeted layout fixes; laptop/desktop-first, graceful to tablet (~768px); no phone layout |
| Optimization target | Daily-use product (calm, dense, utilitarian) |
| Design approval | Approved as presented, no modifications |

## 1. CSS architecture

**Chosen: design tokens + classes in `globals.css`.** Extend the existing CSS-variable block into a full token system and move static component styling from inline `style={}` objects to classes. The injected `<style>{globalCss}</style>` string in `LivingNetwork.tsx` is absorbed into `globals.css`.

- Dynamic, data-driven values stay inline: panel `transform` open/close, risk-bar `width`/color, ticker kind-dot color, step-dot state merging.
- Components keep identical structure, props, hooks, handlers. No new dependencies (rejected Tailwind: churn in a lean repo; rejected staying fully inline: can't express hover/focus/media/`prefers-reduced-motion`).

## 2. Design tokens

```css
/* paper (chrome) */
--page:    #efede6;   /* desk behind the card */
--paper:   #faf9f5;   /* instrument body (card bg) */
--paper-2: #f1efe9;   /* chip fill (replaces --chip) */
--ink:     #141416;
--ink-2:   #55555c;   /* secondary text */
--mut:     #7d7d84;   /* labels — bumped from #9a9aa0 for contrast at small sizes */
--line:    #e3e1d9;
--line-2:  #cfcdc4;   /* stronger hairline / hover border */

/* screen (viewport) */
--screen:        #0c0e13;               /* blue-black glass */
--screen-glass:  rgba(20, 24, 36, 0.85); /* raised panels on screen (+ backdrop blur) */
--screen-line:   rgba(255, 255, 255, 0.08);
--screen-line-2: rgba(255, 255, 255, 0.14);
--screen-ink:    #e8eaf2;
--screen-mut:    #8a90a3;

/* accent */
--blue:        #2b4cff;                  /* brand blue — paper world */
--blue-soft:   rgba(43, 76, 255, 0.14);
--blue-faint:  rgba(43, 76, 255, 0.07);
--blue-bright: #6d86ff;                  /* luminous variant — screen world */
--blue-glow:   rgba(109, 134, 255, 0.35);

/* semantic (paper / screen) */
--ok: #1f9d55;    --ok-bright: #34d17b;
--warn: #d08700;  --warn-bright: #f0a83c;
--err: #d23f3f;   --err-bright: #ef6a6a;
```

**Type scale (px):** 10 (micro labels — nothing smaller anywhere), 11.5 (captions), 13 (body), 15 (values), 18 (panel metric values), 20 (panel titles), 28 (position amount). Uppercase micro labels get 0.10–0.14em letter-spacing.

**Fonts:** IBM Plex Mono stays the identity/data face (numbers, addresses, labels, buttons, titles, kickers). Add **IBM Plex Sans** via `next/font/google` (self-hosted by Next) for sentence-length prose: panel body text, hints, step descriptions, fineprint, error messages. Exposed as `--font-plex-sans`.

**Spacing:** 4 / 8 / 12 / 16 / 20 / 24. **Radii:** 8 (small controls), 12 (chips/cards), 16 (panels/screen), 999 (pills).

**Shadows:** card `0 1px 2px rgba(20,20,22,0.04), 0 8px 24px -12px rgba(20,20,22,0.12)`; slide-over panels keep `0 24px 60px -28px rgba(11,11,12,0.35)`; glass panels `0 12px 32px -16px rgba(0,0,0,0.6)`.

## 3. Layout (per region)

### Frame
- Page bg `--page`; the 1280×820 card keeps its dimensions, bg `--paper`, radius 16, hairline border, card shadow above. The card now reads as an object on a desk.

### Top bar (paper, unchanged position)
- Keep rotated-square glyph logo.
- Pill: "**YieldSeeker** · Stellar" with muted "· autonomous agent" suffix (suffix hidden ≤1024px). The dead "i" info dot is removed.
- New LIVE/PAUSED chip beside the pause control: breathing dot (blue when live, grey when paused) + micro label. Semantics: reflects the existing client `paused` toggle only — `!paused` → LIVE, `paused` → PAUSED (no new state).
- Pause/play: drawn SVG icons (two bars / triangle), not `⏸`/`▶` text glyphs. Same toggle semantics as today.

### Screen (was "stage")
- The stage region (below top bar, above bottom bar) becomes an inset rounded-16 panel: bg `--screen`, 14px horizontal inset, 1px inner hairline `--screen-line`, subtle inner shadow + faint radial vignette (CSS only) for glass depth.
- `NetworkGraph` canvas fills it (canvas stays transparent; the wrapper is the screen).

### Protocol rail (moves INSIDE the screen, top-left, vertical)
- Dark glass chips (46px; 40px ≤880px): active = luminous fill `--blue-bright` on dark + soft glow, glyph in near-black; dormant = dim `--screen-line-2` outline, `--screen-mut` glyph.
- Hover tooltip: dark glass pill with label / "Label · soon". Same hover-reveal behavior.

### Status readout (was floating "note")
- Inside the screen, top-center: `--screen-mut` micro text — same dynamic strings ("live network — agent watching N pools…").

### Transactions feed (INSIDE the screen, top-right)
- Dark glass panel: `--screen-glass` + backdrop blur, `--screen-line` border, radius 12.
- **New: collapsible** via chevron in the header (pure `useState`, default expanded; collapsed shows just kicker + count).
- Rows: dark glass cards, hairline borders; SUPPLY badge in `--ok-bright` on `rgba(52,209,123,0.12)`; amount `--screen-ink`; time `--screen-mut`; hash link `--blue-bright`. Hover: border brightens + slight lift.
- Empty copy: "No transactions yet — the agent supplies idle USDC on its next tick."
- Count badge: `--blue-bright` text on `rgba(109,134,255,0.14)`.

### Ticker (INSIDE the screen, bottom-left)
- Dark glass pill; kind dot uses bright semantic colors; message `--screen-ink`; TX link `--blue-bright`. Max-width `calc(100% - 320px)` (TX-feed width + insets), a static cap so it can never run under the feed regardless of the feed's collapse state.

### Bottom bar (paper, unchanged position)
- Stat chips: `--paper-2` fill + 1px `--line` border, radius 12; label micro/`--mut`, value 15px ink.
- Copy: "CACHE" → "UPDATED"; "YOUR SA" → "ACCOUNT" (stays a button opening the account panel, blue label).
- Wallet chip/connect button: same structure; connect = solid `--blue` pill; connected chip = white card + hairline, live dot, address + status line; disconnect ✕ cell widened to 32px.
- Scan button: keep the 74px hardware circle. Idle: ink circle, "SCAN" (11px mono, letter-spaced, one line — the broken "Start/scan" / "Scan/ning…" two-line split is gone). Scanning: blue circle, label "SCANNING" (10px) + thin rotating conic arc ring around the button. Paused/disabled: dimmed.

### Slide-in panels (Analysis + Onboarding — paper, over the screen)
- Same geometry and 320ms slide. They read as printed reports sliding over the instrument — this plus the dark feed resolves the old "two panels in one corner" collision semantically (glass belongs to the screen; paper covers it while open).
- Scrim: `rgba(12,14,19,0.18)`, 240ms fade.

## 4. Screen graphics — `NetworkGraph` paint mapping (colors/sizes only; logic untouched)

| Element | Old | New |
|---|---|---|
| dust dots | `rgba(11,11,12,0.28)` | `rgba(232,234,242,0.12)` |
| link eligible | `rgba(11,11,12,0.5)` | `rgba(232,234,242,0.30)` |
| link ineligible | `rgba(11,11,12,0.18)` dashed | `rgba(232,234,242,0.10)` dashed |
| link chosen + particles | `#2b4cff` | `#6d86ff` |
| pool pill fill | ink `#0b0b0c` / dim `#5a5a5e` | glass `#1a1e29` + 1px `rgba(255,255,255,0.14)` stroke / dim: `rgba(26,30,41,0.55)` + `rgba(255,255,255,0.07)` stroke |
| pill text | `#fff` / `rgba(255,255,255,0.78)` | `#e8eaf2` / `rgba(232,234,242,0.55)` |
| ✷ mark (chosen / best / dim) | `#9db0ff` / `rgba(255,255,255,0.88)` / `rgba(255,255,255,0.55)` | `#a9b8ff` / `rgba(232,234,242,0.9)` / `rgba(232,234,242,0.45)` |
| chosen outline + glow | `#2b4cff`, shadow `rgba(43,76,255,0.45)` blur 14 | `#6d86ff`, shadow `rgba(109,134,255,0.40)` blur 12 |
| best-only dashed outline | `rgba(43,76,255,0.42)` | `rgba(109,134,255,0.55)` |
| TX badge | `#2b4cff` bg, white text | `#6d86ff` bg, **near-black `#0c0e13` text** (white on `#6d86ff` fails contrast) |
| ripple rings | `rgba(43,76,255, α≤0.52)` | `rgba(109,134,255, α≤0.45)` |
| endpoint dot | blue / ink / `#b8b8bc` | `#6d86ff` / `#e8eaf2` / `rgba(232,234,242,0.35)` |
| agent core + halos | `#2b4cff` + `rgba(43,76,255,.13/.06)` | `#6d86ff` + `rgba(109,134,255,0.16/0.07)` |
| agent labels | `#9a9aa0` / ink | `#8a90a3` / `#e8eaf2` |
| ineligible reason caption | `#9a9aa0` | `#8a90a3` |

- `zoomToFit` padding 60 → 48 so the network fills the glass better.
- EmptyStage (cold start): light-alpha dust, breathing luminous ring (`--blue-bright` + soft halos), labels in `--screen-mut`/`--screen-ink`. Keep the 2.2s pulse.
- Reduced motion (see §7): particle speed drops to 0.002 and does not speed up while scanning.

## 5. Paper panels — content hierarchy

### AnalysisPanel
- Kicker/title/address block unchanged in structure; title 20px mono, address 11.5px `--mut`.
- Eligibility badge: same logic; eligible = `--blue` on `--blue-soft`; ineligible = `--ink-2` on `--paper-2`. Ineligible reason in Plex Sans.
- Metric grid: 2×2 with hairline dividers (border-based, not floating boxes); labels micro/`--mut`, values 15–18px mono.
- Risk bar: 6px track `--paper-2`, fill keeps green→amber→red thresholds (35/65), thin rounded; "safe/risky" scale labels 10px.
- Rationale: quiet quote block — `--blue-faint` bg, 2px `--blue` left border (not full border), body in Plex Sans 13px.
- Link buttons: full-width, primary solid `--blue`, secondary `--paper-2` + hairline; mono labels.

### Onboarding
- Header/badge/steps structure unchanged. Step dots: numbered hairline rings → active: blue ring + existing spinner arc → done: solid `--blue` with ✓ → error: `--err` tint. Step titles 13.5px mono; hints Plex Sans 11.5px.
- Faucet note, cap hint, balance readout, error box: restyled to tokens; prose in Plex Sans.
- Amount input row: `--paper-2` fill + hairline, focus ring per §7; 18px mono input.
- **Fineprint** (the long signing explanation) collapses into native `<details>`: `<summary>How signing works</summary>` — closed by default, content unchanged, Plex Sans.
- RegisteredView: status banner, metric grid, position block (28px amount), exec-contracts block, CTA, reset button — all re-tokened; "Reset demo" copy and hint kept.
- CTA: full-width solid `--blue`, 14px mono, disabled at 0.45 opacity (unchanged rule).

## 6. Copy changes (complete list)

| Where | Old | New |
|---|---|---|
| Bottom bar chip | `CACHE` | `UPDATED` |
| Bottom bar chip | `YOUR SA` | `ACCOUNT` |
| Scan button | `Start\nscan` / `Scan\nning…` | `SCAN` / `SCANNING` (+ arc ring) |
| Top pill | `YieldSeeker · Stellar` + dead "i" dot | `YieldSeeker · Stellar` `· autonomous agent` (muted suffix, hidden ≤1024px); "i" removed |
| Top bar | — | new `LIVE` / `PAUSED` micro chip |
| TX feed empty state | "No transactions yet — the agent supplies idle USDC into the pool on its next tick. They'll show up here, linked to stellar.expert." | "No transactions yet — the agent supplies idle USDC on its next tick." |
| Onboarding fineprint | always-visible paragraph | inside `<details>` "How signing works" |

Everything else (status strings, hints, reset copy) unchanged.

## 7. Motion & accessibility

- Panel slide 320ms `cubic-bezier(0.22,1,0.36,1)` (kept); scrim fade 240ms; live dot breathes at 2.4s; scan arc rotates ~1.2s linear; hovers: border/bg shift + ≤1px translate, 140ms. No drifting backgrounds on the screen (dust is static).
- `@media (prefers-reduced-motion: reduce)`: all DOM animations/transitions disabled; canvas particle speed 0.002, no scanning speed-up.
- `:focus-visible`: 2px outline, offset 2px — `--blue` on paper, `--blue-bright` on screen elements.
- Hit targets ≥32px (close ✕ and wallet-disconnect cells widened from 30px).
- No text below 10px; muted-on-paper is `--mut #7d7d84` (≈4.6:1 on `--paper`), muted-on-screen `--screen-mut #8a90a3` (≥4.5:1 on `--screen`).

## 8. Tablet degradation (laptop-first)

- `≤1024px`: pill tagline hidden; TX feed 248→220px.
- `≤880px`: bottom bar wraps (auto height; the screen's bottom inset follows via a CSS variable); screen inset 14→10px; rail chips 46→40px.
- Slide-in panels: `width: min(380px, calc(100vw - 32px))` (analysis 360→min(360px, …)).
- Nothing below ~768px is designed for; it should degrade without overlap but is not a target.

## 9. File-by-file change map

| File | Change |
|---|---|
| `src/app/globals.css` | Full token system; all component classes; keyframes (absorbs `globalCss` string from LivingNetwork); focus/hover/media/reduced-motion rules |
| `src/app/layout.tsx` | Add `IBM_Plex_Sans` via `next/font`, expose `--font-plex-sans` |
| `src/app/_components/LivingNetwork.tsx` | classNames replace static inline styles; screen wrapper; rail/note/ticker inside screen; SVG pause/play; LIVE chip; scan-button fix; copy changes; remove injected `<style>` |
| `src/app/_components/NetworkGraph.tsx` | Color constants + paint-code swaps per §4 table; zoomToFit padding 48; reduced-motion particle speed |
| `src/app/_components/TransactionsPanel.tsx` | Dark glass restyle; collapse toggle (`useState`); copy |
| `src/app/_components/AnalysisPanel.tsx` | Paper restyle per §5; Plex Sans prose |
| `src/app/_components/Onboarding.tsx` | Paper restyle per §5; `<details>` fineprint; step-dot states |

**Untouched:** all hooks (`useLivingData`, `useFreighter`, `useOnboarding`), `format.ts`, `links.ts`, `types.ts`, every route, everything in `src/lib/`, `package.json` deps.

## 10. Non-goals

- No phone/mobile layout.
- No OS dark-mode (`prefers-color-scheme`) switch — the instrument body is intentionally light; the screen is intentionally dark.
- No new dependencies (the added Plex Sans face rides the existing `next/font` mechanism).
- No behavior changes: same clicks, same panels, same data, same SSE/polling, same wallet flows.

## 11. Verification

- `npx tsc --noEmit` clean; `npm test` unaffected (no `src/app` coverage exists).
- Visual verification in the running app (`AGENT_LOOP_ENABLED=0 npm run dev` for chrome-only states; with loop enabled for populated graph), checking each state: visitor (no wallet), cold-start empty screen, populated graph (eligible/ineligible/best/chosen pills), TX feed expanded/collapsed/empty, ticker, analysis panel open, onboarding (setup + registered views), paused state, scanning state, 1024px and 880px widths, keyboard focus pass.
