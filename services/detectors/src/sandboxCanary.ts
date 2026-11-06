import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Evidence, ScanRequest } from "@cordon/shared";

export type DockerResult = { code: number; stdout: string; stderr: string; timedOut?: boolean };
export type DockerRunner = (args: string[], timeoutMs?: number) => Promise<DockerResult>;

export const sandboxNetwork = "cordon_sandbox";
export const sinkContainer = "canarysink";
export const sinkImage = "cordoncanarysink";
const sinkUrl = `http://${sinkContainer}:8080`;
const installTimeoutMs = 60_000;
const tarballPath = "/tmp/package.tgz";
const processPollMs = 20;
const maxRecordedProcesses = 200;

const confinement = ["--network", sandboxNetwork, "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--memory", "512m", "--pids-limit", "256"];

const fakeSecrets = {
  AWS_ACCESS_KEY_ID: "AKIAFAKECORDONCANARY",
  AWS_SECRET_ACCESS_KEY: "fakeCordonCanarySecretAccessKey",
  NPM_TOKEN: "npm_fakeCordonCanaryToken",
  GITHUB_TOKEN: "ghp_fakeCordonCanaryToken",
};

export const runDocker: DockerRunner = (args, timeoutMs) =>
  new Promise((resolve) => {
    execFile("docker", args, { timeout: timeoutMs, maxBuffer: 10_000_000 }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === "number" ? error.code : 1) : 0;
      resolve({ code, stdout, stderr, timedOut: Boolean(error?.killed) });
    });
  });

export function isSandboxEligible(tarballUrl: string, mockRegistryUrl: string | undefined): boolean {
  return Boolean(mockRegistryUrl) && new URL(tarballUrl).origin === new URL(mockRegistryUrl as string).origin;
}

export function sinkArgs(): string[] {
  return ["run", "--detach", "--name", sinkContainer, ...confinement, sinkImage];
}

export function installArgs(image: string, container: string, token: string): string[] {
  const secrets = Object.entries({ ...fakeSecrets, CANARY_TOKEN: token, CANARY_SINK_URL: sinkUrl }).flatMap(([key, value]) => ["--env", `${key}=${value}`]);
  const npm = ["npm", "install", "--offline", "--no-audit", "--no-fund", "--no-update-notifier", tarballPath];
  return ["create", "--rm", "--name", container, ...confinement, "--user", "node", "--workdir", "/home/node", ...secrets, image, ...npm];
}

async function must(docker: DockerRunner, args: string[], timeoutMs?: number): Promise<string> {
  const result = await docker(args, timeoutMs);
  if (result.code !== 0) throw new Error(`docker ${args[0]} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

async function ensureInternalNetwork(docker: DockerRunner): Promise<void> {
  const inspected = await docker(["network", "inspect", "--format", "{{.Internal}}", sandboxNetwork]);
  if (inspected.code !== 0) await must(docker, ["network", "create", "--internal", sandboxNetwork]);
  else if (inspected.stdout.trim() !== "true") throw new Error(`docker network ${sandboxNetwork} exists but is not internal, refusing to run the sandbox`);
}

const recreatedSinks = new WeakMap<DockerRunner, Promise<string>>();

function recreateSinkOnce(docker: DockerRunner): Promise<string> {
  const ready = recreatedSinks.get(docker) ?? docker(["rm", "--force", sinkContainer]).then(() => must(docker, sinkArgs()));
  recreatedSinks.set(docker, ready);
  ready.catch(() => recreatedSinks.delete(docker));
  return ready;
}

async function watchProcesses(docker: DockerRunner, container: string, running: () => boolean): Promise<string[]> {
  const seen = new Set<string>();
  while (running() && seen.size < maxRecordedProcesses) {
    const [header = "", ...rows] = (await docker(["top", container])).stdout.split("\n");
    const commandColumn = header.indexOf("CMD");
    if (commandColumn >= 0) rows.map((row) => row.slice(commandColumn).trim()).filter(Boolean).forEach((command) => seen.add(command));
    await new Promise((resolve) => setTimeout(resolve, processPollMs));
  }
  return [...seen];
}

async function installInSandbox(docker: DockerRunner, image: string, tarball: Buffer, token: string): Promise<string[]> {
  const container = `cordon_run_${randomBytes(6).toString("hex")}`;
  const folder = await mkdtemp(join(tmpdir(), "cordonSandbox"));
  try {
    await writeFile(join(folder, "package.tgz"), tarball);
    await must(docker, installArgs(image, container, token));
    await must(docker, ["cp", join(folder, "package.tgz"), `${container}:${tarballPath}`]);
    let running = true;
    const processes = watchProcesses(docker, container, () => running);
    const run = await docker(["start", "--attach", container], installTimeoutMs);
    running = false;
    if (run.code !== 0 && !run.timedOut) throw new Error(`sandbox install exited with code ${run.code}: ${run.stderr.trim().slice(-500)}`);
    return await processes;
  } finally {
    await docker(["rm", "--force", container]);
    await rm(folder, { recursive: true, force: true });
  }
}

export async function scanSandbox(request: ScanRequest, tarball: Buffer, image: string, docker: DockerRunner): Promise<Evidence> {
  const token = randomBytes(24).toString("hex");
  await ensureInternalNetwork(docker);
  await recreateSinkOnce(docker);
  const processes = await installInSandbox(docker, image, tarball, token);
  const receivedUrl = `http://127.0.0.1:8080/received?token=${encodeURIComponent(token)}`;
  const answer = await must(docker, ["exec", sinkContainer, "wget", "-q", "-O", "-", receivedUrl]);
  const { received, at } = JSON.parse(answer) as { received: boolean; at: string | null };
  return {
    name: request.name,
    version: request.version,
    detector: "sandboxCanary",
    integrity: request.integrity,
    malicious: received,
    simulated: true,
    findings: [
      ...(received ? [{ rule: "canaryTokenExfiltrated", detail: `install sent this run's canary token to the sink at ${at}`, file: null }] : []),
      ...processes.map((command) => ({ rule: "sandboxProcess", detail: command, file: null })),
    ],
    advisoryUrl: null,
    observedAt: new Date().toISOString(),
  };
}
