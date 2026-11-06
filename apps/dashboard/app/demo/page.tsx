import { notFound } from "next/navigation";
import { DemoControls } from "@/components/demoControls";
import { ReplayPanel } from "@/components/replayPanel";
import { LatestStopwatch } from "@/components/stopwatch";
import { PageHeader, SectionTitle } from "@/components/ui";
import { demoEnabled } from "@/lib/env";

export default function DemoPage() {
  if (!demoEnabled) notFound();
  return (
    <>
      <PageHeader eyebrow="05 Demo" title="Poison a package, watch it stop">
        Publishes to the local demo registry only. The poisoned version reads a canary value and sends it to a local sink, so any
        exfiltration shown here is simulated, and so are the demo detectors.
      </PageHeader>
      <DemoControls />
      <SectionTitle note="The live run, measured on the demo chain and registry.">Live stopwatch</SectionTitle>
      <LatestStopwatch visual="scene" />
      <ReplayPanel />
    </>
  );
}
