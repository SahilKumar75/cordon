import type { DatabaseSync } from "node:sqlite";
import { scanResponseSchema, type Attestation, type DetectorId, type Hex32, type ScanRequest, type ScanResponse } from "@bulkhead/shared";
import type { FetchLike } from "./registryPoller.ts";
import { cursorOf, inTransaction, setCursor } from "./timeline.ts";

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

async function scanPublish(publish: PendingPublish, detectorsUrl: string, fetchImpl: FetchLike): Promise<ScanResponse> {
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
  });
  if (!response.ok) throw new Error(`scan of ${publish.name}@${publish.version} answered ${response.status}`);
  return scanResponseSchema.parse(await response.json());
}

export async function runScheduler(db: DatabaseSync, detectorsUrl: string, fetchImpl: FetchLike, reportFailure: (message: string) => void): Promise<number> {
  const pending = db.prepare("SELECT * FROM publishes WHERE seq > ? ORDER BY seq").all(Number(cursorOf(db, "scannedSeq") ?? 0)) as PendingPublish[];
  for (const publish of pending) {
    const scan = await scanPublish(publish, detectorsUrl, fetchImpl);
    inTransaction(db, () => {
      storeVerdicts(db, scan);
      setCursor(db, "scannedSeq", String(publish.seq));
    });
    for (const failure of scan.failures) reportFailure(`${failure.detector} on ${scan.name}@${scan.version}: ${failure.error}`);
  }
  return pending.length;
}

type AttestationRow = {
  seal_key: Hex32;
  detector: DetectorId;
  detector_address: Hex32;
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
