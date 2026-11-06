import { AttestationFeed, VerdictsNote } from "@/components/attestationFeed";
import { LatestStopwatch } from "@/components/stopwatch";
import { PageHeader, SectionTitle } from "@/components/ui";

export default function Home() {
  return (
    <>
      <PageHeader eyebrow="01 Stopwatch" title="From publish to block">
        Seconds from npm publish to the first guard block, for the newest version in flight. Refreshes every 2 seconds.
      </PageHeader>
      <LatestStopwatch />
      <SectionTitle note={<VerdictsNote />}>Detector verdicts</SectionTitle>
      <AttestationFeed />
    </>
  );
}
