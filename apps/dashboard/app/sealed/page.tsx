import { SealedTable } from "@/components/sealedTable";
import { ChainGate, ChainLink, PageHeader } from "@/components/ui";
import { registryAddress } from "@/lib/env";

export default function SealedPage() {
  return (
    <>
      <PageHeader title="Sealed versions">
        Every version SealRegistry has sealed, with its current status, read from the chain
        {registryAddress && (
          <>
            {" "}at <ChainLink kind="address" value={registryAddress} />
          </>
        )}
        . Names come from the latest signed snapshot, because the chain stores only the seal key.
      </PageHeader>
      <ChainGate>
        {(registry) => <SealedTable registry={registry} />}
      </ChainGate>
    </>
  );
}
