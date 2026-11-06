"use client";

import Link from "next/link";
import { attestationSchema, signedSnapshotSchema, type Hex32 } from "@cordon/shared";
import { usePolled } from "@/lib/api";
import { shortHash } from "@/lib/format";
import { EvidenceList } from "./evidenceList";
import { TimelineView } from "./timelineView";
import { SealStamp } from "./sealStamp";
import { PageHeader, SealStatus, SectionTitle, Status } from "./ui";

export function SealDetail({ sealKey }: { sealKey: Hex32 }) {
  const snapshot = usePolled("watcher", "/snapshot", signedSnapshotSchema, 4000);
  const attestations = usePolled("watcher", "/attestations", attestationSchema.array());
  const entry = snapshot.data?.snapshot.entries.find((item) => item.key === sealKey);
  const named = entry ?? attestations.data?.find((item) => item.key === sealKey);
  return (
    <>
      <PageHeader eyebrow="02 Sealed" title={<span className="font-mono">{named ? `${named.name}@${named.version}` : "Version not named yet"}</span>}>
        <div className="space-y-3">
          <p className="break-all font-mono text-sm">{sealKey}</p>
          <div className="flex flex-wrap items-center gap-4">
            {snapshot.isPending ? (
              <Status icon="clock" tone="muted">Loading the signed snapshot</Status>
            ) : snapshot.isError ? (
              <Status icon="warning" tone="accent">Signed snapshot did not load: {snapshot.error.message}</Status>
            ) : entry ? (
              <SealStatus status={entry.status} />
            ) : (
              <Status icon="pending" tone="muted">Not in the latest signed snapshot</Status>
            )}
            <Link href={`/guardian?key=${sealKey}`} className="text-sm underline decoration-line underline-offset-4 hover:text-accent">
              Unseal or reseal as guardian
            </Link>
          </div>
        </div>
      </PageHeader>
      <div className="flex items-center">
        <svg viewBox="0 0 640 96" className="h-auto w-full max-w-[640px]" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="638" height="94" strokeWidth="1.5" className="fill-panel stroke-ink" />
          <path d="M260 1v94M380 1v94M500 1v94M1 32h638" strokeWidth="1" className="stroke-line" />
          {[
            { x: 14, label: "package", value: named?.name ?? "unknown" },
            { x: 274, label: "version", value: named?.version ?? "unknown" },
            { x: 394, label: "key", value: shortHash(sealKey) },
            { x: 514, label: "status", value: entry ? entry.status.toLowerCase() : "not in snapshot" },
          ].map((cell) => (
            <g key={cell.label} className="font-mono">
              <text x={cell.x} y="21" fontSize="11" className="fill-muted">
                {cell.label}
              </text>
              <text x={cell.x} y="70" fontSize={cell.value.length > 22 ? 12 : 15} fontWeight="500" className="fill-ink">
                {cell.value}
              </text>
            </g>
          ))}
        </svg>
        {entry && entry.status !== "None" && (
          <div className="pointer-events-none -ml-5 hidden shrink-0 lg:block">
            <SealStamp status={entry.status} size="large" label={`${entry.name}@${entry.version}`} />
          </div>
        )}
      </div>
      <SectionTitle note="Each detector writes its own evidence. The dashboard hashes it again here and compares with the hash in the verdict.">
        Evidence by detector
      </SectionTitle>
      <EvidenceList sealKey={sealKey} attestations={attestations} />
      <SectionTitle note="Every event hash is recomputed in this browser, each link is checked, and the chain is matched to the head in the signed snapshot.">
        Timeline
      </SectionTitle>
      <TimelineView sealKey={sealKey} snapshot={snapshot} />
    </>
  );
}
