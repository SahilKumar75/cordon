"use client";

import type { DetectorId } from "@cordon/shared";
import { detectorNames } from "@/lib/format";
import { useQuorum } from "@/lib/useQuorum";
import { Glyph, type GlyphName, type GlyphState } from "./glyphs";

type Point = { x: number; y: number };

type Layout = {
  vertical: boolean;
  width: number;
  height: number;
  box: { w: number; h: number };
  registry: Point;
  detectors: Point[];
  seal: Point;
  guards: Point[];
  barrier: [Point, Point];
  token: Point[];
};

const wide: Layout = {
  vertical: false,
  width: 1000,
  height: 300,
  box: { w: 170, h: 58 },
  registry: { x: 95, y: 150 },
  detectors: [60, 150, 240].map((y) => ({ x: 362, y })),
  seal: { x: 622, y: 150 },
  guards: [60, 150, 240].map((y) => ({ x: 905, y })),
  barrier: [
    { x: 770, y: 18 },
    { x: 770, y: 282 },
  ],
  token: [
    { x: 228, y: 150 },
    { x: 492, y: 150 },
    { x: 738, y: 150 },
  ],
};

const narrow: Layout = {
  vertical: true,
  width: 360,
  height: 560,
  box: { w: 108, h: 58 },
  registry: { x: 180, y: 40 },
  detectors: [62, 180, 298].map((x) => ({ x, y: 180 })),
  seal: { x: 180, y: 330 },
  guards: [62, 180, 298].map((x) => ({ x, y: 515 })),
  barrier: [
    { x: 14, y: 430 },
    { x: 346, y: 430 },
  ],
  token: [
    { x: 180, y: 110 },
    { x: 180, y: 255 },
    { x: 180, y: 403 },
  ],
};

const detectorOrder: DetectorId[] = ["staticScripts", "sandboxCanary", "advisoryFeed"];
const guardNodes: { title: string; glyph: GlyphName }[] = [
  { title: "install", glyph: "install" },
  { title: "CI", glyph: "ci" },
  { title: "services", glyph: "services" },
];

type Tone = "idle" | "lit" | "live" | "accent";

const nodeTone: Record<Tone, { box: string; text: string; sub: string }> = {
  idle: { box: "fill-surface stroke-plum", text: "fill-jade", sub: "fill-jade" },
  lit: { box: "fill-surface stroke-jade", text: "fill-bone", sub: "fill-jade" },
  live: { box: "fill-surface stroke-copper", text: "fill-copper", sub: "fill-copper" },
  accent: { box: "fill-surface stroke-persimmon", text: "fill-persimmon", sub: "fill-persimmon" },
};

const edgeTone: Record<Tone, string> = { idle: "stroke-plum", lit: "stroke-jade", live: "stroke-copper", accent: "stroke-persimmon" };

export type FlowProps = { stage: number; version: string | null; votes: Partial<Record<DetectorId, boolean>> };

export function FlowDiagram(props: FlowProps) {
  const quorum = useQuorum();
  return (
    <figure className="py-6">
      <Diagram layout={wide} className="hidden sm:block" quorum={quorum} {...props} />
      <Diagram layout={narrow} className="mx-auto max-w-sm sm:hidden" quorum={quorum} {...props} />
      <figcaption className="sr-only">
        {props.stage === 0
          ? "No version in flight. Detectors, SealRegistry and the guards are idle."
          : `${props.version} published. ${Object.values(props.votes).filter(Boolean).length} malicious votes${quorum === undefined ? "" : ` of ${quorum} needed`}. ${props.stage >= 4 ? "Sealed; the guards block it." : props.stage >= 3 ? "Sealed; the guards are armed." : "Not sealed yet."}`}
      </figcaption>
    </figure>
  );
}

function edgePath({ vertical, box }: Layout, from: Point, to: Point) {
  if (vertical) {
    const [ax, ay, bx, by] = [from.x, from.y + box.h / 2, to.x, to.y - box.h / 2];
    const mid = (ay + by) / 2;
    return `M${ax} ${ay}C${ax} ${mid} ${bx} ${mid} ${bx} ${by}`;
  }
  const [ax, ay, bx, by] = [from.x + box.w / 2, from.y, to.x - box.w / 2, to.y];
  const mid = (ax + bx) / 2;
  return `M${ax} ${ay}C${mid} ${ay} ${mid} ${by} ${bx} ${by}`;
}

function Diagram({ layout, className, stage, version, votes, quorum }: FlowProps & { layout: Layout; className: string; quorum: number | undefined }) {
  const malicious = detectorOrder.filter((id) => votes[id]).length;
  const sealed = stage >= 3;
  const blocked = stage >= 4;
  const edges: { from: Point; to: Point; tone: Tone; pending: boolean; delay: number }[] = [
    ...layout.detectors.map((at, index) => {
      const id = detectorOrder[index] as DetectorId;
      return { from: layout.registry, to: at, tone: (stage >= 2 && id in votes ? "lit" : "idle") as Tone, pending: stage <= 1, delay: index * 90 };
    }),
    ...layout.detectors.map((at, index) => {
      const vote = votes[detectorOrder[index] as DetectorId];
      return { from: at, to: layout.seal, tone: (vote ? (sealed ? "accent" : "live") : vote === false ? "lit" : "idle") as Tone, pending: stage === 2, delay: index * 90 };
    }),
    ...layout.guards.map((at, index) => ({ from: layout.seal, to: at, tone: (sealed ? "accent" : "idle") as Tone, pending: false, delay: index * 120 })),
  ];
  const tokenAt = layout.token[Math.min(stage, 3) - 1];
  const tokenText = (version ?? "").slice(0, 12);
  const tokenWidth = tokenText.length * 7.5 + 14;
  const pipTotal = quorum ?? malicious;
  return (
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} className={`h-auto w-full overflow-visible ${className}`} aria-hidden="true">
      {edges.map(({ from, to, tone, pending, delay }, index) => {
        const d = edgePath(layout, from, to);
        return (
          <g key={index}>
            <path
              d={d}
              fill="none"
              strokeWidth={1.5}
              strokeDasharray={pending ? "4 6" : undefined}
              className={`stroke-plum ${pending ? "flowPending" : ""} ${pending && stage === 0 ? "flowIdle" : ""}`}
            />
            {tone !== "idle" && (
              <path
                key={tone}
                d={d}
                fill="none"
                strokeWidth={2}
                pathLength={1}
                strokeDasharray="1"
                className={`edgeDraw ${edgeTone[tone]}`}
                style={{ animationDelay: `${delay}ms` }}
              />
            )}
          </g>
        );
      })}
      <Node
        layout={layout}
        at={layout.registry}
        title="npm registry"
        sub={stage >= 1 ? "published" : "watching"}
        tone={stage >= 1 ? "lit" : "idle"}
        glyph="registry"
        state={{ active: stage >= 1, alarm: false }}
      />
      {layout.detectors.map((at, index) => {
        const id = detectorOrder[index] as DetectorId;
        const vote = votes[id];
        return (
          <Node
            key={id}
            layout={layout}
            at={at}
            title={detectorNames[id]}
            sub={vote ? "malicious" : vote === false ? "clean" : stage === 1 ? "scanning" : stage === 0 ? "idle" : "waiting"}
            tone={vote ? (sealed ? "accent" : "live") : vote === false ? "lit" : "idle"}
            glyph={id}
            state={{ active: vote === undefined ? stage === 1 : true, alarm: vote === true }}
            thunk={vote === undefined ? undefined : String(vote)}
          />
        );
      })}
      <Node
        layout={layout}
        at={layout.seal}
        title="SealRegistry"
        sub={sealed ? "sealed" : quorum === undefined ? "counting votes" : `votes ${malicious} of ${quorum}`}
        tone={sealed ? "accent" : stage >= 2 ? "lit" : "idle"}
        glyph="sealRegistry"
        state={{ active: stage >= 2, alarm: sealed }}
        pips={{ total: pipTotal, filled: sealed ? pipTotal : Math.min(malicious, pipTotal) }}
      />
      {guardNodes.map((guard, index) => (
        <Node
          key={guard.title}
          layout={layout}
          at={layout.guards[index] as Point}
          title={guard.title}
          sub={blocked ? "blocked" : sealed ? "armed" : "flowing"}
          tone={sealed ? "accent" : "idle"}
          glyph={guard.glyph}
          state={{ active: sealed, alarm: false }}
          blocked={blocked}
          relayDelay={index * 120}
        />
      ))}
      {sealed && <Barrier layout={layout} />}
      {tokenAt && tokenText && (
        <g className="tokenMove" style={{ transform: `translate(${tokenAt.x}px, ${tokenAt.y}px)` }}>
          <g key={stage} className="tokenSettle fillBox">
            <rect x={-tokenWidth / 2} y={-12} width={tokenWidth} height={24} className={`relayCut ${sealed ? "fill-persimmon" : "fill-copper"}`} />
            <text textAnchor="middle" y={4.5} className="fill-ground font-mono" fontSize="12" fontWeight="500">
              {tokenText}
            </text>
          </g>
        </g>
      )}
    </svg>
  );
}

function Node({
  layout,
  at,
  title,
  sub,
  tone,
  glyph,
  state,
  pips,
  blocked = false,
  thunk,
  relayDelay = 0,
}: {
  layout: Layout;
  at: Point;
  title: string;
  sub: string;
  tone: Tone;
  glyph: GlyphName;
  state: GlyphState;
  pips?: { total: number; filled: number };
  blocked?: boolean;
  thunk?: string;
  relayDelay?: number;
}) {
  const { w, h } = layout.box;
  const style = nodeTone[tone];
  const textX = layout.vertical ? 0 : -w / 2 + 46;
  const anchor = layout.vertical ? "middle" : "start";
  return (
    <g transform={`translate(${at.x} ${at.y})`}>
      <g key={`box${thunk}`} className={thunk ? "voteThunk" : undefined}>
        <rect
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          strokeWidth={tone === "idle" ? 1.5 : 2}
          className={`relayCut ${blocked ? "fill-persimmon stroke-persimmon" : style.box}`}
          style={{ transitionDelay: `${relayDelay}ms` }}
        />
        {!layout.vertical && <Glyph name={glyph} x={-w / 2 + 12} y={-12} size={24} blocked={blocked} {...state} />}
        <text x={textX} textAnchor={anchor} y={-3} fontSize={layout.vertical ? 12.5 : 14} fontWeight="500" className={blocked ? "fill-ground" : style.text}>
          {title}
        </text>
        <text key={sub} x={textX} textAnchor={anchor} y={15} fontSize="11.5" className={`fadeIn font-mono ${blocked ? "fill-ground" : style.sub}`}>
          {sub}
        </text>
      </g>
      {pips &&
        Array.from({ length: pips.total }, (_, index) => {
          const lit = index < pips.filled;
          return (
            <circle
              key={`${index}${lit}`}
              cx={index * 13 - (pips.total - 1) * 6.5}
              cy={h / 2}
              r={4.5}
              strokeWidth={1.5}
              className={`fillBox ${lit ? "pipSnap fill-copper stroke-copper" : "fill-surface stroke-jade"}`}
            />
          );
        })}
    </g>
  );
}

function Barrier({ layout }: { layout: Layout }) {
  const [a, b] = layout.barrier;
  return (
    <g className={layout.vertical ? "barrierFall" : "barrierWipe"}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth="6" strokeLinecap="round" className="stroke-persimmon" />
    </g>
  );
}
