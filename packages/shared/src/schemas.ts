import { z } from "zod";
import { evidenceSources, paperStatusNames, reportVersion } from "./constants.ts";

export const hex32Schema = z.string().regex(/^0x[0-9a-f]{64}$/);

export const referenceCheckSchema = z.object({
  raw: z.string(),
  doi: z.string().nullable(),
  resolved: z.boolean(),
  retracted: z.boolean(),
  retractionDate: z.string().nullable(),
  source: z.enum(evidenceSources).nullable(),
  matchConfidence: z.number().min(0).max(1),
});

export const reportSummarySchema = z.object({
  status: z.enum(["Clean", "Flagged"]),
  total: z.number().int().nonnegative(),
  resolvedCount: z.number().int().nonnegative(),
  unresolvedCount: z.number().int().nonnegative(),
  retractedCount: z.number().int().nonnegative(),
});

export const advisorySchema = z.object({
  label: z.literal("advisory"),
  notes: z.array(z.string()),
});

export const reportSchema = z
  .object({
    version: z.literal(reportVersion),
    paperId: z.string().min(1),
    paperHash: hex32Schema,
    checkedAt: z.string().datetime(),
    dbVersion: z.string().min(1),
    references: z.array(referenceCheckSchema),
    summary: reportSummarySchema,
    advisory: advisorySchema.nullable(),
  })
  .refine(
    ({ references, summary }) =>
      summary.total === references.length &&
      summary.retractedCount === references.filter((reference) => reference.retracted).length &&
      summary.status === (summary.retractedCount > 0 ? "Flagged" : "Clean"),
    { message: "summary does not match references" },
  );

export const verifyRequestSchema = z.object({
  paperId: z.string().min(1),
  title: z.string().min(1).optional(),
  references: z.array(z.string().min(1)).min(1),
  simulatedRetractions: z.array(z.string()).default([]),
});

export const verifyResponseSchema = z.object({
  report: reportSchema,
  reportHash: hex32Schema,
});

export const trackedPaperSchema = z.object({
  paperHash: hex32Schema,
  paperId: z.string(),
  title: z.string().nullable(),
  references: z.array(z.string()),
  createdAt: z.string().datetime(),
});

export const publicationSchema = z.object({
  paperHash: hex32Schema,
  status: z.enum(paperStatusNames),
  reportHash: hex32Schema,
  dbVersion: z.string(),
  txHash: hex32Schema.nullable(),
  publishedAt: z.string().datetime(),
});

export const demoRetractRequestSchema = z.object({
  doi: z.string().min(1),
});

export const demoRetractionSchema = z.object({
  doi: z.string(),
  simulated: z.literal(true),
  markedAt: z.string().datetime(),
});

export const apiErrorSchema = z.object({
  error: z.string(),
});
