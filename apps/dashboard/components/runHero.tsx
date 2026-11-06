"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
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
import { useWebgl } from "@/lib/useWebgl";
import { FlowDiagram } from "./flowDiagram";
import { GlyphBadge } from "./glyphs";
import { ChainLink, QueryState, SimulatedTag } from "./ui";
import { WordReveal } from "./wordReveal";

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

export const latestRun = (watches: Stopwatch[]) =>
  watches
    .filter((watch) => watch.firstVerdictAt || Date.now() - Date.parse(watch.publishedAt) < recentWindowMs)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))[0];

export function RunHero({ showVotes = false }: { showVotes?: boolean }) {
  const query = usePolled("watcher", "/stopwatch", stopwatchSchema.array());
  return (
    <QueryState query={query} loading="Loading the stopwatch from the watcher.">
      {(watches) => {
        const latest = latestRun(watches);
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
  const webgl = useWebgl();
  const calm = useReducedMotion();
  const [ascii, setAscii] = useState(false);
  const hero = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: hero, offset: ["start start", "end start"] });
  const copyY = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const copyFade = useTransform(scrollYProgress, [0, 0.75], [1, 0]);
  const done = cells.filter((cell) => cell.ms !== null && !cell.live).length;
  const reached = Math.min(1, (done + (cells.some((cell) => cell.live) ? 0.5 : 0)) / cells.length);
  const copy = (
    <motion.div className="max-w-2xl" aria-live="polite" style={calm ? undefined : { y: copyY, opacity: copyFade }}>
      <WordReveal text={headline} className="font-display text-[48px] leading-[0.95] sm:text-[56px] lg:text-[80px]" />
      {head && <div className="mt-7 flex flex-wrap items-center gap-3 text-[15px]">{head}</div>}
      <p className={`${head ? "mt-2" : "mt-7"} text-[14px] text-jade`}>{line}</p>
    </motion.div>
  );
  return (
    <section>
      {webgl === false ? (
        <div ref={hero} className="relative">
          <div aria-hidden="true" className="glowCopper pointer-events-none absolute -left-20 -top-24 h-[420px] w-[620px]" />
          <div className="relative">
            {copy}
            <FlowDiagram stage={stage} version={version} votes={votes} />
          </div>
        </div>
      ) : (
        <div ref={hero} className="fullBleed relative h-[480px] sm:h-[560px]">
          <div aria-hidden="true" className="glowCopper pointer-events-none absolute left-[8%] top-0 h-[420px] w-[min(720px,90vw)]" />
          <div aria-hidden="true" className="glowPersimmon pointer-events-none absolute bottom-0 right-[6%] h-[360px] w-[min(560px,80vw)]" />
          <div className="absolute inset-0">
            {webgl && (
              <VaultScene
                stage={stage}
                votes={Object.values(votes).filter(Boolean).length}
                quorum={quorum ?? null}
                sealed={sealed}
                versionLabel={version}
                ascii={ascii}
              />
            )}
          </div>
          <div className="pointer-events-none relative mx-auto max-w-7xl px-4 pt-10 sm:px-8 sm:pt-14">{copy}</div>
          {webgl && (
            <button
              type="button"
              aria-pressed={ascii}
              data-cursor={ascii ? "3d" : "ascii"}
              onClick={() => setAscii((value) => !value)}
              className="absolute bottom-10 right-4 rounded-md border border-plum bg-ground px-3 py-1.5 text-[12px] text-jade shadow-[var(--shadowSoft)] hover:text-bone sm:right-8"
            >
              {ascii ? "3D view" : "ASCII view"}
            </button>
          )}
        </div>
      )}
      <div className="panel relative z-10 -mt-6 px-5 pb-5 pt-4 sm:px-6">
        <ol className="grid grid-cols-2 gap-y-4 sm:grid-cols-4">
          {cells.map((cell, index) => (
            <motion.li
              key={cell.label}
              className="flex flex-col gap-1"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: 0.2 + index * 0.08, ease: [0.2, 0.8, 0.3, 1] }}
            >
              <span className="flex items-center gap-2 text-[12px] text-jade">
                <span className={`h-2 w-2 rounded-full ${cell.ms === null ? "bg-plum" : cell.live ? "bg-copper" : "accentTrack"}`} />
                {cell.label}
              </span>
              <span className={`text-[18px] tabular-nums ${cell.tone}`}>
                {cell.ms === null ? "not yet" : <StripTime ms={cell.ms} live={cell.live} />}
              </span>
            </motion.li>
          ))}
        </ol>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-plum">
          <motion.div
            className="accentTrack h-full origin-left rounded-full"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: reached }}
            transition={{ duration: 0.9, ease: [0.2, 0.8, 0.3, 1] }}
          />
        </div>
      </div>
    </section>
  );
}

function StripTime({ ms, live }: { ms: number; live: boolean }) {
  const calm = useReducedMotion();
  const spring = useSpring(live ? ms : 0, { stiffness: 60, damping: 18, restDelta: 1 });
  const text = useTransform(spring, formatGap);
  useEffect(() => {
    if (live || calm) spring.jump(ms);
    else spring.set(ms);
  }, [ms, live, calm, spring]);
  return <motion.span>{text}</motion.span>;
}

function VoteRows({ verdicts }: { verdicts: Attestation[] }) {
  return (
    <section className="mt-16">
      <h2 className="mb-5 font-display text-[28px] leading-8">Detector votes</h2>
      <ul className="grid gap-4 sm:grid-cols-3">
        {detectorIds.map((detector, index) => {
          const item = verdicts.find((verdict) => verdict.detector === detector);
          return (
            <motion.li
              key={detector}
              className={`panel lift flex flex-col gap-3 px-5 py-4 ${item?.malicious ? "text-persimmon" : "text-bone"}`}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: index * 0.09, ease: [0.2, 0.8, 0.3, 1] }}
            >
              <div className="flex items-center gap-3">
                <GlyphBadge name={detector} size={30} alarm={item?.malicious ?? false} active={item !== undefined} />
                <span className="text-[14px] text-bone">{detectorNames[detector]}</span>
                {item?.simulated && <span className="ml-auto"><SimulatedTag /></span>}
              </div>
              <div className="flex items-end justify-between gap-3">
                <span className={`font-display text-[26px] leading-none ${item ? (item.malicious ? "text-persimmon" : "text-jade") : "text-jade/60"}`}>
                  {item ? (item.malicious ? "Malicious" : "Clean") : "Waiting"}
                </span>
                {item && (item.txHash ? <ChainLink kind="tx" value={item.txHash} /> : <span className="text-[12px] text-jade">off chain</span>)}
              </div>
            </motion.li>
          );
        })}
      </ul>
    </section>
  );
}
