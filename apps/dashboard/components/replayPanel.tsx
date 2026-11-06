"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { replayTimelineSchema } from "@bulkhead/shared";
import { request } from "@/lib/api";
import { formatDateTime, formatGap } from "@/lib/format";
import { Icon } from "./icon";
import { Notice, Tag } from "./ui";

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
        <Notice icon="warning" tone="accent">
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
