"use client";

import { attestationSchema, serviceStatusSchema, signedSnapshotSchema } from "@cordon/shared";
import { usePolled } from "@/lib/api";
import { useQuorum } from "@/lib/useQuorum";
import { CountUp } from "./countUp";
import { Reveal } from "./reveal";
import { Stat } from "./ui";

const shown = (value: number | undefined) => (value === undefined ? <span className="text-[22px] text-jade">unknown</span> : <CountUp value={value} />);

export function StatsBand() {
  const attestations = usePolled("watcher", "/attestations", attestationSchema.array());
  const snapshot = usePolled("watcher", "/snapshot", signedSnapshotSchema, 4000);
  const services = usePolled("watcher", "/services", serviceStatusSchema.array());
  const quorum = useQuorum();
  const stats = [
    { label: "versions scanned", value: attestations.data && new Set(attestations.data.map((item) => item.key)).size, tone: "text-bone" },
    {
      label: "sealed versions",
      value: snapshot.data?.snapshot.entries.filter((entry) => entry.status === "Sealed").length,
      tone: "text-persimmon",
    },
    { label: "services reporting", value: services.data?.length, tone: "text-bone" },
    { label: "quorum on chain", value: quorum, tone: "text-copper" },
  ];
  return (
    <section className="mt-20">
      <div className="hairline mb-8" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <Reveal key={stat.label} index={index}>
            <Stat label={stat.label} value={shown(stat.value)} tone={stat.tone} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
