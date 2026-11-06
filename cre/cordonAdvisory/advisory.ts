import { encodeAbiParameters, keccak256, toHex, type Hex } from "viem";

export type Target = { name: string; version: string };

type OsvVuln = { id?: string; modified?: string };

export type AdvisoryVerdict = Target & { malicious: boolean; malIds: string[]; osvModified: string | null };

export function osvQueryBody(target: Target): string {
  return JSON.stringify({ package: { ecosystem: "npm", name: target.name }, version: target.version });
}

export function verdictOf(target: Target, osvResponseText: string): AdvisoryVerdict {
  const vulns = ((JSON.parse(osvResponseText) as { vulns?: OsvVuln[] }).vulns ?? []).filter((vuln) => vuln.id?.startsWith("MAL"));
  const malIds = vulns.map((vuln) => vuln.id as string).sort();
  const osvModified = vulns.map((vuln) => vuln.modified ?? "").sort().at(-1) || null;
  return { ...target, malicious: malIds.length > 0, malIds, osvModified };
}

export function evidenceHashOf(verdict: AdvisoryVerdict): Hex {
  const evidence = { name: verdict.name, version: verdict.version, detector: "advisoryFeed", malIds: verdict.malIds, osvModified: verdict.osvModified };
  return keccak256(toHex(JSON.stringify(evidence)));
}

export function reportPayloadOf(verdict: AdvisoryVerdict): Hex {
  return encodeAbiParameters(
    [{ type: "string" }, { type: "string" }, { type: "bytes32" }],
    [verdict.name, verdict.version, evidenceHashOf(verdict)],
  );
}
