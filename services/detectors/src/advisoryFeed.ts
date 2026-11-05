import { z } from "zod";
import { ecosystem, type Evidence, type PackageVersion, type ReplayTimeline, type ScanRequest } from "@bulkhead/shared";
import type { FetchLike } from "./staticScripts.ts";

export const publicNpmRegistry = "https://registry.npmjs.org";

const osvVulnSchema = z.object({
  id: z.string(),
  summary: z.string().optional(),
  published: z.string(),
  modified: z.string(),
  affected: z
    .array(z.object({ package: z.object({ name: z.string(), ecosystem: z.string() }), versions: z.array(z.string()).optional() }))
    .default([]),
});

const osvQuerySchema = z.object({ vulns: z.array(osvVulnSchema).default([]), next_page_token: z.string().optional() });
const npmTimesSchema = z.object({ time: z.record(z.string()).default({}) });

type OsvVuln = z.infer<typeof osvVulnSchema>;

export function advisoryUrlOf(id: string): string {
  return `https://osv.dev/vulnerability/${id}`;
}

async function getJson(fetchImpl: FetchLike, url: string, body?: unknown): Promise<unknown> {
  const init = body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
  const response = await fetchImpl(url, init);
  if (!response.ok) throw new Error(`request to ${url} failed with status ${response.status}`);
  return response.json();
}

function affectsExactly(vuln: OsvVuln, { name, version }: PackageVersion): boolean {
  return vuln.affected.some((entry) => entry.package.ecosystem === ecosystem && entry.package.name === name && (entry.versions ?? []).includes(version));
}

export async function queryOsv(osvApiUrl: string, target: PackageVersion, fetchImpl: FetchLike): Promise<OsvVuln[]> {
  const vulns: OsvVuln[] = [];
  let pageToken: string | undefined;
  do {
    const body = { package: { name: target.name, ecosystem }, version: target.version, ...(pageToken ? { page_token: pageToken } : {}) };
    const page = osvQuerySchema.parse(await getJson(fetchImpl, `${osvApiUrl}/v1/query`, body));
    vulns.push(...page.vulns);
    pageToken = page.next_page_token;
  } while (pageToken);
  return vulns.filter((vuln) => vuln.id.startsWith("MAL-") && affectsExactly(vuln, target));
}

export async function scanAdvisories(request: ScanRequest, osvApiUrl: string, fetchImpl: FetchLike): Promise<Evidence> {
  const matches = await queryOsv(osvApiUrl, request, fetchImpl);
  return {
    name: request.name,
    version: request.version,
    detector: "advisoryFeed",
    integrity: request.integrity,
    malicious: matches.length > 0,
    simulated: true,
    findings: matches.map((vuln) => ({ rule: "osvMaliciousPackage", detail: `${vuln.id}: ${vuln.summary ?? "malicious package advisory"}`, file: null })),
    advisoryUrl: matches[0] ? advisoryUrlOf(matches[0].id) : null,
    observedAt: new Date().toISOString(),
  };
}

async function publishEvents(fetchImpl: FetchLike, name: string, versions: string[]) {
  const sourceUrl = `${publicNpmRegistry}/${name.replace("/", "%2f")}`;
  const { time } = npmTimesSchema.parse(await getJson(fetchImpl, sourceUrl));
  return versions
    .filter((version) => time[version])
    .map((version) => ({ label: `npm publish ${name}@${version}`, at: new Date(time[version] as string).toISOString(), sourceUrl }));
}

export async function replayAdvisory(advisoryId: string, osvApiUrl: string, fetchImpl: FetchLike): Promise<ReplayTimeline> {
  const sourceUrl = `${osvApiUrl}/v1/vulns/${encodeURIComponent(advisoryId)}`;
  const vuln = osvVulnSchema.parse(await getJson(fetchImpl, sourceUrl));
  const packages = vuln.affected
    .filter((entry) => entry.package.ecosystem === ecosystem)
    .flatMap((entry) => (entry.versions ?? []).map((version) => ({ name: entry.package.name, version })));
  if (packages.length === 0) throw new Error(`advisory ${advisoryId} lists no exact npm versions`);
  const names = [...new Set(packages.map(({ name }) => name))];
  const npmEvents = await Promise.all(
    names.map((name) => publishEvents(fetchImpl, name, packages.filter((item) => item.name === name).map(({ version }) => version))),
  );
  const osvEvents = [
    { label: `OSV advisory ${vuln.id} published`, at: new Date(vuln.published).toISOString(), sourceUrl },
    { label: `OSV advisory ${vuln.id} last modified`, at: new Date(vuln.modified).toISOString(), sourceUrl },
  ];
  const events = [...npmEvents.flat(), ...osvEvents].sort((a, b) => a.at.localeCompare(b.at));
  return { replay: true, advisoryId: vuln.id, advisoryUrl: advisoryUrlOf(vuln.id), packages, events };
}
