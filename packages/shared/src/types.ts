import type { z } from "zod";
import type {
  detectorIds,
  failModes,
  guardOutcomes,
  listSources,
  sealStatusNames,
  timelineKinds,
} from "./constants.ts";
import type {
  apiErrorSchema,
  attestationSchema,
  demoPublishRequestSchema,
  detectorInfoSchema,
  evidenceSchema,
  findingSchema,
  guardBlockSchema,
  guardReportSchema,
  packageVersionSchema,
  registryChangeSchema,
  replayRequestSchema,
  replayTimelineSchema,
  reportAckSchema,
  scanRequestSchema,
  scanResponseSchema,
  sealEntrySchema,
  sealedSnapshotSchema,
  serviceStatusSchema,
  signedGuardReportSchema,
  signedSnapshotSchema,
  stopwatchSchema,
  timelineEventSchema,
  verdictSchema,
} from "./schemas.ts";

export type Hex32 = `0x${string}`;
export type SealStatusName = (typeof sealStatusNames)[number];
export type DetectorId = (typeof detectorIds)[number];
export type TimelineKind = (typeof timelineKinds)[number];
export type FailMode = (typeof failModes)[number];
export type GuardOutcome = (typeof guardOutcomes)[number];
export type ListSource = (typeof listSources)[number];

export type PackageVersion = z.infer<typeof packageVersionSchema>;
export type ScanRequest = z.infer<typeof scanRequestSchema>;
export type ReplayRequest = z.infer<typeof replayRequestSchema>;
export type ReplayTimeline = z.infer<typeof replayTimelineSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type Evidence = z.infer<typeof evidenceSchema>;
export type Verdict = z.infer<typeof verdictSchema>;
export type Attestation = z.infer<typeof attestationSchema>;
export type DetectorInfo = z.infer<typeof detectorInfoSchema>;
export type RegistryChange = z.infer<typeof registryChangeSchema>;
export type DemoPublishRequest = z.infer<typeof demoPublishRequestSchema>;
export type ScanResponse = z.infer<typeof scanResponseSchema>;
export type SealEntry = z.infer<typeof sealEntrySchema>;
export type SealedSnapshot = z.infer<typeof sealedSnapshotSchema>;
export type SignedSnapshot = z.infer<typeof signedSnapshotSchema>;
export type TimelineEvent = z.infer<typeof timelineEventSchema>;
export type Stopwatch = z.infer<typeof stopwatchSchema>;
export type GuardBlock = z.infer<typeof guardBlockSchema>;
export type GuardReport = z.infer<typeof guardReportSchema>;
export type SignedGuardReport = z.infer<typeof signedGuardReportSchema>;
export type ReportAck = z.infer<typeof reportAckSchema>;
export type ServiceStatus = z.infer<typeof serviceStatusSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
