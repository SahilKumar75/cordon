import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Parser, list as listTar, type ReadEntry } from "tar";
import { productName, sealKeyOf, type GuardReport } from "@bulkhead/shared";
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
      const tab = line.indexOf("\t");
      if (tab === -1) return [];
      try {
        const key = (JSON.parse(line.slice(tab + 1)) as { key?: unknown }).key;
        return typeof key === "string" ? [key] : [];
      } catch (error) {
        if (error instanceof SyntaxError) return [];
        throw error;
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

function scanLayer(layer: ReadEntry, source: string, scan: Scan): Promise<void> {
  const reads: Promise<void>[] = [];
  const parser = new Parser({
    strict: true,
    onReadEntry: (entry) => {
      if (!installedManifestPattern.test(entry.path)) return entry.resume();
      const where = `${source}:${layer.path}:${entry.path}`;
      reads.push(
        readBody(entry).then((text) => {
          try {
            const manifest = JSON.parse(text) as { name?: unknown; version?: unknown };
            if (typeof manifest.name === "string" && typeof manifest.version === "string") {
              scan.found.push({ name: manifest.name, version: manifest.version, source: where });
            }
          } catch (error) {
            if (!(error instanceof SyntaxError)) throw error;
            scan.problems.push(`unreadable package.json at ${where}`);
          }
        }),
      );
    },
  });
  const done = new Promise<void>((resolve) => {
    parser.on("end", resolve);
    parser.on("error", (error: Error) => {
      scan.problems.push(`unreadable layer ${source}:${layer.path}: ${error.message}`);
      resolve();
    });
  });
  layer.pipe(parser);
  return done.then(() => Promise.all(reads)).then(() => undefined);
}

async function layersOf(file: string): Promise<Set<string> | null> {
  let manifestText: Promise<string> | null = null;
  await listTar({
    file,
    filter: (path) => path === "manifest.json",
    onReadEntry: (entry) => {
      manifestText = readBody(entry);
    },
  });
  if (!manifestText) return null;
  try {
    const manifest = JSON.parse(await manifestText) as { Layers?: unknown }[];
    return new Set(manifest.flatMap((image) => (Array.isArray(image.Layers) ? image.Layers.map(String) : [])));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) return null;
    throw error;
  }
}

async function scanImage(file: string): Promise<Scan> {
  if (!existsSync(file)) return { found: [], problems: [`no saved image at ${file}`] };
  const layers = await layersOf(file);
  if (!layers) return { found: [], problems: [`no readable manifest.json in ${file}`] };
  const scan: Scan = { found: [], problems: [] };
  const scans: Promise<void>[] = [];
  await listTar({
    file,
    onReadEntry: (entry) => {
      if (layers.has(entry.path)) scans.push(scanLayer(entry, file, scan));
      else entry.resume();
    },
  });
  await Promise.all(scans);
  return scan;
}

export async function audit(settings: AuditSettings): Promise<GuardReport> {
  const scans = [
    ...settings.paths.map(scanPath),
    ...settings.cacheDirs.map(scanCache),
    ...(await Promise.all(settings.dockerImages.map(scanImage))),
  ];
  const found = scans.flatMap((scan) => scan.found);
  const list = await loadSealedList(settings);
  const problems = [...scans.flatMap((scan) => scan.problems), ...(list.source === "none" ? ["The Sealed list was unavailable, so installed versions could not be checked."] : [])];
  const hits = found.flatMap(({ name, version, source }) => {
    const key = sealKeyOf(name, version);
    return list.keys.has(key) ? [{ name, version, key, lockfilePath: source, alreadyInstalled: true }] : [];
  });
  const blocked = [...new Map(hits.map((block) => [`${block.key}${block.lockfilePath}`, block])).values()];
  const limits = { sealedKeys: list.keys, minAgeDays: settings.minAgeDays, now: settings.now() };
  const rollback = await proposeRollbacks(blocked, limits, packumentReader(settings.registryUrl, settings.fetchFn, settings.warn));
  return {
    product: productName,
    service: settings.service,
    lockfile: [...settings.paths, ...settings.cacheDirs, ...settings.dockerImages].join(", "),
    checkedAt: settings.now().toISOString(),
    listSource: list.source,
    snapshotAgeSeconds: list.snapshotAgeSeconds,
    fallback: null,
    packagesChecked: found.length,
    blocked,
    tooYoung: [],
    rollback,
    advice: [...problems, ...adviceFor(blocked)],
    outcome: blocked.length ? "blocked" : problems.length ? "unavailable" : "allowed",
  };
}
