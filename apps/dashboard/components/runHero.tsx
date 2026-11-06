"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useReadContract } from "wagmi";
import {
  attestationSchema,
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
import { detectorNames, formatGap, shortHash } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { useQuorum } from "@/lib/useQuorum";
import { FlowDiagram } from "./flowDiagram";
import { SealStamp } from "./sealStamp";
import { ChainLink, QueryState, SimulatedTag } from "./ui";

const stages = [
  { field: "publishedAt", label: "published" },
  { field: "firstVerdictAt", label: "first vote" },
  { field: "sealedAt", label: "sealed" },
  { field: "firstBlockAt", label: "blocked" },
] as const;

const recentWindowMs = 5 * 60 * 1000;

const SealScene = dynamic(() => import("./sealScene"), { ssr: false });

type Stage = 0 | 1 | 2 | 3 | 4;
type Cell = { label: string; value: string; tone: string };

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
            head={<span>Publish 1.4.1 to start the clock</span>}
            clock="0.0s"
            clockTone="text-dim"
            stage={0}
            votes={{}}
            sealed={false}
            version={null}
            cells={stages.map(({ label }) => ({ label, value: "not yet", tone: "text-dim" }))}
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
  const votes: Partial<Record<DetectorId, boolean>> = {};
  for (const item of verdicts) votes[item.detector] = votes[item.detector] || item.malicious;
  const sealTx = verdicts.find((item) => item.malicious && item.txHash)?.txHash;
  const times = stages.map(({ field }) => {
    const value = watch[field];
    return value ? Date.parse(value) : null;
  });
  const start = times[0] ?? now;
  const openIndex = times.indexOf(null);
  const finished = openIndex === -1;
  const seal = useReadContract({
    address: registryAddress,
    abi: sealRegistryAbi,
    functionName: "getSeal",
    args: [watch.key as Hex32],
    query: { enabled: Boolean(registryAddress) && times[2] !== null, refetchInterval: 4000 },
  });
  const sealed = times[2] !== null && seal.data !== undefined && sealStatusNames[seal.data.status] === "Sealed";
  const label = `${watch.name}@${watch.version}`;
  return (
    <>
      <Layout
        head={
          <>
            <Link href={`/seal/${watch.key}`} className="hover:text-fg">
              {label}
            </Link>
            {watch.simulated && <SimulatedTag />}
          </>
        }
        clock={formatGap((finished ? (times[3] ?? now) : now) - start)}
        clockTone={finished ? "counterFlash text-signal" : "text-live"}
        clockLabel={finished ? "publish to blocked" : "since publish"}
        stamp={sealed && <SealStamp status="Sealed" size="large" label={label} footer={sealTx ? `tx ${shortHash(sealTx)}` : undefined} />}
        stage={(finished ? 4 : openIndex) as Stage}
        votes={votes}
        sealed={sealed}
        version={watch.version}
        cells={stages.map(({ label: stageLabel }, index) => {
          const at = times[index] ?? null;
          if (index === openIndex) return { label: stageLabel, value: formatGap(now - start), tone: "text-live" };
          if (at === null) return { label: stageLabel, value: "not yet", tone: "text-dim" };
          return { label: stageLabel, value: formatGap(at - start), tone: index === 3 ? "text-signal" : "text-fg" };
        })}
      />
      {showVotes && <Votes verdicts={verdicts} />}
    </>
  );
}

function Layout({
  head,
  clock,
  clockTone,
  clockLabel,
  stamp,
  stage,
  votes,
  sealed,
  version,
  cells,
}: {
  head: ReactNode;
  clock: string;
  clockTone: string;
  clockLabel?: string;
  stamp?: ReactNode;
  stage: Stage;
  votes: Partial<Record<DetectorId, boolean>>;
  sealed: boolean;
  version: string | null;
  cells: Cell[];
}) {
  const quorum = useQuorum();
  return (
    <section aria-live="polite">
      <div className="flex flex-wrap items-center gap-3 font-mono text-base text-dim">{head}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-16 gap-y-4">
        <div>
          <div className={`font-mono text-[72px] font-semibold leading-none tabular-nums tracking-[-0.04em] sm:text-[128px] ${clockTone}`}>
            {clock}
          </div>
          {clockLabel && <p className="mt-2 text-base text-dim">{clockLabel}</p>}
        </div>
        {stamp}
      </div>
      <figure className="mt-4">
        <SealScene
          stage={stage}
          votes={Object.values(votes).filter(Boolean).length}
          quorum={quorum ?? null}
          sealed={sealed}
          versionLabel={version}
          fallback={<FlowDiagram stage={stage} version={version} votes={votes} />}
        />
        <figcaption className="mt-1 text-xs text-dim">
          npm registry, three detector arches, the SealRegistry gate, then install, CI and services
        </figcaption>
      </figure>
      <ol className="mt-5 grid grid-cols-2 gap-y-4 border-t border-hair pt-4 sm:grid-cols-4">
        {cells.map((cell) => (
          <li key={cell.label}>
            <div className="text-xs text-dim">{cell.label}</div>
            <div className={`mt-1 font-mono text-[28px] font-medium leading-8 tabular-nums ${cell.tone}`}>{cell.value}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Votes({ verdicts }: { verdicts: Attestation[] }) {
  return (
    <section className="mt-14">
      <h2 className="mb-2 text-sm font-medium">Detector votes</h2>
      {verdicts.length === 0 ? (
        <p className="py-3 text-sm text-dim">No votes yet</p>
      ) : (
        <ul className="divide-y divide-hair border-t border-hair">
          {verdicts.slice(0, 3).map((item) => (
            <li key={item.detector} className="flex flex-wrap items-center gap-x-8 gap-y-1 py-3">
              <span className="w-40">{detectorNames[item.detector]}</span>
              <span className={`w-24 font-medium ${item.malicious ? "text-live" : "text-clean"}`}>{item.malicious ? "Malicious" : "Clean"}</span>
              {item.simulated && <SimulatedTag />}
              <span className="ml-auto text-dim">{item.txHash ? <ChainLink kind="tx" value={item.txHash} /> : <span className="text-sm">off chain</span>}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
