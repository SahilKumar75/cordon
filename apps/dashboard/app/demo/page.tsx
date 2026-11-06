import { notFound } from "next/navigation";
import { DemoControls } from "@/components/demoControls";
import { ReplayPanel } from "@/components/replayPanel";
import { RunHero } from "@/components/runHero";
import { demoEnabled } from "@/lib/env";

export default function DemoPage() {
  if (!demoEnabled) notFound();
  return (
    <>
      <DemoControls />
      <RunHero />
      <details className="fold mt-12">
        <summary>Replay: TanStack, May 2026</summary>
        <ReplayPanel />
      </details>
    </>
  );
}
