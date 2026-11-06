import type { GuardReport } from "@cordon/shared";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export type LockEntry = { name: string; version: string; path: string; resolved: string | null };

export type LockfileRead =
  | { ok: true; path: string; entries: LockEntry[] }
  | { ok: false; path: string; reason: string };

export const lockfileNames = ["npm-shrinkwrap.json", "package-lock.json"] as const;

export const hiddenLockfileName = ".package-lock.json";

export const maxLockfileBytes = 64 * 1024 * 1024;

export const defaultRegistryUrl = "https://registry.npmjs.org";

export type NonRegistrySource = GuardReport["nonRegistrySources"][number];

type SourceKind = NonRegistrySource["kind"];

const gitPattern = /^git(\+[a-z]+)?:/;
const githubPattern = /^(github:|https?:\/\/codeload\.github\.com\/)|^[\w.]+\/[\w.]+(#.*)?$/;
const semverPattern = /^\d+\.\d+\.\d+([+-][\w.]+)*$/;

type PackageEntry = { name?: unknown; version?: unknown; link?: unknown; resolved?: unknown };

function originOf(url: string): string | null {
  return URL.canParse(url) ? new URL(url).origin : null;
}

export function sourceKindOf(entry: LockEntry, registryUrl: string): SourceKind | null {
  const source = entry.resolved ?? entry.version;
  if (gitPattern.test(source) || githubPattern.test(source)) {
    if (source.includes("#")) return "commit";
    return gitPattern.test(source) ? "git" : "github";
  }
  if (source.startsWith("file:")) return "file";
  if (/^https?:\/\//.test(source)) return originOf(source) === originOf(registryUrl) ? null : "tarball";
  return semverPattern.test(source) ? null : "other";
}

export function nonRegistrySourcesOf(entries: LockEntry[], lockfilePath: string, registryUrl: string): NonRegistrySource[] {
  return entries.flatMap((entry) => {
    const kind = sourceKindOf(entry, registryUrl);
    return kind ? [{ name: entry.name, version: entry.version, resolved: entry.resolved ?? entry.version, kind, lockfilePath }] : [];
  });
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

export function readLockfile(path: string, acceptedNames: readonly string[] = lockfileNames): LockfileRead {
  if (!existsSync(path)) return { ok: false, path, reason: `no lockfile at ${path}` };
  if (!acceptedNames.includes(basename(path))) {
    return { ok: false, path, reason: `${path} is not ${acceptedNames.join(" or ")}, the only formats supported here` };
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
