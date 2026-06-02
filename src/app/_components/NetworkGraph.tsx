"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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

// Deterministic faint dot-cloud (Giza texture) generated once. Static nodes with
// no links, drawn as 1px ink dots; fixed so the simulation ignores them.
function makeDust(count: number, w: number, h: number): GraphNode[] {
  const dust: GraphNode[] = [];
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    const fx = (rand() - 0.5) * w;
    const fy = (rand() - 0.5) * h;
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
  const dust = useMemo(() => makeDust(140, 760, 620), []);

  const idleLabel = useMemo(() => {
    const amt = formatUsdc(position?.amountUsdc);
    return `${amt} USDC idle`;
  }, [position?.amountUsdc]);

  const chosenPoolId = position?.chosenPoolId ?? null;

  const { nodes, links } = useMemo(() => {
    // Best eligible pool by APY (matches backend bestPool()).
    const eligible = pools.filter((p) => p.eligible);
    const best = eligible.length
      ? eligible.reduce((a, b) => (b.apyBps > a.apyBps ? b : a))
      : null;

    const agent: GraphNode = { id: "__agent__", kind: "agent", label: idleLabel, fx: 0, fy: 0 };
    const poolNodes: GraphNode[] = pools.map((p) => ({
      id: p.poolId,
      kind: "pool",
      label: poolPillLabel(p.name, p.poolId),
      pool: p,
      best: best?.poolId === p.poolId,
      chosen: chosenPoolId ? chosenPoolId === p.poolId : best?.poolId === p.poolId,
    }));
    const poolLinks: GraphLink[] = pools.map((p) => ({
      source: "__agent__",
      target: p.poolId,
      eligible: p.eligible,
      chosen: chosenPoolId ? chosenPoolId === p.poolId : best?.poolId === p.poolId,
    }));

    return {
      nodes: [...dust, agent, ...poolNodes],
      links: poolLinks,
    };
  }, [pools, dust, idleLabel, chosenPoolId]);

  // Tune forces once the engine exists: a gentle repel + medium link distance so
  // the layout settles calm and legible rather than jittery.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    try {
      fg.d3Force("charge")?.strength(-260).distanceMax(520);
      fg.d3Force("link")?.distance(170).strength(0.7);
      const center = fg.d3Force("center");
      if (center) center.strength(0.04);
      fg.d3VelocityDecay(0.45);
      fg.d3AlphaDecay(0.035);
    } catch {
      /* force accessors differ across builds; non-fatal */
    }
  }, [nodes.length]);

  // Keep the chosen link's flow particles lively while scanning.
  useEffect(() => {
    const fg = fgRef.current;
    if (fg && typeof fg.d3ReheatSimulation === "function") {
      // nudge layout when the pool set changes
      fg.d3ReheatSimulation();
    }
  }, [pools.length]);

  // Size the graph to its container (React-driven so the first paint is correct
  // and resizes re-render cleanly).
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () =>
      setDims((prev) => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        return prev.w === w && prev.h === h ? prev : { w, h };
      });
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} style={{ position: "absolute", inset: 0 }}>
      {dims.w > 0 && dims.h > 0 && (
        <ForceGraph2D
          ref={fgRef}
          width={dims.w}
          height={dims.h}
        graphData={{ nodes, links }}
        backgroundColor="rgba(0,0,0,0)"
        cooldownTime={4000}
        warmupTicks={40}
        enableNodeDrag={true}
        enableZoomInteraction={true}
        minZoom={0.5}
        maxZoom={2.5}
        nodeRelSize={5}
        nodeVal={(n: GraphNode) => (n.kind === "dust" ? 0.4 : n.kind === "agent" ? 6 : 3)}
        // Links: chosen = solid blue, ineligible = faint dashed grey, others = soft ink.
        linkColor={(l: GraphLink) =>
          l.chosen ? BLUE : l.eligible ? "rgba(11,11,12,0.5)" : "rgba(11,11,12,0.18)"
        }
        linkWidth={(l: GraphLink) => (l.chosen ? 1.6 : 1)}
        linkLineDash={(l: GraphLink) => (!l.eligible && !l.chosen ? [4, 4] : null)}
        linkDirectionalParticles={(l: GraphLink) => (l.chosen ? 4 : 0)}
        linkDirectionalParticleWidth={(l: GraphLink) => (l.chosen ? 3 : 0)}
        linkDirectionalParticleSpeed={scanning ? 0.012 : 0.006}
        linkDirectionalParticleColor={() => BLUE}
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
          ctx.font = "600 5px var(--font-plex-mono, monospace)";
          const text = n.label ?? "";
          const w = ctx.measureText(text).width + 22;
          roundRect(ctx, (n.x ?? 0) - w / 2, (n.y ?? 0) - 7, w, 14, 4.5);
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
            ctx.fillStyle = "rgba(11,11,12,0.30)";
            ctx.beginPath();
            ctx.arc(x, y, 0.6, 0, 2 * Math.PI);
            ctx.fill();
            return;
          }

          if (n.kind === "agent") {
            // Concentric blue ring (matches .center .ring in the reference).
            ctx.beginPath();
            ctx.arc(x, y, 12, 0, 2 * Math.PI);
            ctx.fillStyle = "rgba(43,76,255,0.06)";
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, y, 8, 0, 2 * Math.PI);
            ctx.fillStyle = "rgba(43,76,255,0.13)";
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, y, 4.5, 0, 2 * Math.PI);
            ctx.fillStyle = BLUE;
            ctx.fill();
            // Label below: AGENT + idle amount.
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.font = "500 2.6px var(--font-plex-mono, monospace)";
            ctx.fillStyle = "#9a9aa0";
            ctx.fillText("YIELDSEEKER AGENT", x, y + 9);
            ctx.font = "700 3.6px var(--font-plex-mono, monospace)";
            ctx.fillStyle = INK;
            ctx.fillText(n.label ?? "", x, y + 13.5);
            return;
          }

          // Pool: black rounded pill with a mark, white mono text. Chosen = blue
          // outline + blue endpoint dot; ineligible = dimmed grey.
          const pool = n.pool!;
          const isChosen = !!n.chosen;
          const isDim = !pool.eligible;
          const selected = n.id === selectedId;

          const fontPx = 3.4;
          ctx.font = `600 ${fontPx}px var(--font-plex-mono, monospace)`;
          const mark = "✷ ";
          const text = mark + (n.label ?? "");
          const padX = 5;
          const padY = 3.4;
          const textW = ctx.measureText(text).width;
          const w = textW + padX * 2;
          const h = fontPx + padY * 2;
          const rectX = x - w / 2;
          const rectY = y - h / 2;

          // soft shadow for chosen / selected
          if (isChosen || selected) {
            ctx.save();
            ctx.shadowColor = "rgba(43,76,255,0.45)";
            ctx.shadowBlur = 12;
            ctx.shadowOffsetY = 4;
          }
          roundRect(ctx, rectX, rectY, w, h, 4.5);
          ctx.fillStyle = isDim ? DIM : INK;
          ctx.fill();
          if (isChosen || selected) ctx.restore();

          // blue outline ring on chosen / selected
          if (isChosen || selected) {
            roundRect(ctx, rectX - 0.6, rectY - 0.6, w + 1.2, h + 1.2, 5);
            ctx.lineWidth = 0.9;
            ctx.strokeStyle = BLUE;
            ctx.stroke();
          }

          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.font = `600 ${fontPx}px var(--font-plex-mono, monospace)`;
          // mark glyph in accent (blue for chosen, soft white otherwise)
          ctx.fillStyle = isChosen ? "#9db0ff" : isDim ? "rgba(255,255,255,0.55)" : "#ffffff";
          ctx.fillText(mark, rectX + padX, y + 0.2);
          const markW = ctx.measureText(mark).width;
          ctx.fillStyle = isDim ? "rgba(255,255,255,0.78)" : "#ffffff";
          ctx.fillText(n.label ?? "", rectX + padX + markW, y + 0.2);

          // endpoint dot near the agent-facing side
          const dotColor = isChosen ? BLUE : isDim ? GREY_DOT : INK;
          ctx.beginPath();
          ctx.arc(x, rectY + h + 2.2, 1.7, 0, 2 * Math.PI);
          ctx.fillStyle = dotColor;
          ctx.fill();
          if (isChosen) {
            ctx.beginPath();
            ctx.arc(x, rectY + h + 2.2, 3.2, 0, 2 * Math.PI);
            ctx.strokeStyle = "rgba(43,76,255,0.25)";
            ctx.lineWidth = 1.4;
            ctx.stroke();
          }

          // ineligible reason as a faint caption under the pill
          if (isDim && pool.reason && globalScale > 1.1) {
            ctx.textAlign = "center";
            ctx.font = "400 2.4px var(--font-plex-mono, monospace)";
            ctx.fillStyle = "#9a9aa0";
            ctx.fillText(pool.reason, x, rectY + h + 6);
          }
          }}
        />
      )}
    </div>
  );
}
