import { z } from "zod";
import {
  detectorIds,
  failModes,
  guardOutcomes,
  listSources,
  productName,
  sealStatusNames,
  timelineKinds,
} from "./constants.ts";

export const hex32Schema = z.string().regex(/^0x[0-9a-f]{64}$/);
export const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const signatureSchema = z.string().regex(/^0x[0-9a-fA-F]+$/);

export const packageVersionSchema = z.object({
  name: z.string().min(1).max(214),
  version: z.string().min(1),
});

export const scanRequestSchema = packageVersionSchema.extend({
  tarballUrl: z.string().url(),
  integrity: z.string().min(1),
  publishedAt: z.string().datetime(),
});

export const replayRequestSchema = z.object({
  advisoryId: z.string().min(1),
});

export const findingSchema = z.object({
  rule: z.string().min(1),
  detail: z.string(),
  file: z.string().nullable(),
});

export const evidenceSchema = packageVersionSchema.extend({
  detector: z.enum(detectorIds),
  integrity: z.string().min(1),
  malicious: z.boolean(),
  simulated: z.boolean(),
  findings: z.array(findingSchema),
  advisoryUrl: z.string().url().nullable(),
  observedAt: z.string().datetime(),
});

export const verdictSchema = z.object({
  key: hex32Schema,
  detector: z.enum(detectorIds),
  detectorAddress: addressSchema,
  evidenceHash: hex32Schema,
  malicious: z.boolean(),
  simulated: z.boolean(),
  txHash: hex32Schema.nullable(),
  submittedAt: z.string().datetime(),
});

export const attestationSchema = verdictSchema.merge(packageVersionSchema);

export const detectorInfoSchema = z.object({
  id: z.enum(detectorIds),
  address: addressSchema,
  simulated: z.boolean(),
});

export const registryChangeSchema = packageVersionSchema.extend({
  seq: z.number().int().nonnegative(),
  publishedAt: z.string().datetime(),
  tarballUrl: z.string().url(),
  integrity: z.string().min(1),
});

export const demoPublishRequestSchema = packageVersionSchema;

export const scanResponseSchema = packageVersionSchema.extend({
  key: hex32Schema,
  verdicts: z.array(verdictSchema),
});

export const sealEntrySchema = packageVersionSchema.extend({
  key: hex32Schema,
  status: z.enum(sealStatusNames),
  sealedAt: z.string().datetime().nullable(),
});

export const sealedSnapshotSchema = z.object({
  product: z.literal(productName),
  chainId: z.number().int().positive(),
  registry: addressSchema,
  blockNumber: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
  entries: z.array(sealEntrySchema),
  timelineHeads: z.array(z.object({ key: hex32Schema, hash: hex32Schema })),
});

export const signedSnapshotSchema = z.object({
  snapshot: sealedSnapshotSchema,
  signer: addressSchema,
  signature: signatureSchema,
});

export const timelineEventSchema = z.object({
  key: hex32Schema,
  kind: z.enum(timelineKinds),
  at: z.string().datetime(),
  actor: z.string().min(1),
  ref: z.string().nullable(),
  prevHash: hex32Schema,
  hash: hex32Schema,
});

export const stopwatchSchema = packageVersionSchema.extend({
  key: hex32Schema,
  simulated: z.boolean(),
  publishedAt: z.string().datetime(),
  firstVerdictAt: z.string().datetime().nullable(),
  sealedAt: z.string().datetime().nullable(),
  firstBlockAt: z.string().datetime().nullable(),
});

export const guardBlockSchema = packageVersionSchema.extend({
  key: hex32Schema,
  lockfilePath: z.string(),
  alreadyInstalled: z.boolean(),
});

export const guardReportSchema = z.object({
  product: z.literal(productName),
  service: z.string().nullable(),
  lockfile: z.string(),
  checkedAt: z.string().datetime(),
  listSource: z.enum(listSources),
  failMode: z.enum(failModes),
  packagesChecked: z.number().int().nonnegative(),
  blocked: z.array(guardBlockSchema),
  tooYoung: z.array(packageVersionSchema.extend({ publishedAt: z.string().datetime() })),
  rollback: z.array(z.object({ name: z.string(), from: z.string(), to: z.string().nullable() })),
  advice: z.array(z.string()),
  outcome: z.enum(guardOutcomes),
});

export const signedGuardReportSchema = z.object({
  report: guardReportSchema,
  signer: addressSchema,
  signature: signatureSchema,
});

export const reportAckSchema = z.object({
  recorded: z.number().int().nonnegative(),
});

export const serviceStatusSchema = z.object({
  service: z.string().min(1),
  healthy: z.boolean(),
  report: guardReportSchema,
  updatedAt: z.string().datetime(),
});

export const apiErrorSchema = z.object({
  error: z.string(),
});
