import { notFound } from "next/navigation";
import { DemoControls } from "@/components/demoControls";
import { ReplayPanel } from "@/components/replayPanel";
import { RunHero } from "@/components/runHero";
import { SectionTitle } from "@/components/ui";
import { demoEnabled } from "@/lib/env";

export default function DemoPage() {
  return demoEnabled ? (
    <>
      <DemoControls />
      <RunHero />
      <SectionTitle>Replay: TanStack, May 2026</SectionTitle>
      <ReplayPanel />
    </>
  ) : (
    notFound()
  );
}
