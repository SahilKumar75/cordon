import { sealKeyOf, type GuardReport, type Hex32, type PackageVersion } from "@cordon/shared";
import { compareCores, isOlderThan, isRelease, publishedAtOf, type PackumentReader } from "./registry.ts";

export type RollbackLimits = { sealedKeys: Set<Hex32>; minAgeDays: number; now: Date };

export type Rollback = GuardReport["rollback"][number];

async function proposeOne(target: PackageVersion, limits: RollbackLimits, readPackument: PackumentReader): Promise<Rollback> {
  const packument = await readPackument(target.name);
  const versions = Object.keys(packument?.versions ?? packument?.time ?? {});
  const isSafe = (version: string) =>
    !limits.sealedKeys.has(sealKeyOf(target.name, version)) &&
    (limits.minAgeDays === 0 || isOlderThan(publishedAtOf(packument, version), limits.minAgeDays, limits.now));
  const candidates = versions.filter((version) => isRelease(version) && compareCores(version, target.version) < 0 && isSafe(version));
  return { name: target.name, from: target.version, to: candidates.sort(compareCores).at(-1) ?? null };
}

export function proposeRollbacks(targets: PackageVersion[], limits: RollbackLimits, readPackument: PackumentReader): Promise<Rollback[]> {
  const unique = [...new Map(targets.map((target) => [`${target.name}@${target.version}`, target])).values()];
  return Promise.all(unique.map((target) => proposeOne(target, limits, readPackument)));
}

export function overridesOf(rollback: Rollback[]): { overrides: Record<string, string> } {
  const proposals = rollback.flatMap(({ name, to }) => (to === null ? [] : [[name, to] as const]));
  return { overrides: Object.fromEntries(proposals) };
}
