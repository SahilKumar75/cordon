import { ExpirationTime, type PublicArkivClient, type WalletArkivClient } from "@arkiv-network/sdk";
import { eq } from "@arkiv-network/sdk/query";
import { bool, bytes, defineSchema, MAX_STRING_BYTES, str } from "@arkiv-network/sdk/schema";
import { bytesToString, hexToBytes, stringToBytes, type Hex } from "viem";
import { evidenceHashOf, evidenceSchema, type Evidence } from "@cordon/shared";

export const evidenceEntity = defineSchema("cordon.evidence", {
  evidenceHash: str().indexed(),
  detector: str().indexed(),
  name: str().indexed().optional(),
  version: str().indexed(),
  malicious: bool(),
  body: bytes(),
});

export type ArkivReference = { entityKey: Hex; txHash: Hex | null; owner: Hex };
export type ArkivEvidence = { evidence: Evidence; entityKey: Hex; owner: Hex };
export type EvidenceWriter = Pick<WalletArkivClient, "createEntity"> & { account: { address: Hex } };
export type EvidenceReader = Pick<PublicArkivClient, "select">;

const searchDepth = 20;

export async function publishEvidence(writer: EvidenceWriter, evidence: Evidence, text: string): Promise<ArkivReference> {
  const { entityKey, txHash } = await writer.createEntity(
    evidenceEntity,
    {
      evidenceHash: evidenceHashOf(evidence).toLowerCase(),
      detector: evidence.detector,
      name: stringToBytes(evidence.name).length <= MAX_STRING_BYTES ? evidence.name : undefined,
      version: evidence.version,
      malicious: evidence.malicious,
      body: stringToBytes(text),
    },
    { expiration: ExpirationTime.max() },
  );
  return { entityKey, txHash, owner: writer.account.address };
}

function parseBody(body: Hex): Evidence | null {
  let json: unknown;
  try {
    json = JSON.parse(bytesToString(hexToBytes(body)));
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  const parsed = evidenceSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export async function readEvidence(reader: EvidenceReader, evidenceHash: string): Promise<ArkivEvidence | null> {
  const wanted = evidenceHash.toLowerCase();
  const { entities } = await reader
    .select({ $key: true, $owner: true, body: true })
    .from(evidenceEntity)
    .where(eq("evidenceHash", wanted))
    .limit(searchDepth)
    .fetch();
  for (const row of entities) {
    const evidence = parseBody(row.body.value);
    if (evidence && evidenceHashOf(evidence).toLowerCase() === wanted && row.$key && row.$owner) {
      return { evidence, entityKey: row.$key, owner: row.$owner };
    }
  }
  return null;
}
