"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { isAddress, isHex, verifyMessage } from "viem";
import {
  hex32Schema,
  snapshotDigestOf,
  timelineEventHashOf,
  timelineEventSchema,
  zeroHash,
  type Hex32,
  type SignedSnapshot,
  type TimelineKind,
} from "@cordon/shared";
import { usePolled } from "@/lib/api";
import { chain, registryAddress, snapshotSigner } from "@/lib/env";
import { formatDateTime, shortHash } from "@/lib/format";
import type { IconName } from "./icon";
import { ChainLink, Notice, QueryState, Status } from "./ui";

const kindView: Record<TimelineKind, { label: string; icon: IconName }> = {
  published: { label: "Published", icon: "info" },
  verdict: { label: "Verdict submitted", icon: "flask" },
  sealed: { label: "Sealed at quorum", icon: "sealed" },
  guardBlocked: { label: "Blocked by a guard", icon: "blocked" },
  unsealed: { label: "Unsealed by guardian", icon: "unsealed" },
  resealed: { label: "Resealed by guardian", icon: "sealed" },
};

export function TimelineView({ sealKey, snapshot }: { sealKey: Hex32; snapshot: UseQueryResult<SignedSnapshot> }) {
  const timeline = usePolled("watcher", `/timeline/${sealKey}`, timelineEventSchema.array());
  const signed = snapshot.data;
  const signatureValid = useQuery({
    queryKey: ["snapshotSignature", signed?.signature],
    enabled: signed !== undefined,
    queryFn: () =>
      signed !== undefined && isAddress(signed.signer, { strict: false }) && isHex(signed.signature)
        ? verifyMessage({ address: signed.signer, message: { raw: snapshotDigestOf(signed.snapshot) }, signature: signed.signature })
        : false,
  });
  const head = signed?.snapshot.timelineHeads.find((item) => item.key === sealKey)?.hash;
  const checks = signed ? snapshotChecks(signed, signatureValid.data) : [];
  const trusted = checks.length > 0 && checks.every((check) => check.ok === true);
  return (
    <QueryState
      query={timeline}
      loading="Loading the timeline from the watcher."
      empty="No timeline events for this version yet."
      isEmpty={(events) => events.length === 0}
    >
      {(events) => {
        const linked = events.map(
          (event, index) =>
            timelineEventHashOf(event) === event.hash && event.prevHash === (index === 0 ? zeroHash : events[index - 1]?.hash),
        );
        const brokenAt = linked.indexOf(false);
        const headIndex = head ? events.findIndex((event) => event.hash === head) : -1;
        const newer = events.length - 1 - headIndex;
        return (
          <div className="space-y-4">
            {brokenAt >= 0 ? (
              <Notice icon="warning" tone="accent">
                Hash chain broken at event {brokenAt + 1}. Events from there on cannot be trusted.
              </Notice>
            ) : snapshot.status !== "success" ? (
              <Notice icon="info" tone="muted">
                Every hash link checks out. The signed snapshot has not loaded, so the chain is not anchored to a signed head yet.
              </Notice>
            ) : !head ? (
              <Notice icon="info" tone="muted">
                Every hash link checks out. The signed snapshot has no head for this version yet.
              </Notice>
            ) : headIndex === -1 ? (
              <Notice icon="warning" tone="accent">
                The signed head for this version does not appear in this timeline.
              </Notice>
            ) : !trusted ? (
              <Notice icon="warning" tone="accent">
                Every hash link checks out and event {headIndex + 1} matches the snapshot head, but the snapshot failed or skipped a check
                below, so this head is not trusted.
              </Notice>
            ) : (
              <Notice icon="check">
                Hash chain intact. Event {headIndex + 1} matches the signed snapshot head
                {newer > 0 ? `, and ${newer} newer event${newer === 1 ? "" : "s"} wait for the next signed snapshot.` : "."}
              </Notice>
            )}
            {signed && (
              <div>
                <p className="mb-3 text-sm text-dim">
                  Signed snapshot at block {signed.snapshot.blockNumber}, generated {formatDateTime(signed.snapshot.generatedAt)}.
                </p>
                <ul className="space-y-2">
                  {checks.map((check) => (
                    <li key={check.text}>
                      <Status
                        icon={check.ok === null ? "info" : check.ok ? "check" : "warning"}
                        tone={check.ok === false ? "accent" : check.ok === null ? "muted" : "ink"}
                      >
                        {check.text}
                      </Status>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ol className="divide-y divide-hair border-t border-hair">
              {events.map((event, index) => (
                <li key={event.hash} className="grid gap-2 py-4 sm:grid-cols-[2rem_1fr_auto] sm:items-start">
                  <span className="font-mono text-sm text-dim">{index + 1}</span>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <Status icon={kindView[event.kind].icon}>{kindView[event.kind].label}</Status>
                      <span className="text-sm text-dim">by {event.actor}</span>
                      {index === headIndex && <Status icon="sealed" tone="accent">Signed head</Status>}
                    </div>
                    <div className="text-sm text-dim">{formatDateTime(event.at)}</div>
                    <div className="flex flex-wrap items-center gap-4 font-mono text-xs text-dim">
                      <span title={event.hash}>hash {shortHash(event.hash)}</span>
                      {linked[index] ? <Status icon="link" tone="muted">Linked</Status> : <Status icon="warning" tone="accent">Broken link</Status>}
                    </div>
                  </div>
                  <div>
                    {event.ref && hex32Schema.safeParse(event.ref).success ? (
                      <ChainLink kind="tx" value={event.ref} />
                    ) : (
                      event.ref && <span className="font-mono text-sm text-dim">{event.ref}</span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        );
      }}
    </QueryState>
  );
}

function snapshotChecks({ snapshot, signer }: SignedSnapshot, signatureValid: boolean | undefined) {
  const same = (a: string, b: string | undefined) => a.toLowerCase() === b?.toLowerCase();
  const chainMatches = snapshot.chainId === chain?.id;
  const registryMatches = same(snapshot.registry, registryAddress);
  return [
    {
      ok: signatureValid ?? null,
      text:
        signatureValid === undefined
          ? "Checking the snapshot signature."
          : signatureValid
            ? "Snapshot signature is valid."
            : "Snapshot signature does not verify.",
    },
    {
      ok: snapshotSigner ? same(signer, snapshotSigner) : null,
      text: snapshotSigner
        ? same(signer, snapshotSigner)
          ? "Signed by the expected snapshot signer."
          : `Signed by ${shortHash(signer)}, not the expected signer.`
        : "NEXT_PUBLIC_SNAPSHOT_SIGNER is not set, so the signer was not compared.",
    },
    {
      ok: chainMatches,
      text: `Snapshot names chain ${snapshot.chainId}, ${chainMatches ? "the configured chain" : "not the configured chain"}.`,
    },
    {
      ok: registryMatches,
      text: `Snapshot names registry ${shortHash(snapshot.registry)}, ${registryMatches ? "the configured registry" : "not the configured registry"}.`,
    },
  ];
}
