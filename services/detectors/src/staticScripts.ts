import { createHash } from "node:crypto";
import { posix } from "node:path";
import { Parser } from "tar";
import type { Evidence, Finding, ScanRequest } from "@bulkhead/shared";

export type FetchLike = typeof fetch;

const lifecycleScripts = ["preinstall", "install", "postinstall", "prepare"];
const dependencyFields = ["dependencies", "optionalDependencies"];
const javaScriptFile = /\.(c|m)?js$/;
const gitSpec = /^(git(\+[a-z]+)?:|github:|gitlab:|bitbucket:|git@|https?:\/\/(www\.)?github\.com\/)|^[\w.-]+\/[\w.-]+(#.*)?$/;

const rules = [
  { rule: "installScriptNetwork", pattern: /\b(https?|net|dns|fetch|curl|wget)\b/ },
  { rule: "installScriptEnv", pattern: /process\.env|\$\{?[A-Z_][A-Z0-9_]*\b/ },
  { rule: "installScriptShell", pattern: /child_process|\b(exec|execSync|execFile|spawn|spawnSync)\b|(?<![\w.])(sh|bash)\b/ },
  { rule: "installScriptRuntime", pattern: /\b(bunx?|deno|python[0-9.]*|chmod)\b/ },
];

const magicNumbers = [
  { kind: "ELF binary", bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { kind: "Mach O binary", bytes: [0xfe, 0xed, 0xfa, 0xce] },
  { kind: "Mach O binary", bytes: [0xfe, 0xed, 0xfa, 0xcf] },
  { kind: "Mach O binary", bytes: [0xce, 0xfa, 0xed, 0xfe] },
  { kind: "Mach O binary", bytes: [0xcf, 0xfa, 0xed, 0xfe] },
  { kind: "Mach O universal binary", bytes: [0xca, 0xfe, 0xba, 0xbe] },
  { kind: "PE binary", bytes: [0x4d, 0x5a] },
  { kind: "WebAssembly module", bytes: [0x00, 0x61, 0x73, 0x6d] },
];

type Manifest = Partial<Record<string, Record<string, string>>>;

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

export async function readTarballFiles(tarball: Buffer): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  const parser = new Parser({
    onReadEntry: (entry) => {
      const chunks: Buffer[] = [];
      entry.on("data", (chunk: Buffer) => chunks.push(chunk));
      entry.on("end", () => {
        if (entry.type === "File") files.set(entry.path.replace(/^[^/]+\//, ""), Buffer.concat(chunks));
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

function calledFiles(command: string, files: Map<string, Buffer>): string[] {
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

function payloadKind(path: string, content: Buffer): string | undefined {
  const magic = magicNumbers.find(({ bytes }) => bytes.every((byte, index) => content[index] === byte));
  if (magic) return magic.kind;
  const firstLine = content.subarray(0, 128).toString("utf8").split("\n")[0] ?? "";
  if (path.endsWith(".sh") || (firstLine.startsWith("#!") && !/\bnode\b/.test(firstLine))) return "shell script";
  return undefined;
}

function scriptFindings(hook: string, command: string, files: Map<string, Buffer>): Finding[] {
  const called = calledFiles(command, files);
  const nodeTargets = [...command.matchAll(/\bnode\s+(?!-)([^\s;&|]+)/g)].map((match) => match[1] ?? "");
  return [
    ...matchRules(command, hook, "package.json"),
    ...called.flatMap((file) => matchRules((files.get(file) ?? Buffer.alloc(0)).toString("utf8"), hook, file)),
    ...called
      .filter((file) => !javaScriptFile.test(file) && !file.endsWith(".json"))
      .map((file) => ({ rule: "installScriptCallsNonJs", detail: `${hook} script calls ${file}, which is not plain JavaScript`, file })),
    ...nodeTargets
      .filter((target) => !javaScriptFile.test(target) && !files.has(`${target}.js`))
      .map((target) => ({ rule: "installScriptNodeNonJs", detail: `${hook} script runs node on ${target}, which is not a JavaScript file`, file: "package.json" })),
  ];
}

function gitDependencyFindings(manifest: Manifest): Finding[] {
  return dependencyFields.flatMap((field) =>
    Object.entries(manifest[field] ?? {})
      .filter(([, spec]) => typeof spec === "string" && gitSpec.test(spec))
      .map(([name, spec]) => ({ rule: "gitDependency", detail: `${field} ${name} points at git: ${spec}`, file: "package.json" })),
  );
}

function payloadFindings(files: Map<string, Buffer>): Finding[] {
  return [...files].flatMap(([path, content]) => {
    const kind = payloadKind(path, content);
    return kind ? [{ rule: "payloadNonJavaScript", detail: `${path} is a ${kind}`, file: path }] : [];
  });
}

export function analyzeInstallScripts(files: Map<string, Buffer>): Finding[] {
  const manifest = JSON.parse((files.get("package.json") ?? "{}").toString()) as Manifest;
  const scripts = manifest.scripts ?? {};
  const hooks = lifecycleScripts.filter((hook) => typeof scripts[hook] === "string");
  return [
    ...hooks.flatMap((hook) => scriptFindings(hook, scripts[hook] as string, files)),
    ...gitDependencyFindings(manifest),
    ...payloadFindings(files),
  ];
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
