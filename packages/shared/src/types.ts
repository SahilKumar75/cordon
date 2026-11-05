import type { z } from "zod";
import type { evidenceSources, paperStatusNames } from "./constants.ts";
import type {
  advisorySchema,
  apiErrorSchema,
  demoRetractionSchema,
  demoRetractRequestSchema,
  publicationSchema,
  referenceCheckSchema,
  reportSchema,
  reportSummarySchema,
  trackedPaperSchema,
  verifyRequestSchema,
  verifyResponseSchema,
} from "./schemas.ts";

export type Hex32 = `0x${string}`;
export type PaperStatusName = (typeof paperStatusNames)[number];
export type EvidenceSource = (typeof evidenceSources)[number];

export type ReferenceCheck = z.infer<typeof referenceCheckSchema>;
export type ReportSummary = z.infer<typeof reportSummarySchema>;
export type Advisory = z.infer<typeof advisorySchema>;
export type Report = z.infer<typeof reportSchema>;
export type VerifyRequest = z.input<typeof verifyRequestSchema>;
export type VerifyResponse = z.infer<typeof verifyResponseSchema>;
export type TrackedPaper = z.infer<typeof trackedPaperSchema>;
export type Publication = z.infer<typeof publicationSchema>;
export type DemoRetractRequest = z.infer<typeof demoRetractRequestSchema>;
export type DemoRetraction = z.infer<typeof demoRetractionSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
