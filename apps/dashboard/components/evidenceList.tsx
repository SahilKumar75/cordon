"use client";

import { detectorIds, evidenceHashOf, evidenceSchema, type Attestation, type Hex32 } from "@cordon/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { usePolled } from "@/lib/api";
import { detectorNames, formatDateTime, shortHash } from "@/lib/format";
import { ChainLink, Notice, QueryState, SimulatedTag, Status } from "./ui";

export function EvidenceList({ sealKey, attestations }: { sealKey: Hex32; attestations: UseQueryResult<Attestation[]> }) {
  return (
    <QueryState query={attestations} loading="Loading verdicts from the watcher.">
      {(items) => (
        <div className="grid gap-4">
          {detectorIds.map((detector) => {
            const verdict = items.find((item) => item.key === sealKey && item.detector === detector);
            return verdict ? (
              <EvidenceCard key={detector} verdict={verdict} />
            ) : (
              <div key={detector} className="flex flex-wrap items-center justify-between gap-2 border border-line p-4">
                <span className="font-medium">{detectorNames[detector]}</span>
                <Status icon="pending" tone="muted">No verdict from this detector</Status>
              </div>
            );
          })}
        </div>
      )}
    </QueryState>
  );
}

function EvidenceCard({ verdict }: { verdict: Attestation }) {
  const evidence = usePolled("detectors", `/evidence/${verdict.evidenceHash}`, evidenceSchema, false);
  return (
    <article className="border border-line bg-panel">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-medium">{detectorNames[verdict.detector]}</span>
          {(verdict.simulated || evidence.data?.simulated) && <SimulatedTag />}
          <Status icon={verdict.malicious ? "blocked" : "check"} tone={verdict.malicious ? "accent" : "ink"}>
            {verdict.malicious ? "Malicious" : "Not malicious"}
          </Status>
        </div>
        {verdict.txHash ? (
          <ChainLink kind="tx" value={verdict.txHash} label={`Verdict tx ${shortHash(verdict.txHash)}`} />
        ) : verdict.malicious ? (
          <Status icon="pending" tone="muted">Verdict not on chain yet</Status>
        ) : (
          <Status icon="info" tone="muted">Not malicious, kept off chain</Status>
        )}
      </header>
      <div className="space-y-4 p-4">
        <QueryState query={evidence} loading="Loading evidence from the detectors service.">
          {(body) => (
            <>
              {evidenceHashOf(body) === verdict.evidenceHash ? (
                <Status icon="check">Evidence matches hash {shortHash(verdict.evidenceHash)}</Status>
              ) : (
                <Status icon="warning" tone="accent">Evidence does not match the hash in the verdict</Status>
              )}
              {body.findings.length === 0 ? (
                <Notice icon="info" tone="muted">No findings recorded.</Notice>
              ) : (
                <ul className="divide-y divide-line border border-line">
                  {body.findings.map((finding, index) => (
                    <li key={index} className="space-y-1 p-3 text-sm">
                      <div className="font-mono">{finding.rule}</div>
                      <div>{finding.detail}</div>
                      {finding.file && <div className="font-mono text-muted">{finding.file}</div>}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
                <span>Observed {formatDateTime(body.observedAt)}</span>
                <span className="inline-flex items-center gap-2">
                  Detector key <ChainLink kind="address" value={verdict.detectorAddress} />
                </span>
                {body.advisoryUrl && (
                  <a href={body.advisoryUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-accent">
                    Advisory source
                  </a>
                )}
              </div>
            </>
          )}
        </QueryState>
      </div>
    </article>
  );
}
