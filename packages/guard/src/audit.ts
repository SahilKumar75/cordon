import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join } from "node:path";
import { Parser, list as listTar, type ReadEntry } from "tar";
import { productName, sealKeyOf, type GuardReport } from "@cordon/shared";
import { adviceFor, nonRegistryVerdict, suspectAdvice, type GuardSettings } from "./check.ts";
import {
  defaultRegistryUrl,
  hiddenLockfileName,
  lockfileNames,
  nonRegistrySourcesOf,
  readJson,
  readLockfile,
  type NonRegistrySource,
} from "./lockfile.ts";
import { packumentReader } from "./registry.ts";
import { proposeRollbacks } from "./rollback.ts";
import { loadSealedList } from "./sealedList.ts";

export type AuditSettings = GuardSettings & { paths: string[]; cacheDirs: string[]; dockerImages: string[] };

type Found = { name: string; version: string; source: string };

type HookFile = GuardReport["hookFiles"][number];

type Scan = { found: Found[]; problems: string[]; hookFiles: HookFile[]; sources?: NonRegistrySource[] };

type ClaudeSettings = { hooks?: Record<string, { hooks?: { command?: unknown }[] }[]> };

type VscodeTasks = { tasks?: { command?: unknown; args?: unknown; runOptions?: { runOn?: unknown } }[] };

const skippedDirs = new Set(["node_modules", ".git", ".pnpm_store"]);
const tarballPattern = /\/((?:@[^/]+(?:\/|%2[fF]))?([^/]+))\/-\/([^/]+)\.tgz$/;
const claudeSettingsPattern = /(?:^|\/)\.claude\/settings(?:\.local)?\.json$/;
const vscodeTasksPattern = /(?:^|\/)\.vscode\/tasks\.json$/;
const folderOpenPattern = /"runOn"\s*:\s*"folderOpen"/;
const hookAdvice =
  "Inspect and remove the editor and coding agent hook files listed under hookFiles before revoking any token: they can run again when the project opens and some payloads destroy files when a token is revoked.";
const installedManifestPattern = /(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/@.][^/]*\/package\.json$/;

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (!entry.isDirectory()) return [path];
    if (entry.name === "node_modules") return existsSync(join(path, hiddenLockfileName)) ? [join(path, hiddenLockfileName)] : [];
    return skippedDirs.has(entry.name) ? [] : filesUnder(path);
  });
}

function referencedFiles(root: string, words: string[]): string[] {
  return words.flatMap((word) => {
    const token = word.replace(/["']/g, "").replace(/^\$\{?(CLAUDE_PROJECT_DIR|workspaceFolder)\}?/, root);
    if (!token || token.startsWith("-")) return [];
    const path = isAbsolute(token) ? token : join(root, token);
    return existsSync(path) && statSync(path).isFile() ? [path] : [];
  });
}

function claudeHookFiles(file: string): HookFile[] {
  const settings = readJson(file) as ClaudeSettings | null;
  const groups = Object.values(settings?.hooks ?? {}).flat();
  if (!groups.length) return [];
  const commands = groups.flatMap((group) => group.hooks ?? []).flatMap((hook) => (typeof hook.command === "string" ? [hook.command] : []));
  const root = dirname(dirname(file));
  return [file, ...referencedFiles(root, commands.flatMap((command) => command.split(/\s+/)))].map((path) => ({ path, tool: "claude" }));
}

function tasksOf(text: string): NonNullable<VscodeTasks["tasks"]> {
  try {
    return (JSON.parse(text) as VscodeTasks).tasks ?? [];
  } catch (error) {
    if (error instanceof SyntaxError) return [];
    throw error;
  }
}

function vscodeHookFiles(file: string): HookFile[] {
  const text = readFileSync(file, "utf8");
  if (!folderOpenPattern.test(text)) return [];
  const tasks = tasksOf(text.replace(/^\s*\/\/.*$/gm, ""));
  const words = tasks
    .filter((task) => task.runOptions?.runOn === "folderOpen")
    .flatMap((task) => [task.command, ...(Array.isArray(task.args) ? task.args : [])])
    .flatMap((word) => (typeof word === "string" ? word.split(/\s+/) : []));
  return [file, ...referencedFiles(dirname(dirname(file)), words)].map((path) => ({ path, tool: "vscode" }));
}

function scanPath(dir: string, registryUrl: string): Scan {
  if (!existsSync(dir)) return { found: [], problems: [`no directory at ${dir}`], hookFiles: [] };
  const files = filesUnder(dir);
  const auditedNames = [...lockfileNames, hiddenLockfileName];
  const reads = files.filter((file) => auditedNames.includes(basename(file))).map((file) => readLockfile(file, auditedNames));
  const hookFiles = files.flatMap((file) => {
    if (claudeSettingsPattern.test(file)) return claudeHookFiles(file);
    return vscodeTasksPattern.test(file) ? vscodeHookFiles(file) : [];
  });
  return {
    found: reads.flatMap((read) => (read.ok ? read.entries.map(({ name, version }) => ({ name, version, source: read.path })) : [])),
    sources: reads.flatMap((read) => (read.ok ? nonRegistrySourcesOf(read.entries, read.path, registryUrl) : [])),
    problems: reads.flatMap((read) => (read.ok ? [] : [read.reason])),
    hookFiles,
  };
}

export function packageFromTarballUrl(url: string): { name: string; version: string } | null {
  const match = tarballPattern.exec(url);
  if (!match?.[1] || !match[2] || !match[3]?.startsWith(`${match[2]}-`)) return null;
  return { name: decodeURIComponent(match[1]), version: match[3].slice(match[2].length + 1) };
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
  if (!index) return { found: [], problems: [`no npm cache index under ${dir}`], hookFiles: [] };
  const found = filesUnder(index).flatMap((file) =>
    cacheKeysOf(file).flatMap((key) => {
      const pkg = packageFromTarballUrl(key);
      return pkg ? [{ ...pkg, source: file }] : [];
    }),
  );
  return { found, problems: [], hookFiles: [] };
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
  if (!existsSync(file)) return { found: [], problems: [`no saved image at ${file}`], hookFiles: [] };
  const layers = await layersOf(file);
  if (!layers) return { found: [], problems: [`no readable manifest.json in ${file}`], hookFiles: [] };
  const scan: Scan = { found: [], problems: [], hookFiles: [] };
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
    ...settings.paths.map((path) => scanPath(path, settings.registryUrl ?? defaultRegistryUrl)),
    ...settings.cacheDirs.map(scanCache),
    ...(await Promise.all(settings.dockerImages.map(scanImage))),
  ];
  const found = scans.flatMap((scan) => scan.found);
  const sources = scans.flatMap((scan) => scan.sources ?? []);
  const git = nonRegistryVerdict(sources, settings.allowNonRegistrySources);
  const hookFiles = [...new Map(scans.flatMap((scan) => scan.hookFiles).map((hook) => [hook.path, hook])).values()];
  const list = await loadSealedList(settings);
  const problems = [...scans.flatMap((scan) => scan.problems), ...(list.source === "none" ? ["The Sealed list was unavailable, so installed versions could not be checked."] : [])];
  const hits = found.flatMap(({ name, version, source }) => {
    const key = sealKeyOf(name, version);
    return list.keys.has(key) ? [{ name, version, key, lockfilePath: source, alreadyInstalled: true }] : [];
  });
  const blocked = [...new Map(hits.map((block) => [`${block.key}${block.lockfilePath}`, block])).values()];
  const suspect = found.flatMap(({ name, version, source }) => {
    const key = sealKeyOf(name, version);
    const info = list.suspects.get(key);
    return info && !list.keys.has(key) ? [{ name, version, key, lockfilePath: source, ...info, allowed: true }] : [];
  });
  const limits = { sealedKeys: list.keys, minAgeDays: settings.minAgeDays, now: settings.now() };
  const rollback = await proposeRollbacks(blocked, limits, packumentReader(settings.registryUrl, settings.fetchFn, settings.warn, settings.httpTimeoutMs));
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
    suspect,
    nonRegistrySources: sources,
    hookFiles,
    tooYoung: [],
    rollback,
    advice: [...problems, ...git.advice, ...(hookFiles.length ? [hookAdvice] : []), ...suspectAdvice(suspect), ...adviceFor(blocked)],
    outcome: blocked.length || git.blocks ? "blocked" : problems.length ? "unavailable" : "allowed",
  };
}
