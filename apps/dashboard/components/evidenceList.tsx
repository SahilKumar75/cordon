"use client";

import { detectorIds, evidenceHashOf, evidenceSchema, type Attestation, type Hex32 } from "@cordon/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { usePolled } from "@/lib/api";
import { detectorNames, formatDateTime, shortHash } from "@/lib/format";
import { GlyphBadge } from "./glyphs";
import { Reveal } from "./reveal";
import { ChainLink, Notice, QueryState, SimulatedTag, Status } from "./ui";

export function EvidenceList({ sealKey, attestations }: { sealKey: Hex32; attestations: UseQueryResult<Attestation[]> }) {
  return (
    <QueryState query={attestations} loading="Loading verdicts from the watcher.">
      {(items) => (
        <div className="space-y-4">
          {detectorIds.map((detector, index) => {
            const verdict = items.find((item) => item.key === sealKey && item.detector === detector);
            return (
              <Reveal key={detector} index={index}>
                {verdict ? (
                  <EvidenceCard verdict={verdict} />
                ) : (
                  <div className="panel flex flex-wrap items-center justify-between gap-2 px-5 py-4">
                    <span className="flex items-center gap-3">
                      <GlyphBadge name={detector} />
                      {detectorNames[detector]}
                    </span>
                    <Status icon="pending" tone="muted">No verdict from this detector</Status>
                  </div>
                )}
              </Reveal>
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
    <article className="panel lift overflow-hidden px-5">
      <header className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <GlyphBadge name={verdict.detector} alarm={verdict.malicious} active />
          <span className="font-medium">{detectorNames[verdict.detector]}</span>
          {(verdict.simulated || evidence.data?.simulated) && <SimulatedTag />}
          <Status icon={verdict.malicious ? "blocked" : "check"} tone={verdict.malicious ? "accent" : "clean"}>
            {verdict.malicious ? "Malicious" : "Clean"}
          </Status>
        </div>
        {verdict.txHash ? (
          <ChainLink kind="tx" value={verdict.txHash} label={`Verdict tx ${shortHash(verdict.txHash)}`} />
        ) : verdict.malicious ? (
          <Status icon="pending" tone="muted">Verdict not on chain yet</Status>
        ) : (
          <Status icon="info" tone="muted">Clean, kept off chain</Status>
        )}
      </header>
      <div className="hairline" />
      <div className="space-y-4 pb-5 pt-4">
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
                <ul className="divide-y divide-plum border-t border-plum">
                  {body.findings.map((finding, index) => (
                    <li key={index} className="space-y-1 py-2 text-sm">
                      <div className="font-mono">{finding.rule}</div>
                      <div>{finding.detail}</div>
                      {finding.file && <div className="font-mono text-jade">{finding.file}</div>}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-jade">
                <span>Observed {formatDateTime(body.observedAt)}</span>
                <span className="inline-flex items-center gap-2">
                  Detector key <ChainLink kind="address" value={verdict.detectorAddress} />
                </span>
                {body.advisoryUrl && (
                  <a href={body.advisoryUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-bone">
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
