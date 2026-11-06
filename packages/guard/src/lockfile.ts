import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export type LockEntry = { name: string; version: string; path: string; resolved: string | null };

export type LockfileRead =
  | { ok: true; path: string; entries: LockEntry[] }
  | { ok: false; path: string; reason: string };

export const lockfileNames = ["npm-shrinkwrap.json", "package-lock.json"] as const;

export const hiddenLockfileName = ".package-lock.json";

export const maxLockfileBytes = 64 * 1024 * 1024;

const gitSourcePattern = /^(git\+|git:|github:|https?:\/\/codeload\.github\.com\/)/;

type PackageEntry = { name?: unknown; version?: unknown; link?: unknown; resolved?: unknown };

export function isGitSource(entry: LockEntry): boolean {
  return gitSourcePattern.test(entry.resolved ?? "") || gitSourcePattern.test(entry.version);
}

export function resolveLockfilePath(target: string): string {
  if (!existsSync(target) || !statSync(target).isDirectory()) return target;
  const found = lockfileNames.map((name) => join(target, name)).find((path) => existsSync(path));
  return found ?? join(target, lockfileNames[1]);
}

export function directoryOf(target: string): string {
  return existsSync(target) && statSync(target).isDirectory() ? target : dirname(target);
}

export function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`cannot read ${path}: ${(error as Error).message}`);
  }
}

function entriesOf(packages: Record<string, PackageEntry>): LockEntry[] {
  return Object.entries(packages).flatMap(([path, entry]) => {
    if (!path.includes("node_modules/") || entry.link === true) return [];
    if (typeof entry.version !== "string") return [];
    const name = typeof entry.name === "string" ? entry.name : path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);
    return [{ name, version: entry.version, path, resolved: typeof entry.resolved === "string" ? entry.resolved : null }];
  });
}

export function readLockfile(path: string): LockfileRead {
  if (!existsSync(path)) return { ok: false, path, reason: `no lockfile at ${path}` };
  if (![...lockfileNames, hiddenLockfileName].includes(basename(path))) {
    return { ok: false, path, reason: `${path} is not npm-shrinkwrap.json or package-lock.json, the only formats supported` };
  }
  if (statSync(path).size > maxLockfileBytes) return { ok: false, path, reason: `${path} is larger than ${maxLockfileBytes} bytes` };
  const parsed = readJson(path) as { lockfileVersion?: unknown; packages?: unknown } | null;
  if (parsed === null || typeof parsed !== "object") return { ok: false, path, reason: `${path} is not valid JSON` };
  if (parsed.lockfileVersion !== 2 && parsed.lockfileVersion !== 3) {
    return { ok: false, path, reason: `${path} has lockfileVersion ${String(parsed.lockfileVersion)}, only 2 and 3 are supported` };
  }
  if (parsed.packages === null || typeof parsed.packages !== "object") {
    return { ok: false, path, reason: `${path} has no packages section` };
  }
  return { ok: true, path, entries: entriesOf(parsed.packages as Record<string, PackageEntry>) };
}
