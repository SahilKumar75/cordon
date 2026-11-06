import { hex32Schema, type Hex32 } from "@cordon/shared";
import { SealDetail } from "@/components/sealDetail";
import { Notice, PageHeader } from "@/components/ui";

export default async function SealPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!hex32Schema.safeParse(key).success)
    return (
      <>
        <PageHeader eyebrow="02 Sealed" title="Unknown seal key" />
        <Notice icon="warning" tone="accent">
          A seal key is 0x followed by 64 lowercase hex characters. Open a version from the Sealed page or the attestation feed.
        </Notice>
      </>
    );
  return <SealDetail sealKey={key as Hex32} />;
}
