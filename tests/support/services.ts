import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { GuardReport } from "@bulkhead/shared";
import { freePort, repoRoot, type LocalChain } from "./chain.ts";

export type Env = Record<string, string>;

export type Running = { url: string; stop: () => Promise<void> };

export type Service = Running & { output: () => string };

export type GuardRun = { code: number | null; report: GuardReport; stderr: string };

const guardCli = join(repoRoot, "packages", "guard", "src", "cli.ts");
const watcherServer = join(repoRoot, "services", "watcher", "src", "server.ts");
export const detectorsServer = join(repoRoot, "services", "detectors", "src", "server.ts");

export function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "chaosTest"));
}

export async function deadUrl(): Promise<string> {
  return `http://127.0.0.1:${await freePort()}`;
}

export async function eventually(check: () => Promise<boolean>, what: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

function spawnNode(script: string, args: string[], env: Env): { child: ChildProcess; stdout: () => string; stderr: () => string } {
  const child = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", script, ...args], {
    env: { PATH: process.env.PATH ?? "", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
  return { child, stdout: () => stdout, stderr: () => stderr };
}

export async function startService(script: string, env: Env, port: number): Promise<Service> {
  const { child, stdout, stderr } = spawnNode(script, [], env);
  const output = () => stdout() + stderr();
  const exited = new Promise<void>((resolve) => child.on("exit", () => resolve()));
  const url = `http://127.0.0.1:${port}`;
  const healthy = () => fetch(`${url}/health`).then((response) => response.ok, () => false);
  const early = exited.then(() => Promise.reject(new Error(`${script} exited before it was healthy: ${output()}`)));
  await Promise.race([eventually(healthy, `${script} health`), early]);
  const stop = async () => {
    child.kill();
    await exited;
  };
  return { url, output, stop };
}

export function runGuard(args: string[], env: Env): Promise<GuardRun> {
  const { child, stdout, stderr } = spawnNode(guardCli, args, env);
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, report: JSON.parse(stdout()) as GuardReport, stderr: stderr() }));
  });
}

export async function serve(files: Record<string, string | Buffer>): Promise<Running> {
  const port = await freePort();
  const server = createServer((request, response) => {
    const body = files[request.url ?? ""];
    if (body === undefined) response.writeHead(404).end("not found");
    else response.writeHead(200).end(body);
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const stop = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return { url: `http://127.0.0.1:${port}`, stop };
}

export function writeLockfile(directory: string, packages: { path: string; name: string; version: string }[]): string {
  const entries = Object.fromEntries(
    packages.map(({ path, name, version }) => [path, { name, version, resolved: `http://127.0.0.1/${name}/${version}.tgz`, integrity: "sha512-AAAA" }]),
  );
  const file = join(directory, "package-lock.json");
  writeFileSync(file, JSON.stringify({ name: "chaosApp", lockfileVersion: 3, packages: { "": { name: "chaosApp" }, ...entries } }));
  return file;
}

export async function startWatcher(chain: LocalChain, registry: Address, signerKey: Hex, reporterKey: Hex, directory: string): Promise<Service> {
  const port = await freePort();
  return startService(
    watcherServer,
    {
      CHAIN_ID: String(chain.chainId),
      RPC_URL: chain.rpcUrl,
      EXPLORER_URL: "http://127.0.0.1/explorer",
      NATIVE_SYMBOL: "ETH",
      REGISTRY_ADDRESS: registry,
      NPM_REGISTRY_URL: await deadUrl(),
      DETECTORS_URL: await deadUrl(),
      SNAPSHOT_PATH: join(directory, "snapshot.json"),
      SNAPSHOT_SIGNER_PRIVATE_KEY: signerKey,
      DATABASE_PATH: join(directory, "watcher.db"),
      GUARD_REPORTER_ADDRESSES: privateKeyToAccount(reporterKey).address,
      DASHBOARD_ORIGIN: "http://127.0.0.1:3000",
      POLL_INTERVAL_SECONDS: "1",
      WATCHER_PORT: String(port),
      REGISTRY_START_BLOCK: "0",
    },
    port,
  );
}
