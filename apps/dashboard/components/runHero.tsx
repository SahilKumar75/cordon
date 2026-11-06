"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useReadContract } from "wagmi";
import {
  attestationSchema,
  detectorIds,
  sealRegistryAbi,
  sealStatusNames,
  stopwatchSchema,
  type Attestation,
  type DetectorId,
  type Hex32,
  type Stopwatch,
} from "@cordon/shared";
import { usePolled } from "@/lib/api";
import { registryAddress } from "@/lib/env";
import { detectorNames, formatGap } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { useQuorum } from "@/lib/useQuorum";
import { FlowDiagram } from "./flowDiagram";
import { ChainLink, QueryState, SimulatedTag } from "./ui";

const VaultScene = dynamic(() => import("./vaultScene"), { ssr: false });

const stages = [
  { field: "publishedAt", label: "published" },
  { field: "firstVerdictAt", label: "first vote" },
  { field: "sealedAt", label: "sealed" },
  { field: "firstBlockAt", label: "blocked" },
] as const;

const recentWindowMs = 5 * 60 * 1000;

type Stage = 0 | 1 | 2 | 3 | 4;
type Votes = Partial<Record<DetectorId, boolean>>;
type Cell = { label: string; ms: number | null; tone: string; live: boolean };

export function RunHero({ showVotes = false }: { showVotes?: boolean }) {
  const query = usePolled("watcher", "/stopwatch", stopwatchSchema.array());
  return (
    <QueryState query={query} loading="Loading the stopwatch from the watcher.">
      {(watches) => {
        const latest = watches
          .filter((watch) => watch.firstVerdictAt || Date.now() - Date.parse(watch.publishedAt) < recentWindowMs)
          .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0];
        return latest ? (
          <Run watch={latest} showVotes={showVotes} />
        ) : (
          <Layout
            headline="Every version passes the vault"
            line={`${detectorIds.length} detectors watching npm`}
            stage={0}
            votes={{}}
            sealed={false}
            version={null}
            cells={stages.map(({ label }) => ({ label, ms: null, tone: "text-jade", live: false }))}
          />
        );
      }}
    </QueryState>
  );
}

function Run({ watch, showVotes }: { watch: Stopwatch; showVotes: boolean }) {
  const now = useNow(100);
  const attestations = usePolled("watcher", "/attestations", attestationSchema.array());
  const verdicts = (attestations.data ?? []).filter((item) => item.key === watch.key);
  const votes: Votes = {};
  for (const item of verdicts) votes[item.detector] = votes[item.detector] || item.malicious;
  const voted = Object.keys(votes).length;
  const malicious = Object.values(votes).filter(Boolean).length;
  const times = stages.map(({ field }) => {
    const value = watch[field];
    return value ? Date.parse(value) : null;
  });
  const start = times[0] ?? now;
  const sealedAt = times[2] ?? null;
  const clean = sealedAt === null && voted === detectorIds.length && malicious === 0;
  const openIndex = clean ? -1 : times.indexOf(null);
  const seal = useReadContract({
    address: registryAddress,
    abi: sealRegistryAbi,
    functionName: "getSeal",
    args: [watch.key as Hex32],
    query: { enabled: Boolean(registryAddress) && sealedAt !== null, refetchInterval: 4000 },
  });
  const sealed = sealedAt !== null && seal.data !== undefined && sealStatusNames[seal.data.status] === "Sealed";
  return (
    <>
      <Layout
        headline={sealedAt !== null ? `Sealed in ${formatGap(sealedAt - start)}` : clean ? `${watch.version} passed clean` : `Inspecting ${watch.version}`}
        head={
          <>
            <Link href={`/seal/${watch.key}`} className="pointer-events-auto hover:text-copper">
              {watch.name}@{watch.version}
            </Link>
            {watch.simulated && <SimulatedTag />}
          </>
        }
        line={
          voted === 0
            ? "Waiting for detector votes"
            : clean
              ? `${voted} of ${detectorIds.length} detectors found it clean`
              : `${malicious} of ${detectorIds.length} detectors agreed`
        }
        stage={(openIndex === -1 ? (clean ? 2 : 4) : openIndex) as Stage}
        votes={votes}
        sealed={sealed}
        version={watch.version}
        cells={stages.map(({ label }, index) => {
          const at = times[index] ?? null;
          if (index === openIndex) return { label, ms: now - start, tone: "text-copper", live: true };
          if (at === null) return { label, ms: null, tone: "text-jade", live: false };
          return { label, ms: at - start, tone: index === 3 ? "text-persimmon" : "text-bone", live: false };
        })}
      />
      {showVotes && <VoteRows verdicts={verdicts} />}
    </>
  );
}

function Layout({
  headline,
  head,
  line,
  stage,
  votes,
  sealed,
  version,
  cells,
}: {
  headline: string;
  head?: ReactNode;
  line: string;
  stage: Stage;
  votes: Votes;
  sealed: boolean;
  version: string | null;
  cells: Cell[];
}) {
  const quorum = useQuorum();
  const [webgl, setWebgl] = useState<boolean | null>(null);
  useEffect(() => {
    const canvas = document.createElement("canvas");
    setWebgl(Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl")));
  }, []);
  const copy = (
    <div className="max-w-2xl" aria-live="polite">
      <h1 key={headline} className="fadeIn font-serif text-[72px] leading-[0.95] tracking-[-0.015em] lg:text-[96px]">
        {headline}
      </h1>
      {head && <div className="mt-7 flex flex-wrap items-center gap-3 text-[15px]">{head}</div>}
      <p className={`${head ? "mt-2" : "mt-7"} text-[14px] text-jade`}>{line}</p>
    </div>
  );
  return (
    <section>
      {webgl === false ? (
        <>
          {copy}
          <FlowDiagram stage={stage} version={version} votes={votes} />
        </>
      ) : (
        <div className="fullBleed relative h-[560px]">
          <div className="absolute inset-0">
            {webgl && (
              <VaultScene
                stage={stage}
                votes={Object.values(votes).filter(Boolean).length}
                quorum={quorum ?? null}
                sealed={sealed}
                versionLabel={version}
              />
            )}
          </div>
          <div className="pointer-events-none relative mx-auto max-w-7xl px-4 pt-14 sm:px-8">{copy}</div>
        </div>
      )}
      <ol className="grid grid-cols-2 gap-y-3 border-y border-plum py-4 sm:grid-cols-4">
        {cells.map((cell) => (
          <li key={cell.label} className="flex items-baseline gap-3">
            <span className="text-[12px] text-jade">{cell.label}</span>
            <span className={`text-[16px] tabular-nums ${cell.tone}`}>
              {cell.ms === null ? "not yet" : <StripTime ms={cell.ms} live={cell.live} />}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StripTime({ ms, live }: { ms: number; live: boolean }) {
  const [shown, setShown] = useState(live ? ms : 0);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  useEffect(() => {
    if (live || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(ms);
      return;
    }
    const from = shownRef.current;
    const begin = performance.now();
    let frame = requestAnimationFrame(function step(at) {
      const progress = Math.min(1, (at - begin) / 700);
      setShown(from + (ms - from) * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [ms, live]);
  return <span className="fadeIn">{formatGap(live ? ms : shown)}</span>;
}

function VoteRows({ verdicts }: { verdicts: Attestation[] }) {
  return (
    <section className="mt-16">
      <h2 className="mb-4 font-serif text-[28px] leading-8">Detector votes</h2>
      {verdicts.length === 0 ? (
        <p className="border-t border-plum py-4 text-[13px] text-jade">No votes yet</p>
      ) : (
        <ul className="divide-y divide-plum border-y border-plum">
          {verdicts.slice(0, 3).map((item, index) => (
            <li
              key={item.detector}
              className="slideIn flex flex-wrap items-center gap-x-10 gap-y-1 py-4 text-[14px]"
              style={{ animationDelay: `${index * 90}ms` }}
            >
              <span className="w-40">{detectorNames[item.detector]}</span>
              <span className={`w-24 ${item.malicious ? "text-persimmon" : "text-jade"}`}>{item.malicious ? "Malicious" : "Clean"}</span>
              {item.simulated && <SimulatedTag />}
              <span className="ml-auto">{item.txHash ? <ChainLink kind="tx" value={item.txHash} /> : <span className="text-[13px] text-jade">off chain</span>}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
