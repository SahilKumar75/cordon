import { Guardian } from "@/components/guardian";
import { ChainGate, PageHeader } from "@/components/ui";

export default async function GuardianPage({ searchParams }: { searchParams: Promise<{ key?: string | string[] }> }) {
  const { key } = await searchParams;
  return (
    <>
      <PageHeader title="Guardian decisions">Only the guardian wallet seals, clears, unseals or reseals.</PageHeader>
      <ChainGate>
        {(registry) => <Guardian registry={registry} initialKey={typeof key === "string" ? key : ""} />}
      </ChainGate>
    </>
  );
}
