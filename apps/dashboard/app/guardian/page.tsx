import { Guardian } from "@/components/guardian";
import { ChainGate, PageHeader } from "@/components/ui";

export default async function GuardianPage({ searchParams }: { searchParams: Promise<{ key?: string | string[] }> }) {
  const { key } = await searchParams;
  return (
    <>
      <PageHeader title="Guardian">
        Unseal a version after the dispute window, or reseal it. Only the guardian address holds this role; the contract refuses
        any other wallet. A false seal is an outage we caused, so the reason is recorded on chain as a hash.
      </PageHeader>
      <ChainGate>
        {(registry) => <Guardian registry={registry} initialKey={typeof key === "string" ? key : ""} />}
      </ChainGate>
    </>
  );
}
