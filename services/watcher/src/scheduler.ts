import type { DatabaseSync } from "node:sqlite";
import type { Address } from "viem";
import { scanResponseSchema, type Attestation, type DetectorId, type Hex32, type ScanRequest, type ScanResponse } from "@cordon/shared";
import { snapshotEntries } from "./publisher.ts";
import type { FetchLike } from "./registryPoller.ts";
import { cursorOf, inTransaction, setCursor, timelineOf } from "./timeline.ts";

export const scanTimeoutMs = 120_000;

type PendingPublish = { seq: number; name: string; version: string; published_at: string; tarball_url: string; integrity: string };

function storeVerdicts(db: DatabaseSync, scan: ScanResponse): void {
  const upsert = db.prepare(
    `INSERT INTO verdicts (seal_key, detector, detector_address, evidence_hash, malicious, simulated, tx_hash, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (seal_key, detector) DO UPDATE SET tx_hash = COALESCE(excluded.tx_hash, verdicts.tx_hash)`,
  );
  for (const verdict of scan.verdicts) {
    upsert.run(scan.key, verdict.detector, verdict.detectorAddress.toLowerCase(), verdict.evidenceHash, Number(verdict.malicious), Number(verdict.simulated), verdict.txHash, verdict.submittedAt);
  }
}

async function scanPublish(publish: PendingPublish, detectorsUrl: string, fetchImpl: FetchLike, timeoutMs: number): Promise<ScanResponse> {
  const request: ScanRequest = {
    name: publish.name,
    version: publish.version,
    tarballUrl: publish.tarball_url,
    integrity: publish.integrity,
    publishedAt: publish.published_at,
  };
  const response = await fetchImpl(`${detectorsUrl}/scan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`scan of ${publish.name}@${publish.version} answered ${response.status}`);
  return scanResponseSchema.parse(await response.json());
}

export async function runScheduler(
  db: DatabaseSync,
  detectorsUrl: string,
  fetchImpl: FetchLike,
  reportFailure: (message: string) => void,
  timeoutMs = scanTimeoutMs,
): Promise<number> {
  const pending = db.prepare("SELECT * FROM publishes WHERE seq > ? ORDER BY seq").all(Number(cursorOf(db, "scannedSeq") ?? 0)) as PendingPublish[];
  for (const publish of pending) {
    const scan = await scanPublish(publish, detectorsUrl, fetchImpl, timeoutMs);
    inTransaction(db, () => {
      storeVerdicts(db, scan);
      setCursor(db, "scannedSeq", String(publish.seq));
    });
    for (const failure of scan.failures) reportFailure(`${failure.detector} on ${scan.name}@${scan.version}: ${failure.error}`);
  }
  return pending.length;
}

export type RescanSettings = { voteLifetimeSeconds: number; now: Date };

function lastScanAt(db: DatabaseSync, key: Hex32): number {
  const rescan = db.prepare("SELECT scanned_at FROM rescans WHERE seal_key = ?").get(key) as { scanned_at: string } | undefined;
  const verdictTimes = timelineOf(db, key).filter((event) => event.kind === "verdict").map((event) => Date.parse(event.at));
  return Math.max(rescan ? Date.parse(rescan.scanned_at) : 0, ...verdictTimes);
}

export async function rescanSuspects(
  db: DatabaseSync,
  detectorsUrl: string,
  fetchImpl: FetchLike,
  settings: RescanSettings,
  reportFailure: (message: string) => void,
  timeoutMs = scanTimeoutMs,
): Promise<number> {
  const intervalMs = (settings.voteLifetimeSeconds * 1000) / 4;
  const due = snapshotEntries(db, settings.now, settings.voteLifetimeSeconds).filter(
    (entry) => entry.status === "Suspect" && settings.now.getTime() - lastScanAt(db, entry.key as Hex32) >= intervalMs,
  );
  for (const entry of due) {
    const publish = db.prepare("SELECT * FROM publishes WHERE seal_key = ? ORDER BY seq DESC LIMIT 1").get(entry.key) as PendingPublish;
    const scan = await scanPublish(publish, detectorsUrl, fetchImpl, timeoutMs);
    inTransaction(db, () => {
      storeVerdicts(db, scan);
      db.prepare("INSERT INTO rescans (seal_key, scanned_at) VALUES (?, ?) ON CONFLICT (seal_key) DO UPDATE SET scanned_at = excluded.scanned_at").run(entry.key, settings.now.toISOString());
    });
    for (const failure of scan.failures) reportFailure(`${failure.detector} on rescan of ${scan.name}@${scan.version}: ${failure.error}`);
  }
  return due.length;
}

type AttestationRow = {
  seal_key: Hex32;
  detector: DetectorId;
  detector_address: Address;
  evidence_hash: Hex32;
  malicious: number;
  simulated: number;
  tx_hash: Hex32 | null;
  submitted_at: string;
  name: string;
  version: string;
};

export function attestations(db: DatabaseSync, demoRegistry: boolean): Attestation[] {
  const rows = db
    .prepare(
      `SELECT verdicts.*, publishes.name, publishes.version FROM verdicts
       JOIN (SELECT DISTINCT seal_key, name, version FROM publishes) AS publishes USING (seal_key)
       ORDER BY submitted_at DESC`,
    )
    .all() as AttestationRow[];
  return rows.map((row) => ({
    key: row.seal_key,
    name: row.name,
    version: row.version,
    detector: row.detector,
    detectorAddress: row.detector_address,
    evidenceHash: row.evidence_hash,
    malicious: row.malicious === 1,
    simulated: demoRegistry || row.simulated === 1,
    txHash: row.tx_hash,
    submittedAt: row.submitted_at,
  }));
}
