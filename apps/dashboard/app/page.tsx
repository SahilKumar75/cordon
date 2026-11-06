import { HowItWorks } from "@/components/howItWorks";
import { RunHero } from "@/components/runHero";
import { StatsBand } from "@/components/statsBand";

export default function Home() {
  return (
    <>
      <RunHero showVotes />
      <HowItWorks />
      <StatsBand />
    </>
  );
}
