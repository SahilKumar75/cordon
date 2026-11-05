import { createHash } from "node:crypto";
import { posix } from "node:path";
import { Parser } from "tar";
import type { Evidence, Finding, ScanRequest } from "@bulkhead/shared";

export type FetchLike = typeof fetch;

const lifecycleScripts = ["preinstall", "install", "postinstall", "prepare"];

const rules = [
  { rule: "installScriptNetwork", pattern: /\b(https?|net|dns|fetch|curl|wget)\b/ },
  { rule: "installScriptEnv", pattern: /process\.env|\$\{?[A-Z_][A-Z0-9_]*\b/ },
  { rule: "installScriptShell", pattern: /child_process|\b(exec|execSync|execFile|spawn|spawnSync|sh|bash)\b/ },
];

export async function downloadTarball(url: string, integrity: string, fetchImpl: FetchLike): Promise<Buffer> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`tarball download failed with status ${response.status} for ${url}`);
  const tarball = Buffer.from(await response.arrayBuffer());
  const [algorithm, expected] = integrity.split(/-(.*)/s);
  if (!algorithm || !expected) throw new Error(`integrity value is not in algorithm and base64 form: ${integrity}`);
  const actual = createHash(algorithm).update(tarball).digest("base64");
  if (actual !== expected) throw new Error(`tarball integrity mismatch for ${url}`);
  return tarball;
}

export async function readTarballFiles(tarball: Buffer): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const parser = new Parser({
    onReadEntry: (entry) => {
      const chunks: Buffer[] = [];
      entry.on("data", (chunk: Buffer) => chunks.push(chunk));
      entry.on("end", () => {
        if (entry.type === "File") files.set(entry.path.replace(/^[^/]+\//, ""), Buffer.concat(chunks).toString("utf8"));
      });
    },
  });
  await new Promise<void>((resolve, reject) => {
    parser.on("close", resolve);
    parser.on("error", reject);
    parser.end(tarball);
  });
  return files;
}

function calledFiles(command: string, files: Map<string, string>): string[] {
  return command
    .split(/[\s;&|()"']+/)
    .map((token) => posix.normalize(token).replace(/^\.\//, ""))
    .filter((token) => files.has(token));
}

function matchRules(text: string, hook: string, file: string): Finding[] {
  return rules
    .filter(({ pattern }) => pattern.test(text))
    .map(({ rule }) => ({ rule, detail: `${hook} script ${file === "package.json" ? "command" : "calls a file that"} matches ${rule}`, file }));
}

export function analyzeInstallScripts(files: Map<string, string>): Finding[] {
  const manifest = JSON.parse(files.get("package.json") ?? "{}") as { scripts?: Record<string, string> };
  const scripts = manifest.scripts ?? {};
  return lifecycleScripts
    .filter((hook) => typeof scripts[hook] === "string")
    .flatMap((hook) => {
      const command = scripts[hook] as string;
      const called = calledFiles(command, files).flatMap((file) => matchRules(files.get(file) ?? "", hook, file));
      return [...matchRules(command, hook, "package.json"), ...called];
    });
}

export async function scanStatic(request: ScanRequest, tarball: Buffer): Promise<Evidence> {
  const findings = analyzeInstallScripts(await readTarballFiles(tarball));
  return {
    name: request.name,
    version: request.version,
    detector: "staticScripts",
    integrity: request.integrity,
    malicious: findings.length > 0,
    simulated: true,
    findings,
    advisoryUrl: null,
    observedAt: new Date().toISOString(),
  };
}
