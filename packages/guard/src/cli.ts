import { execFile, spawn } from "node:child_process";
import { parseArgs, promisify } from "node:util";
import type { Address } from "viem";
import type { GuardReport, Hex32 } from "@cordon/shared";
import { audit } from "./audit.ts";
import { checkLockfile, exitCodes, installChecked, sendReport, type GuardSettings, type Npm } from "./check.ts";
import { defaultRegistryUrl } from "./lockfile.ts";
import { overridesOf } from "./rollback.ts";
import { startSidecar } from "./sidecar.ts";

type Env = Record<string, string | undefined>;

const usage = "usage: cordon <check|install|audit|rollback|sidecar> [--lockfile path] [--service name] [--path dir]... [--cache dir]... [--docker image.tar]... [--port n] [--allow-suspect name@version]...";

const defaultHttpTimeoutMs = 5_000;

function numberFrom(env: Env, name: string, minimum: number): number | null {
  const raw = env[name];
  if (raw === undefined || raw === "") return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) throw new Error(`${name} must be an integer of at least ${minimum}, got ${raw}`);
  return value;
}

function textFrom(env: Env, name: string): string | null {
  return env[name] ? (env[name] as string) : null;
}

function flagFrom(env: Env, name: string): boolean {
  const raw = env[name] ?? "";
  if (!["", "true", "false"].includes(raw)) throw new Error(`${name} must be true or false, got ${raw}`);
  return raw === "true";
}

export function settingsFromEnv(env: Env, flags: { lockfile?: string; service?: string; "allow-suspect"?: string[] }): GuardSettings {
  return {
    lockfile: flags.lockfile ?? process.cwd(),
    service: flags.service ?? null,
    fallbackMinAgeDays: numberFrom(env, "GUARD_FALLBACK_MIN_AGE_DAYS", 1),
    minAgeDays: numberFrom(env, "GUARD_MIN_AGE_DAYS", 0) ?? 0,
    registryUrl: textFrom(env, "NPM_REGISTRY_URL") ?? defaultRegistryUrl,
    allowNonRegistrySources: flagFrom(env, "GUARD_ALLOW_NON_REGISTRY_SOURCES"),
    allowSuspect: flags["allow-suspect"] ?? [],
    suspectBlocks: true,
    chainId: numberFrom(env, "CHAIN_ID", 1),
    rpcUrl: textFrom(env, "RPC_URL"),
    registryAddress: textFrom(env, "REGISTRY_ADDRESS") as Address | null,
    registryStartBlock: numberFrom(env, "REGISTRY_START_BLOCK", 0),
    snapshotUrl: textFrom(env, "GUARD_SNAPSHOT_URL"),
    snapshotSigner: textFrom(env, "GUARD_SNAPSHOT_SIGNER") as Address | null,
    snapshotMaxAgeSeconds: numberFrom(env, "GUARD_SNAPSHOT_MAX_AGE_SECONDS", 1),
    cacheDir: textFrom(env, "GUARD_CACHE_DIR"),
    reportUrl: textFrom(env, "GUARD_REPORT_URL"),
    reporterPrivateKey: textFrom(env, "GUARD_REPORTER_PRIVATE_KEY") as Hex32 | null,
    assumeInstalled: false,
    fetchFn: fetch,
    httpTimeoutMs: numberFrom(env, "GUARD_HTTP_TIMEOUT_MS", 1) ?? defaultHttpTimeoutMs,
    now: () => new Date(),
    warn: (message) => process.stderr.write(`${message}\n`),
  };
}

const systemNpm: Npm = {
  run: (command, args, cwd) =>
    new Promise((resolve, reject) => {
      const child = spawn(command, args, { cwd, stdio: "inherit" });
      child.on("error", reject);
      child.on("exit", (code) => resolve(code ?? 1));
    }),
  version: async () => (await promisify(execFile)("npm", ["--version"])).stdout.trim(),
};

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function reported(report: GuardReport, settings: GuardSettings): Promise<number> {
  printJson(report);
  await sendReport(report, settings);
  return exitCodes[report.outcome];
}

export async function run(argv: string[], env: Env, npm: Npm = systemNpm): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      lockfile: { type: "string" },
      service: { type: "string" },
      path: { type: "string", multiple: true },
      cache: { type: "string", multiple: true },
      docker: { type: "string", multiple: true },
      port: { type: "string" },
      "allow-suspect": { type: "string", multiple: true },
    },
  });
  const settings = settingsFromEnv(env, values);
  const command = positionals[0];
  if (command === "check") return reported(await checkLockfile(settings), settings);
  if (command === "install") {
    const { report, exitCode } = await installChecked(settings, npm);
    await reported(report, settings);
    return exitCode;
  }
  if (command === "audit") {
    const paths = values.path ?? [];
    const scope = { paths: paths.length || values.cache || values.docker ? paths : [process.cwd()], cacheDirs: values.cache ?? [], dockerImages: values.docker ?? [] };
    return reported(await audit({ ...settings, ...scope }), settings);
  }
  if (command === "rollback") {
    const report = await checkLockfile(settings);
    printJson({ report, ...overridesOf(report.rollback) });
    return exitCodes[report.outcome];
  }
  if (command === "sidecar") {
    const port = numberFrom({ "--port": values.port }, "--port", 0);
    if (!values.service || !values.lockfile || port === null) throw new Error("sidecar needs --lockfile, --service and --port");
    const intervalSeconds = numberFrom(env, "POLL_INTERVAL_SECONDS", 1);
    if (intervalSeconds === null) throw new Error("sidecar needs POLL_INTERVAL_SECONDS");
    const sidecar = await startSidecar({ ...settings, service: values.service, port, intervalSeconds });
    process.stderr.write(`sidecar for ${values.service} listening on ${sidecar.url}\n`);
    return new Promise<number>(() => undefined);
  }
  throw new Error(usage);
}

export function main(): void {
  run(process.argv.slice(2), process.env)
    .then((code) => process.exit(code))
    .catch((error: Error) => {
      process.stderr.write(`${error.message}\n`);
      process.exit(exitCodes.unavailable);
    });
}

if (import.meta.filename === process.argv[1]) main();
