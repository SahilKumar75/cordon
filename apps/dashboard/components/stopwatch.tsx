"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useReadContract } from "wagmi";
import {
  attestationSchema,
  sealRegistryAbi,
  sealStatusNames,
  stopwatchSchema,
  type DetectorId,
  type Hex32,
  type Stopwatch as StopwatchData,
} from "@cordon/shared";
import { usePolled } from "@/lib/api";
import { registryAddress } from "@/lib/env";
import { formatClock, formatGap, shortHash } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { useQuorum } from "@/lib/useQuorum";
import { FlowDiagram } from "./flowDiagram";
import { SealStamp } from "./sealStamp";
import { Notice, QueryState, SimulatedTag, Status, Tape } from "./ui";

const stages = [
  { field: "publishedAt", label: "Published", waiting: "" },
  { field: "firstVerdictAt", label: "First verdict", waiting: "Waiting for a detector verdict" },
  { field: "sealedAt", label: "Quorum on chain", waiting: "Waiting for enough distinct detectors" },
  { field: "firstBlockAt", label: "First block", waiting: "Armed. The clock stops at the first guard block" },
] as const;

const recentWindowMs = 5 * 60 * 1000;

const SealScene = dynamic(() => import("./sealScene"), { ssr: false });

type Visual = "diagram" | "scene";

function Flow({ visual, stage, version, votes, sealed }: { visual: Visual; stage: 0 | 1 | 2 | 3 | 4; version: string | null; votes: Partial<Record<DetectorId, boolean>>; sealed: boolean }) {
  const quorum = useQuorum();
  if (visual === "diagram") return <FlowDiagram stage={stage} version={version} votes={votes} />;
  const count = Object.values(votes).filter(Boolean).length;
  return (
    <div>
      <SealScene stage={stage} votes={count} quorum={quorum ?? null} sealed={sealed} versionLabel={version} />
      <p className="border-t border-line px-6 py-3 font-mono text-[11px] uppercase leading-4 tracking-[0.08em] text-muted">
        Left to right: npm registry, three detector arches, the SealRegistry gate, then install, CI and services
      </p>
    </div>
  );
}

export function LatestStopwatch({ visual = "diagram" }: { visual?: Visual }) {
  const query = usePolled("watcher", "/stopwatch", stopwatchSchema.array());
  return (
    <QueryState query={query} loading="Loading the stopwatch from the watcher.">
      {(watches) => {
        const latest = watches
          .filter((watch) => watch.firstVerdictAt || Date.now() - Date.parse(watch.publishedAt) < recentWindowMs)
          .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0];
        return latest ? (
          <Stopwatch watch={latest} visual={visual} />
        ) : (
          <section className="pressPanel border border-ink bg-panel">
            <Flow visual={visual} stage={0} version={null} votes={{}} sealed={false} />
            <div className="p-6">
              <Notice icon="info" tone="muted">
                Nothing in flight. Publish a version and the clock starts on the watcher&apos;s next poll.
              </Notice>
            </div>
          </section>
        );
      }}
    </QueryState>
  );
}

function useVotes(key: string) {
  const query = usePolled("watcher", "/attestations", attestationSchema.array());
  const votes: Partial<Record<DetectorId, boolean>> = {};
  let sealTx: string | undefined;
  for (const item of query.data ?? []) {
    if (item.key !== key) continue;
    votes[item.detector] = votes[item.detector] || item.malicious;
    if (item.malicious && item.txHash && !sealTx) sealTx = item.txHash;
  }
  return { votes, sealTx };
}

function useSealedOnChain(key: string, quorumReached: boolean) {
  const seal = useReadContract({
    address: registryAddress,
    abi: sealRegistryAbi,
    functionName: "getSeal",
    args: [key as Hex32],
    query: { enabled: Boolean(registryAddress) && quorumReached, refetchInterval: 4000 },
  });
  return quorumReached && seal.data !== undefined && sealStatusNames[seal.data.status] === "Sealed";
}

function Stopwatch({ watch, visual }: { watch: StopwatchData; visual: Visual }) {
  const now = useNow(200);
  const { votes, sealTx } = useVotes(watch.key);
  const times = stages.map(({ field }) => {
    const value = watch[field];
    return value ? Date.parse(value) : null;
  });
  const start = times[0] ?? now;
  const openIndex = times.indexOf(null);
  const finished = openIndex === -1;
  const sealed = useSealedOnChain(watch.key, times[2] !== null);
  const label = `${watch.name}@${watch.version}`;
  return (
    <section className={`pressPanel border border-ink bg-panel ${sealed ? "pressBeat" : ""}`} aria-live="polite">
      <Flow visual={visual} stage={(finished ? 4 : openIndex) as 0 | 1 | 2 | 3 | 4} version={watch.version} votes={votes} sealed={sealed} />
      <header className="relative bg-night text-nightText">
        <div className="flex flex-wrap items-center justify-between gap-6 p-6">
          <div className="space-y-3">
            <Link href={`/seal/${watch.key}`} className="font-mono text-lg underline decoration-nightLine underline-offset-4 hover:text-paper">
              {label}
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              {finished ? (
                <Status icon="blocked" tone="blocked">Blocked</Status>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                  <TickingClock />
                  In flight
                </span>
              )}
              {watch.simulated && <SimulatedTag />}
            </div>
          </div>
          {sealed && <SealStamp status="Sealed" size="large" label={label} footer={sealTx ? `tx ${shortHash(sealTx)}` : undefined} onNight />}
          <div className="text-right">
            <div
              className={`font-mono text-5xl font-semibold tabular-nums tracking-[-0.02em] sm:text-[64px] sm:leading-[64px] ${finished ? "counterFlash text-accentOnNight" : "text-paper"}`}
            >
              {formatGap((finished ? (times[3] ?? now) : now) - start)}
            </div>
            <div className="mt-2 text-[13px] leading-5">{finished ? "from publish to first block" : "since publish, still in flight"}</div>
          </div>
        </div>
        {finished && <Tape tone="accent" className="block h-1.5 w-full" />}
      </header>
      <ol className="grid sm:grid-cols-4">
        {stages.map((stage, index) => {
          const at = times[index] ?? null;
          const previous = times[index - 1] ?? start;
          const running = index === openIndex;
          return (
            <li
              key={stage.field}
              className={`border-t border-line p-6 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0 ${at !== null ? "tileLock shadow-[inset_0_2px_0_var(--color-ink)]" : ""} ${running ? "shadow-[inset_0_0_0_2px_var(--color-ink)]" : ""}`}
            >
              {at !== null ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                  <TickMark />
                  {stage.label}
                </span>
              ) : running ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                  <TickingClock />
                  {stage.label}
                </span>
              ) : (
                <Status icon="pending" tone="muted">
                  {stage.label}
                </Status>
              )}
              <div
                className={`mt-3 font-mono text-[28px] font-medium leading-8 tabular-nums ${at === null && !running ? "text-muted" : ""} ${running ? "text-accent" : ""}`}
              >
                {at !== null ? (index === 0 ? "0.0 s" : `+${formatGap(at - previous)}`) : running ? formatGap(now - previous) : "not yet"}
              </div>
              <div className="mt-1 text-[13px] leading-5 text-muted">
                {at !== null
                  ? `${index === 0 ? "" : `after ${stages[index - 1]?.label.toLowerCase()}, `}at ${formatClock(at)}`
                  : running
                    ? stage.waiting
                    : "Next"}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function TickMark() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8.5l3.2 3.2L13 4.5" pathLength="1" strokeDasharray="1" className="tickDraw" />
    </svg>
  );
}

function TickingClock() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" className="text-accent">
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 8V4.2" className="clockHand" />
    </svg>
  );
}
