"use client";

import Link from "next/link";
import { attestationSchema, signedSnapshotSchema, type Hex32 } from "@bulkhead/shared";
import { usePolled } from "@/lib/api";
import { EvidenceList } from "./evidenceList";
import { TimelineView } from "./timelineView";
import { PageHeader, SealStatus, SectionTitle, Status } from "./ui";

export function SealDetail({ sealKey }: { sealKey: Hex32 }) {
  const snapshot = usePolled("watcher", "/snapshot", signedSnapshotSchema, 4000);
  const attestations = usePolled("watcher", "/attestations", attestationSchema.array());
  const entry = snapshot.data?.snapshot.entries.find((item) => item.key === sealKey);
  const named = entry ?? attestations.data?.find((item) => item.key === sealKey);
  return (
    <>
      <PageHeader title={<span className="font-mono">{named ? `${named.name}@${named.version}` : "Version not named yet"}</span>}>
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
