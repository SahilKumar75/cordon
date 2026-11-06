import { VaultShelf } from "@/components/vaultShelf";
import { ChainGate, ChainLink, PageHeader } from "@/components/ui";
import { registryAddress } from "@/lib/env";

export default function SealedPage() {
  return (
    <>
      <PageHeader title="The vault">
        Every guard blocks these versions, read live from SealRegistry{registryAddress && <> at <ChainLink kind="address" value={registryAddress} /></>}.
      </PageHeader>
      <ChainGate>{(registry) => <VaultShelf registry={registry} />}</ChainGate>
    </>
  );
}
