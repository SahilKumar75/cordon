"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { verifyMessage } from "viem";
import {
  hex32Schema,
  snapshotDigestOf,
  timelineEventSchema,
  type Hex32,
  type SignedSnapshot,
  type TimelineKind,
} from "@bulkhead/shared";
import { usePolled } from "@/lib/api";
import { chain, registryAddress, snapshotSigner } from "@/lib/env";
import { formatDateTime, plural, shortHash } from "@/lib/format";
import { verifyTimeline } from "@/lib/timeline";
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
  const head = snapshot.data?.snapshot.timelineHeads.find((item) => item.key === sealKey)?.hash as Hex32 | undefined;
  return (
    <QueryState
      query={timeline}
      loading="Loading the timeline from the watcher."
      empty="No timeline events for this version yet."
      isEmpty={(events) => events.length === 0}
    >
      {(events) => {
        const { linked, brokenAt, headIndex } = verifyTimeline(events, head);
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
            ) : (
              <Notice icon="check">
                Hash chain intact. Event {headIndex + 1} matches the signed snapshot head
                {newer > 0 ? `, and ${plural(newer, "newer event")} wait for the next signed snapshot.` : "."}
              </Notice>
            )}
            {snapshot.data && <SnapshotCheck signed={snapshot.data} />}
            <ol className="divide-y divide-line border border-line bg-panel">
              {events.map((event, index) => (
                <li key={event.hash} className="grid gap-2 p-4 sm:grid-cols-[2rem_1fr_auto] sm:items-start">
                  <span className="font-mono text-sm text-muted">{index + 1}</span>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <Status icon={kindView[event.kind].icon}>{kindView[event.kind].label}</Status>
                      <span className="text-sm text-muted">by {event.actor}</span>
                      {index === headIndex && <Status icon="sealed" tone="accent">Signed head</Status>}
                    </div>
                    <div className="text-sm text-muted">{formatDateTime(event.at)}</div>
                    <div className="flex flex-wrap items-center gap-4 font-mono text-xs text-muted">
                      <span title={event.hash}>hash {shortHash(event.hash)}</span>
                      {linked[index] ? <Status icon="link" tone="muted">Linked</Status> : <Status icon="warning" tone="accent">Broken link</Status>}
                    </div>
                  </div>
                  <div>
                    {event.ref && hex32Schema.safeParse(event.ref).success ? (
                      <ChainLink kind="tx" value={event.ref} />
                    ) : (
                      event.ref && <span className="font-mono text-sm text-muted">{event.ref}</span>
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

function SnapshotCheck({ signed }: { signed: SignedSnapshot }) {
  const { snapshot, signer, signature } = signed;
  const valid = useQuery({
    queryKey: ["snapshotSignature", signature],
    queryFn: () =>
      verifyMessage({ address: signer as Hex32, message: { raw: snapshotDigestOf(snapshot) }, signature: signature as Hex32 }),
  });
  const same = (a: string, b: string | undefined) => a.toLowerCase() === b?.toLowerCase();
  const rows: { ok: boolean | null; text: string }[] = [
    {
      ok: valid.data ?? null,
      text: valid.isPending ? "Checking the snapshot signature." : valid.data ? "Snapshot signature is valid." : "Snapshot signature does not verify.",
    },
    {
      ok: snapshotSigner ? same(signer, snapshotSigner) : null,
      text: snapshotSigner
        ? same(signer, snapshotSigner)
          ? "Signed by the expected snapshot signer."
          : `Signed by ${shortHash(signer)}, not the expected signer.`
        : "NEXT_PUBLIC_SNAPSHOT_SIGNER is not set, so the signer was not compared.",
    },
    { ok: snapshot.chainId === chain?.id, text: `Snapshot names chain ${snapshot.chainId}${snapshot.chainId === chain?.id ? ", the configured chain" : ", not the configured chain"}.` },
    { ok: same(snapshot.registry, registryAddress), text: `Snapshot names registry ${shortHash(snapshot.registry)}${same(snapshot.registry, registryAddress) ? ", the configured registry" : ", not the configured registry"}.` },
  ];
  return (
    <div className="border border-line p-4">
      <p className="mb-3 text-sm text-muted">
        Signed snapshot at block {snapshot.blockNumber}, generated {formatDateTime(snapshot.generatedAt)}.
      </p>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.text}>
            <Status icon={row.ok === null ? "info" : row.ok ? "check" : "warning"} tone={row.ok === false ? "accent" : row.ok === null ? "muted" : "ink"}>
              {row.text}
            </Status>
          </li>
        ))}
      </ul>
    </div>
  );
}
