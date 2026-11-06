"use client";

import Link from "next/link";
import { stopwatchSchema, type Stopwatch as StopwatchData } from "@bulkhead/shared";
import { usePolled } from "@/lib/api";
import { formatClock, formatGap } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { Notice, QueryState, SimulatedTag, Status } from "./ui";

const stages = [
  { field: "publishedAt", label: "Published", waiting: "" },
  { field: "firstVerdictAt", label: "First verdict", waiting: "Waiting for a detector verdict" },
  { field: "sealedAt", label: "Quorum on chain", waiting: "Waiting for enough distinct detectors" },
  { field: "firstBlockAt", label: "First block", waiting: "Waiting for a guard to refuse it" },
] as const;

const recentWindowMs = 5 * 60 * 1000;

export function LatestStopwatch() {
  const query = usePolled("watcher", "/stopwatch", stopwatchSchema.array());
  return (
    <QueryState query={query} loading="Loading the stopwatch from the watcher.">
      {(watches) => {
        const latest = watches
          .filter((watch) => watch.firstVerdictAt || Date.now() - Date.parse(watch.publishedAt) < recentWindowMs)
          .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0];
        return latest ? (
          <Stopwatch watch={latest} />
        ) : (
          <Notice icon="info" tone="muted">
            No version is under scan and none has a verdict yet. When a version is published to the watched registry it shows up
            here within a few seconds.
          </Notice>
        );
      }}
    </QueryState>
  );
}

function Stopwatch({ watch }: { watch: StopwatchData }) {
  const now = useNow(200);
  const times = stages.map(({ field }) => {
    const value = watch[field];
    return value ? Date.parse(value) : null;
  });
  const start = times[0] ?? now;
  const openIndex = times.indexOf(null);
  const finished = openIndex === -1;
  return (
    <section className="border border-line bg-panel" aria-live="polite">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-line p-6">
        <div className="space-y-2">
          <Link href={`/seal/${watch.key}`} className="font-mono text-lg underline decoration-line underline-offset-4 hover:text-accent">
            {watch.name}@{watch.version}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            {finished ? (
              <Status icon="blocked" tone="accent">Blocked</Status>
            ) : (
              <Status icon="clock">Running</Status>
            )}
            {watch.simulated && <SimulatedTag />}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-4xl tabular-nums sm:text-5xl">{formatGap((finished ? (times[3] ?? now) : now) - start)}</div>
          <div className="text-sm text-muted">{finished ? "from publish to first block" : "since publish, still running"}</div>
        </div>
      </header>
      <ol className="grid sm:grid-cols-4">
        {stages.map((stage, index) => {
          const at = times[index] ?? null;
          const previous = times[index - 1] ?? start;
          const running = index === openIndex;
          return (
            <li key={stage.field} className="border-t border-line p-6 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0">
              <Status icon={at !== null ? "check" : running ? "clock" : "pending"} tone={at !== null ? "ink" : "muted"}>
                {stage.label}
              </Status>
              <div className={`mt-3 font-mono text-2xl tabular-nums ${at === null && !running ? "text-muted" : ""}`}>
                {at !== null ? (index === 0 ? "0.0 s" : `+${formatGap(at - previous)}`) : running ? formatGap(now - previous) : "not yet"}
              </div>
              <div className="mt-1 text-sm text-muted">
                {at !== null
                  ? `${index === 0 ? "" : `after ${stages[index - 1]?.label.toLowerCase()}, `}at ${formatClock(at)}`
                  : running
                    ? stage.waiting
                    : "Starts after the previous step"}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
