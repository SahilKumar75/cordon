import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { installArgs, isSandboxEligible, runDocker, scanSandbox, sinkArgs, type DockerResult, type DockerRunner } from "./sandboxCanary.ts";

const image = "node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914";
const request = {
  name: "@bulkheaddemo/colorkit",
  version: "1.4.1",
  tarballUrl: "http://localhost:4873/colorkit-1.4.1.tgz",
  integrity: "sha512-fixture",
  publishedAt: "2026-11-06T10:00:00.000Z",
};

function recordingDocker(answer: (args: string[]) => Partial<DockerResult>) {
  const calls: string[][] = [];
  const docker: DockerRunner = async (args) => {
    calls.push(args);
    return { code: 0, stdout: "", stderr: "", ...answer(args) };
  };
  return { calls, docker };
}

function flagValue(args: string[], flag: string): string | undefined {
  return args[args.indexOf(flag) + 1];
}

const forbiddenFlags = ["-v", "--volume", "--mount", "--tmpfs", "--volumes-from", "--privileged", "--cap-add"];

test("install container args are confined and mount nothing", () => {
  const args = installArgs(image, "bulkhead_run_abc", "tokenvalue");
  assert.equal(args[0], "create");
  assert.ok(args.includes("--rm"));
  assert.equal(flagValue(args, "--network"), "bulkhead_sandbox");
  assert.equal(flagValue(args, "--cap-drop"), "ALL");
  assert.equal(flagValue(args, "--security-opt"), "no-new-privileges");
  assert.equal(flagValue(args, "--memory"), "512m");
  assert.equal(flagValue(args, "--pids-limit"), "256");
  assert.ok(args.includes("CANARY_TOKEN=tokenvalue"));
  assert.ok(args.includes("CANARY_SINK_URL=http://canarysink:8080"));
  assert.deepEqual(args.slice(args.indexOf(image) + 1, args.indexOf(image) + 3), ["npm", "install"]);
  assert.ok(args.includes("--offline"));
  assert.ok(!args.some((arg) => forbiddenFlags.includes(arg) || arg.startsWith("--mount") || arg.startsWith("-v=")));
  assert.ok(!sinkArgs().some((arg) => forbiddenFlags.includes(arg) || arg.startsWith("-p") || arg === "--publish"));
});

test("sandbox runs only for tarballs from the mock registry origin", () => {
  assert.equal(isSandboxEligible("http://localhost:4873/a.tgz", "http://localhost:4873"), true);
  assert.equal(isSandboxEligible("https://registry.npmjs.org/a.tgz", "http://localhost:4873"), false);
  assert.equal(isSandboxEligible("http://localhost:4873/a.tgz", undefined), false);
});

test("first run creates the network and sink, copies the tarball in and reports a received canary", async () => {
  const { calls, docker } = recordingDocker((args) => {
    if (args[0] === "network" && args[1] === "inspect") return { code: 1, stderr: "no such network" };
    if (args[0] === "inspect") return { code: 1, stderr: "no such container" };
    if (args[0] === "exec") return { stdout: JSON.stringify({ received: true, at: "2026-11-06T10:00:03.000Z" }) };
    return {};
  });
  const evidence = await scanSandbox(request, Buffer.from("tarball"), image, docker);
  assert.deepEqual(calls.map((args) => args[0]), ["network", "network", "inspect", "run", "create", "cp", "start", "rm", "exec"]);
  assert.deepEqual(calls[1], ["network", "create", "--internal", "bulkhead_sandbox"]);
  const container = flagValue(calls[4] ?? [], "--name");
  assert.equal(calls[5]?.[2], `${container}:/tmp/package.tgz`);
  const token = (calls[4] ?? []).find((arg) => arg.startsWith("CANARY_TOKEN="))?.slice("CANARY_TOKEN=".length) ?? "";
  assert.match(token, /^[0-9a-f]{48}$/);
  assert.ok(calls[8]?.at(-1)?.endsWith(`token=${token}`));
  assert.equal(evidence.malicious, true);
  assert.equal(evidence.simulated, true);
  assert.equal(evidence.findings[0]?.rule, "canaryTokenExfiltrated");
});

test("a running sink is reused and a silent install is not malicious", async () => {
  const { calls, docker } = recordingDocker((args) => {
    if (args[0] === "inspect") return { stdout: "true\n" };
    if (args[0] === "exec") return { stdout: JSON.stringify({ received: false, at: null }) };
    return {};
  });
  const evidence = await scanSandbox({ ...request, version: "1.4.0" }, Buffer.from("tarball"), image, docker);
  assert.ok(!calls.some((args) => args[0] === "run" || args[1] === "create" || args[0] === "start" && args[1] === "canarysink"));
  assert.equal(evidence.malicious, false);
  assert.deepEqual(evidence.findings, []);
});

test("a stopped sink is started and the run container is removed even when copy fails", async () => {
  const { calls, docker } = recordingDocker((args) => {
    if (args[0] === "inspect") return { stdout: "false\n" };
    if (args[0] === "cp") return { code: 1, stderr: "copy failed" };
    return {};
  });
  await assert.rejects(scanSandbox(request, Buffer.from("tarball"), image, docker), /docker cp failed: copy failed/);
  assert.ok(calls.some((args) => args.join(" ") === "start canarysink"));
  assert.equal(calls.at(-1)?.[0], "rm");
});

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const dockerTests = process.env.BULKHEAD_DOCKER_TESTS === "1";

test("real Docker run flags 1.4.1 and passes 1.4.0", { skip: !dockerTests && "set BULKHEAD_DOCKER_TESTS=1 to run" }, async () => {
  const sandboxImage = process.env.SANDBOX_IMAGE ?? image;
  for (const [version, expected] of [["1.4.0", false], ["1.4.1", true]] as const) {
    const tarball = await readFile(join(repoRoot, "demo/poisonedPackage/dist", `bulkheaddemo-colorkit-${version}.tgz`));
    const integrity = `sha512-${createHash("sha512").update(tarball).digest("base64")}`;
    const evidence = await scanSandbox({ ...request, version, integrity }, tarball, sandboxImage, runDocker);
    assert.equal(evidence.malicious, expected, `version ${version}`);
  }
});
