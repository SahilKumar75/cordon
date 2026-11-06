import type { DatabaseSync } from "node:sqlite";
import { verifyMessage, type Hex } from "viem";
import { guardReportDigestOf, sealKeyOf, type ReportAck, type ServiceStatus, type SignedGuardReport } from "@cordon/shared";
import { appendEvent, inTransaction } from "./timeline.ts";

export class ReportRefused extends Error {}

const maxReportAgeMs = 10 * 60 * 1000;
const maxClockSkewMs = 60 * 1000;

async function refusalOf(signed: SignedGuardReport, reporters: Set<string>, digest: Hex, now: Date): Promise<string | null> {
  if (!reporters.has(signed.signer.toLowerCase())) return "signer is not an allowed guard reporter";
  const age = now.getTime() - Date.parse(signed.report.checkedAt);
  if (age > maxReportAgeMs || age < -maxClockSkewMs) return "report checkedAt is outside the accepted window";
  const valid = await verifyMessage({ address: signed.signer as Hex, message: { raw: digest }, signature: signed.signature as Hex });
  return valid ? null : "signature does not match the report";
}

export async function acceptReport(db: DatabaseSync, signed: SignedGuardReport, reporters: Set<string>, now: Date): Promise<ReportAck> {
  const digest = guardReportDigestOf(signed.report);
  const refusal = await refusalOf(signed, reporters, digest, now);
  if (refusal) throw new ReportRefused(refusal);
  const service = signed.report.service ?? "ci";
  return inTransaction(db, () => {
    const fresh = db.prepare("INSERT OR IGNORE INTO seen_reports (digest, received_at) VALUES (?, ?)").run(digest, now.toISOString());
    if (fresh.changes === 0) throw new ReportRefused("report was already received");
    db.prepare(
      `INSERT INTO service_status (service, healthy, report_json, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (service) DO UPDATE SET healthy = excluded.healthy, report_json = excluded.report_json, updated_at = excluded.updated_at`,
    ).run(service, Number(signed.report.outcome === "allowed"), JSON.stringify(signed.report), now.toISOString());
    const recorded = signed.report.blocked.filter((entry) =>
      appendEvent(db, { key: sealKeyOf(entry.name, entry.version), kind: "guardBlocked", at: signed.report.checkedAt, actor: service, ref: digest }),
    ).length;
    return { recorded };
  });
}

export function serviceStatuses(db: DatabaseSync): ServiceStatus[] {
  const rows = db.prepare("SELECT * FROM service_status ORDER BY service").all() as { service: string; healthy: number; report_json: string; updated_at: string }[];
  return rows.map((row) => ({ service: row.service, healthy: row.healthy === 1, report: JSON.parse(row.report_json), updatedAt: row.updated_at }));
}
