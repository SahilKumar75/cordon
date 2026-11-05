import { join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import {
  guardReportDigestOf,
  productName,
  sealKeyOf,
  type GuardBlock,
  type GuardOutcome,
  type GuardReport,
  type Hex32,
  type PackageVersion,
} from "@bulkhead/shared";
import { directoryOf, readJson, readLockfile, resolveLockfilePath, type LockEntry } from "./lockfile.ts";
import { isOlderThan, packumentReader, publishedAtOf, type PackumentReader } from "./registry.ts";
import { proposeRollbacks } from "./rollback.ts";
import { loadSealedList, type ListSettings, type SealedList } from "./sealedList.ts";

export const placeholderFallbackMinAgeDays = 3;

export const exitCodes: Record<GuardOutcome, number> = { allowed: 0, blocked: 1, unavailable: 2 };

type ReportSettings = { reportUrl: string | null; reporterPrivateKey: Hex32 | null };

export type GuardSettings = ListSettings &
  ReportSettings & {
    lockfile: string;
    service: string | null;
    fallbackMinAgeDays: number | null;
    minAgeDays: number;
    registryUrl: string | null;
    assumeInstalled: boolean;
  };

export type Spawner = (command: string, args: string[], cwd: string) => Promise<number>;

export const installedAdvice = [
  "First remove persistence: background daemons or services the package installed, and IDE or coding agent hooks, extensions and config it added. Some payloads destroy files when a stolen token is revoked, so do this before revoking anything.",
  "Then rotate every credential that was reachable when that version was installed, including npm tokens, cloud keys, CI secrets and SSH keys.",
  "A runtime stop does not undo theft that happened at install time.",
];

type TooYoung = GuardReport["tooYoung"][number];

function fallbackOf(settings: GuardSettings): NonNullable<GuardReport["fallback"]> {
  if (settings.fallbackMinAgeDays !== null) return { minAgeDays: settings.fallbackMinAgeDays, placeholder: false };
  settings.warn(
    `GUARD_FALLBACK_MIN_AGE_DAYS is unset: the age fallback is using the placeholder of ${placeholderFallbackMinAgeDays} days. The team sets N in docs/decisions.md.`,
  );
  return { minAgeDays: placeholderFallbackMinAgeDays, placeholder: true };
}

function isInstalled(lockfilePath: string, entry: LockEntry): boolean {
  const installed = readJson(join(directoryOf(lockfilePath), entry.path, "package.json")) as Partial<PackageVersion> | null;
  return installed?.name === entry.name && installed.version === entry.version;
}

function blocksOf(entries: LockEntry[], list: SealedList, lockfilePath: string, assumeInstalled: boolean): GuardBlock[] {
  return entries.flatMap((entry) => {
    const key = sealKeyOf(entry.name, entry.version);
    if (!list.keys.has(key)) return [];
    const alreadyInstalled = assumeInstalled || isInstalled(lockfilePath, entry);
    return [{ name: entry.name, version: entry.version, key, lockfilePath, alreadyInstalled }];
  });
}

async function findTooYoung(entries: LockEntry[], days: number, readPackument: PackumentReader, now: Date) {
  const unique = [...new Map(entries.map((entry) => [`${entry.name}@${entry.version}`, entry])).values()];
  const dated = await Promise.all(
    unique.map(async (entry) => ({ entry, publishedAt: publishedAtOf(await readPackument(entry.name), entry.version) })),
  );
  const young = dated.filter(({ publishedAt }) => !isOlderThan(publishedAt, days, now));
  const tooYoung: TooYoung[] = young.map(({ entry, publishedAt }) => ({
    name: entry.name,
    version: entry.version,
    publishedAt: publishedAt?.toISOString() ?? null,
  }));
  const unreadable = young.filter(({ publishedAt }) => publishedAt === null).map(({ entry }) => `${entry.name}@${entry.version}`);
  return { tooYoung, unreadable };
}

function fallbackAdvice(fallback: GuardReport["fallback"]): string[] {
  if (!fallback) return [];
  const placeholder = fallback.placeholder
    ? [`N is the placeholder of ${fallback.minAgeDays} days until the team sets GUARD_FALLBACK_MIN_AGE_DAYS.`]
    : [];
  return [
    `Warning: the Sealed list was not checked because neither the chain nor a valid signed snapshot was available. Versions younger than ${fallback.minAgeDays} days were blocked by the age fallback.`,
    ...placeholder,
  ];
}

export function adviceFor(blocked: GuardBlock[]): string[] {
  return blocked.some((block) => block.alreadyInstalled) ? installedAdvice : [];
}

function baseReport(settings: GuardSettings, lockfile: string, checkedAt: string): GuardReport {
  return {
    product: productName,
    service: settings.service,
    lockfile,
    checkedAt,
    listSource: "none",
    snapshotAgeSeconds: null,
    fallback: null,
    packagesChecked: 0,
    blocked: [],
    tooYoung: [],
    rollback: [],
    advice: [],
    outcome: "unavailable",
  };
}

export async function checkLockfile(settings: GuardSettings): Promise<GuardReport> {
  const now = settings.now();
  const path = resolveLockfilePath(settings.lockfile);
  const read = readLockfile(path);
  const report = baseReport(settings, path, now.toISOString());
  if (!read.ok) return { ...report, advice: [read.reason] };
  const list = await loadSealedList(settings);
  const fallback = list.source === "none" ? fallbackOf(settings) : null;
  const ageLimit = Math.max(fallback?.minAgeDays ?? 0, settings.minAgeDays);
  const readPackument = packumentReader(settings.registryUrl, settings.fetchFn);
  const blocked = blocksOf(read.entries, list, path, settings.assumeInstalled);
  const { tooYoung, unreadable } = ageLimit > 0 ? await findTooYoung(read.entries, ageLimit, readPackument, now) : { tooYoung: [], unreadable: [] };
  const limits = { sealedKeys: list.keys, minAgeDays: ageLimit, now };
  const rollback = await proposeRollbacks([...blocked, ...tooYoung], limits, readPackument);
  const unreadableAdvice = unreadable.length ? [`Publish time could not be read for ${unreadable.join(", ")}, so these count as too young.`] : [];
  return {
    ...report,
    listSource: list.source,
    snapshotAgeSeconds: list.snapshotAgeSeconds,
    fallback,
    packagesChecked: read.entries.length,
    blocked,
    tooYoung,
    rollback,
    advice: [...fallbackAdvice(fallback), ...unreadableAdvice, ...adviceFor(blocked)],
    outcome: blocked.length || tooYoung.length ? "blocked" : "allowed",
  };
}

export async function sendReport(report: GuardReport, settings: GuardSettings): Promise<boolean> {
  if (!settings.reportUrl || !settings.reporterPrivateKey) return false;
  const account = privateKeyToAccount(settings.reporterPrivateKey);
  const signature = await account.signMessage({ message: { raw: guardReportDigestOf(report) } });
  const body = JSON.stringify({ report, signer: account.address, signature });
  const response = await settings
    .fetchFn(settings.reportUrl, { method: "POST", headers: { "content-type": "application/json" }, body })
    .catch((error: Error) => ({ ok: false, status: error.message }));
  if (!response.ok) settings.warn(`report not delivered: ${response.status}`);
  return response.ok;
}

export async function installChecked(settings: GuardSettings, spawn: Spawner): Promise<{ report: GuardReport; exitCode: number }> {
  const report = await checkLockfile({ ...settings, lockfile: directoryOf(settings.lockfile) });
  if (report.outcome !== "allowed") return { report, exitCode: exitCodes[report.outcome] };
  return { report, exitCode: await spawn("npm", ["ci", "--ignore-scripts"], directoryOf(report.lockfile)) };
}
