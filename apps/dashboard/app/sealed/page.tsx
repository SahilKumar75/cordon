import { SealedTable } from "@/components/sealedTable";
import { ChainGate, ChainLink, PageHeader } from "@/components/ui";
import { registryAddress } from "@/lib/env";

export default function SealedPage() {
  return (
    <>
      <PageHeader title="Sealed versions">
        Every guard blocks these versions, read live from SealRegistry{registryAddress && <> at <ChainLink kind="address" value={registryAddress} /></>}.
      </PageHeader>
      <ChainGate>{(registry) => <SealedTable registry={registry} />}</ChainGate>
    </>
  );
}
