"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApiPosition, ApiScoredPool } from "./types";
import { formatUsdc, poolPillLabel } from "./format";

// Canvas/DOM-only lib — must never render on the server, so it's dynamically
// imported with ssr:false. The library ships its own (strict) NodeObject/
// LinkObject generics that fight our narrower GraphNode/GraphLink; we type the
// component loosely at the boundary and annotate accessor params ourselves.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
}) as unknown as ComponentType<any>;

// d3-force-3d ships collide — react-force-graph-2d depends on it transitively.
// Import at runtime to avoid SSR issues (ForceGraph2D is already client-only).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _forceCollide: ((r: (n: any) => number) => any) | null = null;
if (typeof window !== "undefined") {
  import("d3-force-3d").then((m) => {
    _forceCollide = m.forceCollide ?? null;
  });
}

const INK = "#0b0b0c";
const BLUE = "#2b4cff";
const DIM = "#5a5a5e";
const GREY_DOT = "#b8b8bc";

export type GraphNode = {
  id: string;
  kind: "agent" | "pool" | "dust";
  label?: string;
  pool?: ApiScoredPool;
  best?: boolean;
  chosen?: boolean;
  // physics
  fx?: number;
  fy?: number;
  x?: number;
  y?: number;
};

type GraphLink = {
  source: string;
  target: string;
  chosen?: boolean;
  eligible?: boolean;
};

interface Props {
  pools: ApiScoredPool[];
  position: ApiPosition | null;
  scanning: boolean;
  selectedId: string | null;
  onSelect: (poolId: string | null) => void;
}

// Deterministic faint dot-cloud (Giza texture) generated once per canvas size.
// Nodes are fixed so the simulation never moves them; coordinates span the full
// canvas in graph-space (centred on 0,0 like d3-force).
function makeDust(count: number, w: number, h: number): GraphNode[] {
  const dust: GraphNode[] = [];
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  // spread over 90 % of the canvas so the edges stay clean
  const rx = (w / 2) * 0.9;
  const ry = (h / 2) * 0.9;
  for (let i = 0; i < count; i++) {
    const fx = (rand() - 0.5) * 2 * rx;
    const fy = (rand() - 0.5) * 2 * ry;
    dust.push({ id: `dust-${i}`, kind: "dust", fx, fy, x: fx, y: fy });
  }
  return dust;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Approximate half-width of a pool pill in graph units (used for collision). */
function pillHalfWidth(label: string, ctx: CanvasRenderingContext2D): number {
  ctx.font = "600 3.4px var(--font-plex-mono, monospace)";
  const mark = "✷ ";
  const textW = ctx.measureText(mark + label).width;
  // padX is 5 on each side in the draw code → total w = textW + 10
  return (textW + 10) / 2 + 6; // +6 px gap so pills don't kiss
}

export default function NetworkGraph({
  pools,
  position,
  scanning,
  selectedId,
  onSelect,
}: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const idleLabel = useMemo(() => {
    const amt = formatUsdc(position?.amountUsdc);
    return `${amt} USDC idle`;
  }, [position?.amountUsdc]);

  const chosenPoolId = position?.chosenPoolId ?? null;

  // Size the graph to its container using ResizeObserver.
  // Guard against zero sizes — ForceGraph2D needs real pixel dimensions.
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => {
      const w = el.clientWidth || el.offsetWidth;
      const h = el.clientHeight || el.offsetHeight;
      if (w > 0 && h > 0) {
        setDims((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
      }
    };
    // Retry a few times in case layout hasn't settled yet
    apply();
    const t1 = setTimeout(apply, 50);
    const t2 = setTimeout(apply, 200);
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      ro.disconnect();
    };
  }, []);

  // Dust spread to full canvas area (in graph coords centred on 0,0).
  const dust = useMemo(
    () => makeDust(200, dims.w || 800, dims.h || 600),
    // Regenerate only when the canvas size changes meaningfully (>10 px).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [Math.round((dims.w || 800) / 10), Math.round((dims.h || 600) / 10)],
  );

  const { nodes, links } = useMemo(() => {
    // Best eligible pool by APY (matches backend bestPool()).
    const eligible = pools.filter((p) => p.eligible);
    const best = eligible.length
      ? eligible.reduce((a, b) => (b.apyBps > a.apyBps ? b : a))
      : null;

    // Highlight logic:
    //   - If the agent has an active position (chosenPoolId set), highlight it.
    //   - Otherwise (idle / hold), highlight the best-eligible pool so the user
    //     always sees what the agent would pick next.
    const highlightId = chosenPoolId ?? best?.poolId ?? null;

    // Pin the agent at the canvas centre in graph-space (0, 0).
    const agent: GraphNode = {
      id: "__agent__",
      kind: "agent",
      label: idleLabel,
      fx: 0,
      fy: 0,
      x: 0,
      y: 0,
    };
    const poolNodes: GraphNode[] = pools.map((p) => ({
      id: p.poolId,
      kind: "pool",
      label: poolPillLabel(p.name, p.poolId),
      pool: p,
      best: best?.poolId === p.poolId,
      chosen: highlightId === p.poolId,
    }));
    const poolLinks: GraphLink[] = pools.map((p) => ({
      source: "__agent__",
      target: p.poolId,
      eligible: p.eligible,
      chosen: highlightId === p.poolId,
    }));

    return {
      nodes: [...dust, agent, ...poolNodes],
      links: poolLinks,
    };
  }, [pools, dust, idleLabel, chosenPoolId]);

  // Tune forces whenever the graph mounts or node count changes.
  // Runs after ForceGraph2D has created the d3 simulation.
  const applyForces = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    try {
      // Strong repulsion so nodes spread far apart.
      fg.d3Force("charge")?.strength(-800).distanceMax(600);
      // Long, medium-strength links so pools orbit well away from centre.
      fg.d3Force("link")?.distance(200).strength(0.5);
      // Gentle centre pull to keep the layout roughly composed.
      const center = fg.d3Force("center");
      if (center) center.strength(0.02);
      // Collision force: prevent pool pills from overlapping each other.
      // We approximate collision radius from the longest label to be safe.
      if (_forceCollide) {
        const maxLabel = pools.reduce(
          (best, p) => {
            const lbl = poolPillLabel(p.name, p.poolId);
            return lbl.length > best.length ? lbl : best;
          },
          "BLEND · XXXXXXXXXX",
        );
        // Rough px-per-char for 3.4px mono font in graph units ≈ 2.1
        const approxHalf = (maxLabel.length * 2.1 + 10) / 2 + 8;
        fg.d3Force(
          "collision",
          _forceCollide((n: GraphNode) => {
            if (n.kind === "dust") return 0; // dust participates in nothing
            if (n.kind === "agent") return 18; // slightly larger than the ring
            return approxHalf;
          }),
        );
      }
      fg.d3VelocityDecay(0.4);
      fg.d3AlphaDecay(0.025);
    } catch {
      /* force accessors differ across builds; non-fatal */
    }
  }, [pools]);

  useEffect(() => {
    applyForces();
  }, [applyForces, nodes.length]);

  // After the engine cools down, zoom-to-fit with generous padding so nodes
  // fill the entire canvas rather than clustering in a tiny centre spot.
  const zoomToFit = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    try {
      fg.zoomToFit(600, 90);
    } catch {
      /* non-fatal if graph isn't ready */
    }
  }, []);

  // Re-fit on resize (dims change triggers a new ForceGraph2D render anyway,
  // but we also want to re-fit after layout has settled in the new canvas).
  useEffect(() => {
    if (dims.w > 0 && dims.h > 0) {
      const t = setTimeout(zoomToFit, 800);
      return () => clearTimeout(t);
    }
  }, [dims, zoomToFit]);

  // Reheat layout when pool set changes.
  useEffect(() => {
    const fg = fgRef.current;
    if (fg && typeof fg.d3ReheatSimulation === "function") {
      fg.d3ReheatSimulation();
    }
  }, [pools.length]);

  return (
    <div ref={wrapRef} style={{ position: "absolute", inset: 0 }}>
      {dims.w > 0 && dims.h > 0 && (
        <ForceGraph2D
          ref={fgRef}
          width={dims.w}
          height={dims.h}
          graphData={{ nodes, links }}
          backgroundColor="rgba(0,0,0,0)"
          cooldownTime={4500}
          warmupTicks={50}
          enableNodeDrag={true}
          enableZoomInteraction={true}
          minZoom={0.3}
          maxZoom={3}
          nodeRelSize={5}
          nodeVal={(n: GraphNode) =>
            n.kind === "dust" ? 0.4 : n.kind === "agent" ? 6 : 3
          }
          // Links: chosen = solid blue, ineligible = faint dashed grey, others = soft ink.
          linkColor={(l: GraphLink) =>
            l.chosen
              ? BLUE
              : l.eligible
                ? "rgba(11,11,12,0.5)"
                : "rgba(11,11,12,0.18)"
          }
          linkWidth={(l: GraphLink) => (l.chosen ? 1.6 : 1)}
          linkLineDash={(l: GraphLink) =>
            !l.eligible && !l.chosen ? [4, 4] : null
          }
          linkDirectionalParticles={(l: GraphLink) => (l.chosen ? 4 : 0)}
          linkDirectionalParticleWidth={(l: GraphLink) => (l.chosen ? 3 : 0)}
          linkDirectionalParticleSpeed={scanning ? 0.012 : 0.006}
          linkDirectionalParticleColor={() => BLUE}
          // After the engine cools down, zoom to fill the canvas.
          onEngineStop={zoomToFit}
          onNodeClick={(n: GraphNode) => {
            if (n.kind === "pool") onSelect(n.id);
            else onSelect(null);
          }}
          onBackgroundClick={() => onSelect(null)}
          nodePointerAreaPaint={(
            n: GraphNode,
            color: string,
            ctx: CanvasRenderingContext2D,
          ) => {
            // Hit area roughly matching the drawn shape.
            if (n.kind === "dust") return;
            ctx.fillStyle = color;
            if (n.kind === "agent") {
              ctx.beginPath();
              ctx.arc(n.x ?? 0, n.y ?? 0, 14, 0, 2 * Math.PI);
              ctx.fill();
              return;
            }
            ctx.font = "600 3.4px var(--font-plex-mono, monospace)";
            const text = "✷ " + (n.label ?? "");
            const w = ctx.measureText(text).width + 10;
            roundRect(
              ctx,
              (n.x ?? 0) - w / 2,
              (n.y ?? 0) - 7,
              w,
              14,
              4.5,
            );
            ctx.fill();
          }}
          nodeCanvasObject={(
            n: GraphNode,
            ctx: CanvasRenderingContext2D,
            globalScale: number,
          ) => {
            const x = n.x ?? 0;
            const y = n.y ?? 0;

            if (n.kind === "dust") {
              ctx.fillStyle = "rgba(11,11,12,0.28)";
              ctx.beginPath();
              ctx.arc(x, y, 0.7, 0, 2 * Math.PI);
              ctx.fill();
              return;
            }

            if (n.kind === "agent") {
              // Concentric blue ring (matches .center .ring in the reference).
              ctx.beginPath();
              ctx.arc(x, y, 13, 0, 2 * Math.PI);
              ctx.fillStyle = "rgba(43,76,255,0.06)";
              ctx.fill();
              ctx.beginPath();
              ctx.arc(x, y, 8.5, 0, 2 * Math.PI);
              ctx.fillStyle = "rgba(43,76,255,0.13)";
              ctx.fill();
              ctx.beginPath();
              ctx.arc(x, y, 5, 0, 2 * Math.PI);
              ctx.fillStyle = BLUE;
              ctx.fill();
              // Label BELOW the ring — offset far enough to clear the ring.
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.font = "500 2.8px var(--font-plex-mono, monospace)";
              ctx.fillStyle = "#9a9aa0";
              ctx.fillText("YIELDSEEKER AGENT", x, y + 16);
              ctx.font = "700 3.8px var(--font-plex-mono, monospace)";
              ctx.fillStyle = INK;
              ctx.fillText(n.label ?? "", x, y + 21);
              return;
            }

            // Pool: black rounded pill with a mark, white mono text.
            // Chosen/best = blue outline + glow + blue endpoint dot.
            const pool = n.pool!;
            const isChosen = !!n.chosen;
            const isDim = !pool.eligible;
            const selected = n.id === selectedId;

            const fontPx = 3.4;
            ctx.font = `600 ${fontPx}px var(--font-plex-mono, monospace)`;
            const mark = "✷ ";
            const text = mark + (n.label ?? "");
            const padX = 6;
            const padY = 3.8;
            const textW = ctx.measureText(text).width;
            const w = textW + padX * 2;
            const h = fontPx + padY * 2;
            const rectX = x - w / 2;
            const rectY = y - h / 2;

            // Soft shadow / glow for chosen / selected.
            if (isChosen || selected) {
              ctx.save();
              ctx.shadowColor = "rgba(43,76,255,0.45)";
              ctx.shadowBlur = 14;
              ctx.shadowOffsetY = 4;
            }
            roundRect(ctx, rectX, rectY, w, h, 4.5);
            ctx.fillStyle = isDim ? DIM : INK;
            ctx.fill();
            if (isChosen || selected) ctx.restore();

            // Blue outline ring on chosen / selected.
            if (isChosen || selected) {
              roundRect(ctx, rectX - 0.7, rectY - 0.7, w + 1.4, h + 1.4, 5);
              ctx.lineWidth = 1;
              ctx.strokeStyle = BLUE;
              ctx.stroke();
            }

            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.font = `600 ${fontPx}px var(--font-plex-mono, monospace)`;
            // Mark glyph in accent (blue for chosen, soft white otherwise).
            ctx.fillStyle = isChosen
              ? "#9db0ff"
              : isDim
                ? "rgba(255,255,255,0.55)"
                : "#ffffff";
            ctx.fillText(mark, rectX + padX, y + 0.2);
            const markW = ctx.measureText(mark).width;
            ctx.fillStyle = isDim ? "rgba(255,255,255,0.78)" : "#ffffff";
            ctx.fillText(n.label ?? "", rectX + padX + markW, y + 0.2);

            // Endpoint dot near the agent-facing side (below the pill centre).
            const dotColor = isChosen ? BLUE : isDim ? GREY_DOT : INK;
            ctx.beginPath();
            ctx.arc(x, rectY + h + 2.5, 1.8, 0, 2 * Math.PI);
            ctx.fillStyle = dotColor;
            ctx.fill();
            if (isChosen) {
              ctx.beginPath();
              ctx.arc(x, rectY + h + 2.5, 3.4, 0, 2 * Math.PI);
              ctx.strokeStyle = "rgba(43,76,255,0.28)";
              ctx.lineWidth = 1.4;
              ctx.stroke();
            }

            // Collision hint: measure pill half-width so collision radius is accurate.
            // (We re-use globalScale to suppress text at very low zoom.)
            void globalScale; // referenced to avoid lint warn; used below ↓

            // Ineligible reason as a faint caption under the pill (only at zoom ≥ 1.1).
            if (isDim && pool.reason && globalScale > 1.1) {
              ctx.textAlign = "center";
              ctx.font = "400 2.4px var(--font-plex-mono, monospace)";
              ctx.fillStyle = "#9a9aa0";
              ctx.fillText(pool.reason, x, rectY + h + 7);
            }

            // Expose pill half-width via node property for collision sizing.
            // Safe to write because react-force-graph merges node objects.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (n as any)._pillHalfW = pillHalfWidth(n.label ?? "", ctx);
          }}
        />
      )}
    </div>
  );
}
