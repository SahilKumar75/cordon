import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Parser, list as listTar, type ReadEntry } from "tar";
import { productName, sealKeyOf, type GuardBlock, type GuardReport } from "@bulkhead/shared";
import { adviceFor, type GuardSettings } from "./check.ts";
import { lockfileNames, readLockfile } from "./lockfile.ts";
import { packumentReader } from "./registry.ts";
import { proposeRollbacks } from "./rollback.ts";
import { loadSealedList } from "./sealedList.ts";

export type AuditSettings = GuardSettings & { paths: string[]; cacheDirs: string[]; dockerImages: string[] };

type Found = { name: string; version: string; source: string };

type Scan = { found: Found[]; problems: string[] };

const skippedDirs = new Set(["node_modules", ".git", ".pnpm_store"]);
const tarballPattern = /\/((?:@[^/]+(?:\/|%2[fF]))?([^/]+))\/-\/([^/]+)\.tgz$/;
const installedManifestPattern = /(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/@.][^/]*\/package\.json$/;

function lockfilesUnder(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const here = entries.filter((entry) => entry.isFile() && (lockfileNames as readonly string[]).includes(entry.name));
  const hidden = existsSync(join(dir, "node_modules", ".package-lock.json")) ? [join(dir, "node_modules", ".package-lock.json")] : [];
  const nested = entries.filter((entry) => entry.isDirectory() && !skippedDirs.has(entry.name));
  return [...here.map((entry) => join(dir, entry.name)), ...hidden, ...nested.flatMap((entry) => lockfilesUnder(join(dir, entry.name)))];
}

function scanPath(dir: string): Scan {
  if (!existsSync(dir)) return { found: [], problems: [`no directory at ${dir}`] };
  const reads = lockfilesUnder(dir).map(readLockfile);
  return {
    found: reads.flatMap((read) => (read.ok ? read.entries.map(({ name, version }) => ({ name, version, source: read.path })) : [])),
    problems: reads.flatMap((read) => (read.ok ? [] : [read.reason])),
  };
}

export function packageFromTarballUrl(url: string): { name: string; version: string } | null {
  const match = tarballPattern.exec(url);
  if (!match?.[1] || !match[2] || !match[3]?.startsWith(`${match[2]}-`)) return null;
  return { name: decodeURIComponent(match[1]), version: match[3].slice(match[2].length + 1) };
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)],
  );
}

function cacheKeysOf(file: string): string[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .flatMap((line) => {
      const json = line.slice(line.indexOf("\t") + 1);
      try {
        const key = (JSON.parse(json) as { key?: unknown }).key;
        return typeof key === "string" ? [key] : [];
      } catch {
        return [];
      }
    });
}

function scanCache(dir: string): Scan {
  const index = [join(dir, "_cacache", "index-v5"), join(dir, "index-v5")].find((path) => existsSync(path));
  if (!index) return { found: [], problems: [`no npm cache index under ${dir}`] };
  const found = filesUnder(index).flatMap((file) =>
    cacheKeysOf(file).flatMap((key) => {
      const pkg = packageFromTarballUrl(key);
      return pkg ? [{ ...pkg, source: file }] : [];
    }),
  );
  return { found, problems: [] };
}

function readBody(entry: ReadEntry): Promise<string> {
  const chunks: Buffer[] = [];
  entry.on("data", (chunk: Buffer) => chunks.push(chunk));
  return new Promise((resolve) => entry.on("end", () => resolve(Buffer.concat(chunks).toString("utf8"))));
}

function scanLayer(layer: ReadEntry, source: string, found: Found[]): Promise<void> {
  const reads: Promise<void>[] = [];
  const parser = new Parser({
    onReadEntry: (entry) => {
      if (!installedManifestPattern.test(entry.path)) return entry.resume();
      reads.push(
        readBody(entry).then((text) => {
          const manifest = JSON.parse(text) as { name?: unknown; version?: unknown };
          if (typeof manifest.name === "string" && typeof manifest.version === "string") {
            found.push({ name: manifest.name, version: manifest.version, source: `${source}:${layer.path}:${entry.path}` });
          }
        }, () => undefined),
      );
    },
  });
  const done = new Promise<void>((resolve) => {
    parser.on("end", resolve);
    parser.on("error", () => resolve());
  });
  layer.pipe(parser);
  return done.then(() => Promise.all(reads)).then(() => undefined);
}

async function scanImage(file: string): Promise<Scan> {
  if (!existsSync(file)) return { found: [], problems: [`no saved image at ${file}`] };
  const found: Found[] = [];
  const layers: Promise<void>[] = [];
  await listTar({
    file,
    onReadEntry: (entry) => {
      const isLayer = entry.type === "File" && (entry.path.endsWith("layer.tar") || entry.path.startsWith("blobs/"));
      if (isLayer) layers.push(scanLayer(entry, file, found));
      else entry.resume();
    },
  });
  await Promise.all(layers);
  return { found, problems: [] };
}

function auditBlocks(found: Found[], keys: Set<string>): GuardBlock[] {
  const blocks = found.flatMap(({ name, version, source }) => {
    const key = sealKeyOf(name, version);
    return keys.has(key) ? [{ name, version, key, lockfilePath: source, alreadyInstalled: true }] : [];
  });
  return [...new Map(blocks.map((block) => [`${block.key}${block.lockfilePath}`, block])).values()];
}

function outcomeOf(blocked: GuardBlock[], problems: string[], listMissing: boolean): GuardReport["outcome"] {
  if (blocked.length) return "blocked";
  return problems.length || listMissing ? "unavailable" : "allowed";
}

export async function audit(settings: AuditSettings): Promise<GuardReport> {
  const scans = [
    ...settings.paths.map(scanPath),
    ...settings.cacheDirs.map(scanCache),
    ...(await Promise.all(settings.dockerImages.map(scanImage))),
  ];
  const found = scans.flatMap((scan) => scan.found);
  const list = await loadSealedList(settings);
  const listMissing = list.source === "none";
  const problems = [...scans.flatMap((scan) => scan.problems), ...(listMissing ? ["The Sealed list was unavailable, so installed versions could not be checked."] : [])];
  const blocked = auditBlocks(found, list.keys);
  const limits = { sealedKeys: list.keys, minAgeDays: settings.minAgeDays, now: settings.now() };
  const rollback = await proposeRollbacks(blocked, limits, packumentReader(settings.registryUrl, settings.fetchFn));
  return {
    product: productName,
    service: settings.service,
    lockfile: [...settings.paths, ...settings.cacheDirs, ...settings.dockerImages].join(", "),
    checkedAt: settings.now().toISOString(),
    listSource: list.source,
    fallback: null,
    packagesChecked: found.length,
    blocked,
    tooYoung: [],
    rollback,
    advice: [...problems, ...adviceFor(blocked)],
    outcome: outcomeOf(blocked, problems, listMissing),
  };
}
