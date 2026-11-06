"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { replayTimelineSchema } from "@cordon/shared";
import { request } from "@/lib/api";
import { formatDateTime, formatGap } from "@/lib/format";
import { Icon } from "./icon";
import { BrokenLine, Notice, Tag } from "./ui";

export function ReplayPanel() {
  const [advisoryId, setAdvisoryId] = useState("");
  const replay = useMutation({
    mutationFn: (id: string) => request("detectors", "/replay", replayTimelineSchema, { advisoryId: id }),
  });
  return (
    <section className="mt-16 space-y-4 border-2 border-dashed border-muted p-6" aria-label="Historical replay">
      <div className="flex flex-wrap items-center gap-3">
        <Tag icon="replay">Replay</Tag>
        <h2 className="text-lg font-semibold tracking-tight">Historical replay</h2>
      </div>
      <p className="max-w-2xl text-sm text-muted">
        Rebuilt from public advisory and registry records of a real past incident. Timeline only: nothing is downloaded, run,
        sealed or written to any chain, and it is separate from the live stopwatch above.
      </p>
      <form
        className="flex flex-wrap gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (advisoryId.trim()) replay.mutate(advisoryId.trim());
        }}
      >
        <input
          className="field max-w-sm"
          value={advisoryId}
          onChange={(event) => setAdvisoryId(event.target.value)}
          placeholder="OSV advisory id"
          aria-label="OSV advisory id"
        />
        <button className="button" disabled={!advisoryId.trim() || replay.isPending}>
          {replay.isPending ? "Building replay" : "Build replay"}
        </button>
      </form>
      {!replay.isError && (
        <ReplayRuler
          pending={replay.isPending}
          times={replay.data ? replay.data.events.map((event) => Date.parse(event.at)).sort((a, b) => a - b) : []}
        />
      )}
      {replay.isIdle && (
        <Notice icon="info" tone="muted">
          No replay loaded. Enter an OSV advisory id for a malicious npm package to build one.
        </Notice>
      )}
      {replay.isPending && (
        <Notice icon="clock" tone="muted">
          Reading public sources for this advisory.
        </Notice>
      )}
      {replay.isError && (
        <Notice icon="warning" tone="accent" art={<BrokenLine label="detectors" />}>
          {replay.error.message}
        </Notice>
      )}
      {replay.data && (
        <div className="space-y-4">
          <p className="text-sm">
            Replay of{" "}
            <a href={replay.data.advisoryUrl} target="_blank" rel="noreferrer" className="font-mono underline underline-offset-4 hover:text-accent">
              {replay.data.advisoryId}
            </a>{" "}
            for <span className="font-mono">{replay.data.packages.map((item) => `${item.name}@${item.version}`).join(", ")}</span>
          </p>
          {replay.data.events.length === 0 ? (
            <Notice icon="info" tone="muted">
              The public sources list no dated events for this advisory.
            </Notice>
          ) : (
            <ol className="divide-y divide-line border border-line">
              {[...replay.data.events]
                .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
                .map((event, index, sorted) => (
                  <li key={`${event.label}${event.at}`} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Icon name="replay" />
                        {event.label}
                      </div>
                      <div className="text-sm text-muted">{formatDateTime(event.at)}</div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="font-mono tabular-nums text-muted">
                        {index === 0 ? "start" : `+${formatGap(Date.parse(event.at) - Date.parse(sorted[0]?.at ?? event.at))}`}
                      </span>
                      <a href={event.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-4 hover:text-accent">
                        Source
                        <Icon name="external" />
                      </a>
                    </div>
                  </li>
                ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}

function ReplayRuler({ pending, times }: { pending: boolean; times: number[] }) {
  const first = times[0] ?? 0;
  const span = Math.log10(1 + ((times[times.length - 1] ?? first) - first) / 1000) || 1;
  const xOf = (at: number) => 30 + (Math.log10(1 + (at - first) / 1000) / span) * 460;
  return (
    <svg viewBox="0 0 640 80" className="h-auto w-full max-w-[640px]" fill="none" strokeWidth="1.5" aria-hidden="true">
      <path d="M20 44H510" strokeDasharray={times.length === 0 && !pending ? "4 6" : undefined} className="stroke-muted" />
      {(pending || times.length > 0) &&
        Array.from({ length: 11 }, (_, index) => (
          <path
            key={index}
            d={`M${30 + index * 46} ${index % 5 === 0 ? 36 : 40}V48`}
            pathLength={1}
            strokeDasharray="1"
            className="rulerTick stroke-muted"
            style={{ animationDelay: `${index * 40}ms` }}
          />
        ))}
      {times.map((at, index) => (
        <g key={`${at}${index}`} className="font-mono">
          <circle cx={xOf(at)} cy="44" r="5" className="fill-panel stroke-ink" />
          <text x={xOf(at)} y={index % 2 === 0 ? 24 : 70} textAnchor="middle" fontSize="10" className="fill-ink">
            {index === 0 ? "start" : `+${formatGap(at - first)}`}
          </text>
        </g>
      ))}
      <g transform="rotate(-4 578 44)" className="stroke-muted">
        <rect x="532" y="28" width="92" height="32" strokeWidth="2" />
        <text x="578" y="49" textAnchor="middle" fontSize="13" fontWeight="600" letterSpacing="3" className="fill-muted font-mono" stroke="none">
          REPLAY
        </text>
      </g>
    </svg>
  );
}
