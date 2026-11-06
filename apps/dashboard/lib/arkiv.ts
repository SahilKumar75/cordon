import { createPublicClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { eq } from "@arkiv-network/sdk/query";
import { bytes, defineSchema, str } from "@arkiv-network/sdk/schema";
import { hexToString, http } from "viem";
import { evidenceHashOf, evidenceSchema, type Evidence } from "@cordon/shared";

const evidenceEntity = defineSchema("cordon.evidence", { evidenceHash: str().indexed(), body: bytes() });

const client = createPublicClient({ chain: rabdi({ accessKey: process.env.NEXT_PUBLIC_ARKIV_ACCESS_KEY ?? "" }), transport: http() });

export type ArkivEvidence = { evidence: Evidence; entityKey: string };

function parseBody(body: `0x${string}`): Evidence | null {
  let json: unknown;
  try {
    json = JSON.parse(hexToString(body));
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  const parsed = evidenceSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export async function readArkivEvidence(evidenceHash: string): Promise<ArkivEvidence | null> {
  const wanted = evidenceHash.toLowerCase();
  const { entities } = await client
    .select({ $key: true, body: true })
    .from(evidenceEntity)
    .where(eq("evidenceHash", wanted))
    .limit(20)
    .fetch();
  for (const row of entities) {
    const evidence = parseBody(row.body.value);
    if (evidence && row.$key && evidenceHashOf(evidence).toLowerCase() === wanted) return { evidence, entityKey: row.$key };
  }
  return null;
}
