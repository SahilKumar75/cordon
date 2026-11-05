import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Evidence, ScanRequest } from "@bulkhead/shared";

export type DockerResult = { code: number; stdout: string; stderr: string };
export type DockerRunner = (args: string[], timeoutMs?: number) => Promise<DockerResult>;

export const sandboxNetwork = "bulkhead_sandbox";
export const sinkContainer = "canarysink";
export const sinkImage = "bulkheadcanarysink";
const sinkUrl = `http://${sinkContainer}:8080`;
const installTimeoutMs = 60_000;
const tarballPath = "/tmp/package.tgz";

const confinement = ["--network", sandboxNetwork, "--cap-drop", "ALL", "--security-opt", "no-new-privileges", "--memory", "512m", "--pids-limit", "256"];

const fakeSecrets = {
  AWS_ACCESS_KEY_ID: "AKIAFAKEBULKHEADCANARY",
  AWS_SECRET_ACCESS_KEY: "fakeBulkheadCanarySecretAccessKey",
  NPM_TOKEN: "npm_fakeBulkheadCanaryToken",
  GITHUB_TOKEN: "ghp_fakeBulkheadCanaryToken",
};

export const runDocker: DockerRunner = (args, timeoutMs) =>
  new Promise((resolve) => {
    execFile("docker", args, { timeout: timeoutMs, maxBuffer: 10_000_000 }, (error, stdout, stderr) => {
      const code = error ? (typeof error.code === "number" ? error.code : 1) : 0;
      resolve({ code, stdout, stderr });
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

async function ensureSandbox(docker: DockerRunner): Promise<void> {
  if ((await docker(["network", "inspect", sandboxNetwork])).code !== 0) {
    await must(docker, ["network", "create", "--internal", sandboxNetwork]);
  }
  const state = await docker(["inspect", "--format", "{{.State.Running}}", sinkContainer]);
  if (state.code !== 0) await must(docker, sinkArgs());
  else if (state.stdout.trim() !== "true") await must(docker, ["start", sinkContainer]);
}

async function installInSandbox(docker: DockerRunner, image: string, tarball: Buffer, token: string): Promise<void> {
  const container = `bulkhead_run_${randomBytes(6).toString("hex")}`;
  const folder = await mkdtemp(join(tmpdir(), "bulkheadSandbox"));
  try {
    await writeFile(join(folder, "package.tgz"), tarball);
    await must(docker, installArgs(image, container, token));
    await must(docker, ["cp", join(folder, "package.tgz"), `${container}:${tarballPath}`]);
    await docker(["start", "--attach", container], installTimeoutMs);
  } finally {
    await docker(["rm", "--force", container]);
    await rm(folder, { recursive: true, force: true });
  }
}

async function askSink(docker: DockerRunner, token: string): Promise<{ received: boolean; at: string | null }> {
  const url = `http://127.0.0.1:8080/received?token=${encodeURIComponent(token)}`;
  return JSON.parse(await must(docker, ["exec", sinkContainer, "wget", "-q", "-O", "-", url]));
}

export async function scanSandbox(request: ScanRequest, tarball: Buffer, image: string, docker: DockerRunner): Promise<Evidence> {
  const token = randomBytes(24).toString("hex");
  await ensureSandbox(docker);
  await installInSandbox(docker, image, tarball, token);
  const { received, at } = await askSink(docker, token);
  return {
    name: request.name,
    version: request.version,
    detector: "sandboxCanary",
    integrity: request.integrity,
    malicious: received,
    simulated: true,
    findings: received ? [{ rule: "canaryTokenExfiltrated", detail: `install sent this run's canary token to the sink at ${at}`, file: null }] : [],
    advisoryUrl: null,
    observedAt: new Date().toISOString(),
  };
}
