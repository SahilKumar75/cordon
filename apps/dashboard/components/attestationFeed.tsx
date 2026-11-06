"use client";

import Link from "next/link";
import { attestationSchema, detectorIds } from "@cordon/shared";
import { usePolled } from "@/lib/api";
import { detectorNames, formatClock } from "@/lib/format";
import { useQuorum } from "@/lib/useQuorum";
import { ChainLink, QueryState, SimulatedTag, Status } from "./ui";

export function VerdictsNote() {
  const quorum = useQuorum();
  return quorum === undefined
    ? "Newest first. Malicious verdicts go to SealRegistry; a quorum of distinct detectors seals a version."
    : `Newest first. Malicious verdicts go to SealRegistry; ${quorum} of ${detectorIds.length} distinct detectors seal a version.`;
}

export function AttestationFeed() {
  const query = usePolled("watcher", "/attestations", attestationSchema.array());
  return (
    <QueryState
      query={query}
      loading="Loading attestations from the watcher."
      empty="No detector has submitted a verdict yet."
      isEmpty={(items) => items.length === 0}
    >
      {(items) => (
        <ul className="divide-y divide-line border border-line bg-panel">
          {items.slice(0, 40).map((item, index) => (
            <li
              key={`${item.key}${item.detector}`}
              className="slideIn relative flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 pl-5"
              style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
            >
              {item.malicious && <span className="borderGrow absolute inset-y-0 left-0 w-1 bg-accent" aria-hidden="true" />}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <Status icon={item.malicious ? "blocked" : "check"} tone={item.malicious ? "accent" : "clean"}>
                  {item.malicious ? "Malicious" : "Clean"}
                </Status>
                <Link href={`/seal/${item.key}`} className="font-mono text-sm underline decoration-line underline-offset-4 hover:text-accent">
                  {item.name}@{item.version}
                </Link>
                <span className="text-sm text-muted">{detectorNames[item.detector]}</span>
                {item.simulated && <SimulatedTag />}
              </div>
              <div className="flex items-center gap-4 text-sm text-muted">
                <span className="font-mono tabular-nums">{formatClock(item.submittedAt)}</span>
                {item.txHash ? (
                  <ChainLink kind="tx" value={item.txHash} />
                ) : item.malicious ? (
                  <Status icon="pending" tone="muted">Not on chain yet</Status>
                ) : (
                  <Status icon="info" tone="muted">Clean, kept off chain</Status>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </QueryState>
  );
}
