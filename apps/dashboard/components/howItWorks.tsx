"use client";

import { useRef, type ReactNode } from "react";
import { motion, useScroll, useSpring } from "motion/react";
import { attestationSchema, detectorIds, serviceStatusSchema, stopwatchSchema } from "@cordon/shared";
import { usePolled } from "@/lib/api";
import { formatClock, formatGap } from "@/lib/format";
import { useQuorum } from "@/lib/useQuorum";
import { GlyphBadge } from "./glyphs";
import { latestRun } from "./runHero";

const loop = { duration: 2.4, repeat: Infinity, ease: [0.65, 0, 0.35, 1] as const };

function PublishArt() {
  return (
    <svg viewBox="0 0 120 72" className="h-[72px] w-[120px]" fill="none" strokeWidth="1.5" aria-hidden="true">
      <path d="M10 60H110" className="stroke-plum" />
      <motion.g animate={{ y: [-26, 0, 0, -26], opacity: [0, 1, 1, 0] }} transition={{ ...loop, times: [0, 0.35, 0.8, 1] }}>
        <path d="M46 34l14-7 14 7v16l-14 7-14-7z" className="fill-surface stroke-copper" />
        <path d="M46 34l14 7 14-7M60 41v16" className="stroke-copper" />
      </motion.g>
    </svg>
  );
}

function VoteArt({ malicious }: { malicious: number }) {
  return (
    <div className="flex h-[72px] w-[120px] items-center justify-center gap-2">
      {detectorIds.map((detector, index) => (
        <motion.span
          key={detector}
          className={`rounded-md p-1 ${index < malicious ? "text-persimmon" : ""}`}
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, delay: index * 0.25, ease: "easeInOut" }}
        >
          <GlyphBadge name={detector} size={26} alarm={index < malicious} />
        </motion.span>
      ))}
    </div>
  );
}

function SealArt() {
  return (
    <svg viewBox="0 0 120 72" className="h-[72px] w-[120px]" fill="none" strokeWidth="1.5" aria-hidden="true">
      <rect x="38" y="30" width="44" height="32" rx="6" className="fill-surface stroke-persimmon" />
      <motion.path
        d="M48 30V22a12 12 0 0 1 24 0v8"
        className="stroke-persimmon"
        strokeWidth="2"
        animate={{ y: [-8, 0, 0, -8] }}
        transition={{ ...loop, times: [0, 0.3, 0.8, 1] }}
      />
      <circle cx="60" cy="46" r="3.5" className="fill-persimmon" />
    </svg>
  );
}

function BlockArt() {
  return (
    <svg viewBox="0 0 120 72" className="h-[72px] w-[120px]" fill="none" strokeWidth="1.5" aria-hidden="true">
      <path d="M8 44H112" strokeDasharray="4 5" className="flowPending stroke-jade" />
      <rect x="54" y="14" width="6" height="46" className="fill-surface stroke-bone" />
      <motion.rect
        x="60"
        y="38"
        width="44"
        height="10"
        rx="2"
        className="accentTrack"
        style={{ originX: 0, originY: 0.5 }}
        animate={{ rotate: [-70, 0, 0, -70] }}
        transition={{ ...loop, times: [0, 0.3, 0.8, 1] }}
      />
    </svg>
  );
}

type Step = { title: string; line: string; art: ReactNode; value: string; detail: string };

export function HowItWorks() {
  const stopwatch = usePolled("watcher", "/stopwatch", stopwatchSchema.array());
  const attestations = usePolled("watcher", "/attestations", attestationSchema.array());
  const services = usePolled("watcher", "/services", serviceStatusSchema.array());
  const quorum = useQuorum();
  const section = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: section, offset: ["start 75%", "end 55%"] });
  const rail = useSpring(scrollYProgress, { stiffness: 140, damping: 30 });
  const run = stopwatch.data ? latestRun(stopwatch.data) : undefined;
  const start = run ? Date.parse(run.publishedAt) : 0;
  const since = (at: string | null | undefined) => (at ? `+${formatGap(Date.parse(at) - start)}` : "not yet");
  const verdicts = run ? (attestations.data ?? []).filter((item) => item.key === run.key) : [];
  const voters = new Set(verdicts.map((item) => item.detector));
  const malicious = new Set(verdicts.filter((item) => item.malicious).map((item) => item.detector)).size;
  const blockedServices = run ? (services.data ?? []).filter((item) => item.report.blocked.some((entry) => entry.key === run.key)).length : 0;
  const steps: Step[] = [
    {
      title: "Publish",
      line: "A new version lands on npm.",
      art: <PublishArt />,
      value: run ? `${run.name}@${run.version}` : "no run yet",
      detail: run ? `at ${formatClock(run.publishedAt)}` : "waiting for a publish",
    },
    {
      title: `${detectorIds.length} detectors vote`,
      line: "Each one scans and signs a verdict.",
      art: <VoteArt malicious={malicious} />,
      value: `${malicious} of ${detectorIds.length} malicious`,
      detail: `${voters.size} voted, first ${since(run?.firstVerdictAt)}`,
    },
    {
      title: "Sealed on chain",
      line: "Distinct keys at quorum seal the version.",
      art: <SealArt />,
      value: run?.sealedAt ? since(run.sealedAt) : "not sealed",
      detail: `quorum ${quorum ?? "unknown"}`,
    },
    {
      title: "Guards block",
      line: "Install, CI and services refuse it.",
      art: <BlockArt />,
      value: since(run?.firstBlockAt),
      detail: `${blockedServices} service${blockedServices === 1 ? "" : "s"} blocked`,
    },
  ];
  return (
    <section ref={section} className="mt-20">
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-[32px] leading-9 sm:text-[40px] sm:leading-[44px]">How it works</h2>
        <span className="text-[12px] text-jade">live values from the latest run</span>
      </div>
      <div className="relative">
        <div aria-hidden="true" className="absolute bottom-6 left-[15px] top-6 w-[2px] rounded-full bg-plum">
          <motion.div className="accentTrack h-full w-full origin-top rounded-full" style={{ scaleY: rail }} />
        </div>
        <ol className="space-y-5">
          {steps.map((step, index) => (
            <motion.li
              key={step.title}
              className="relative grid grid-cols-[32px_1fr] gap-4"
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.6, delay: index * 0.06, ease: [0.2, 0.8, 0.3, 1] }}
            >
              <span className="relative z-10 mt-6 flex h-8 w-8 items-center justify-center rounded-full border border-copper bg-ground text-[12px] tabular-nums shadow-[var(--shadowSoft)]">
                {index + 1}
              </span>
              <div className="panel lift grid items-center gap-4 px-5 py-4 sm:grid-cols-[120px_1fr_auto] sm:gap-6">
                {step.art}
                <div>
                  <h3 className="font-display text-[22px] leading-7">{step.title}</h3>
                  <p className="text-[13px] text-jade">{step.line}</p>
                </div>
                <div className="min-w-0 sm:text-right">
                  <div className="break-all text-[15px] tabular-nums text-bone">{step.value}</div>
                  <div className="text-[12px] text-jade">{step.detail}</div>
                </div>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
