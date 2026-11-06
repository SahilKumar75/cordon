import { Guardian } from "@/components/guardian";
import { ChainGate, PageHeader } from "@/components/ui";

export default async function GuardianPage({ searchParams }: { searchParams: Promise<{ key?: string | string[] }> }) {
  const { key } = await searchParams;
  return (
    <>
      <PageHeader title="Undo a false seal">
        Only the guardian wallet can unseal, after the dispute window, or reseal.
      </PageHeader>
      <ChainGate>
        {(registry) => <Guardian registry={registry} initialKey={typeof key === "string" ? key : ""} />}
      </ChainGate>
    </>
  );
}
