"use client";

import Link from "next/link";
import { attestationSchema, signedSnapshotSchema, type Hex32 } from "@cordon/shared";
import { usePolled } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { EvidenceList } from "./evidenceList";
import { TimelineView } from "./timelineView";
import { ResinBlock } from "./resinBlock";
import { PageHeader, SealStatus, SectionTitle, Status } from "./ui";

export function SealDetail({ sealKey }: { sealKey: Hex32 }) {
  const snapshot = usePolled("watcher", "/snapshot", signedSnapshotSchema, 4000);
  const attestations = usePolled("watcher", "/attestations", attestationSchema.array());
  const entry = snapshot.data?.snapshot.entries.find((item) => item.key === sealKey);
  const named = entry ?? attestations.data?.find((item) => item.key === sealKey);
  return (
    <>
      <PageHeader title={named ? `${named.name}@${named.version}` : "Version not named yet"}>
        <span className="break-all">{sealKey}</span>
      </PageHeader>
      <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
        {snapshot.isPending ? (
          <Status icon="clock" tone="muted">Loading the signed snapshot</Status>
        ) : snapshot.isError ? (
          <Status icon="warning" tone="accent">Signed snapshot did not load: {snapshot.error.message}</Status>
        ) : entry ? (
          <span className="flex items-center gap-5">
            <ResinBlock status={entry.status} size={88} />
            <SealStatus status={entry.status} />
            {entry.status === "Suspect" && entry.suspectUntil && (
              <span className="text-[13px] text-jade">
                {entry.votes} live vote{entry.votes === 1 ? "" : "s"}, expires {formatDateTime(entry.suspectUntil)} unless rescanned
              </span>
            )}
          </span>
        ) : (
          <Status icon="pending" tone="muted">Not in the latest signed snapshot</Status>
        )}
        <Link href={`/guardian?key=${sealKey}`} className="text-[13px] text-jade underline decoration-plum underline-offset-4 hover:text-bone">
          {entry?.status === "Suspect" ? "Promote or clear as guardian" : "Unseal or reseal as guardian"}
        </Link>
      </div>
      <details className="fold mt-12">
        <summary>Evidence by detector</summary>
        <div className="mt-4">
          <EvidenceList sealKey={sealKey} attestations={attestations} />
        </div>
      </details>
      <SectionTitle>Timeline</SectionTitle>
      <TimelineView sealKey={sealKey} snapshot={snapshot} />
    </>
  );
}
