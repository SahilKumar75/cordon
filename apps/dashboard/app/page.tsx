import { AttestationFeed } from "@/components/attestationFeed";
import { LatestStopwatch } from "@/components/stopwatch";
import { PageHeader, SectionTitle } from "@/components/ui";

export default function Home() {
  return (
    <>
      <PageHeader title="Latest seal">
        Time from publish to the first guard block for the most recent version with a verdict or still under scan. Refreshes every 2
        seconds.
      </PageHeader>
      <LatestStopwatch />
      <SectionTitle note="Verdicts detectors submitted to SealRegistry, newest first.">Attestations</SectionTitle>
      <AttestationFeed />
    </>
  );
}
