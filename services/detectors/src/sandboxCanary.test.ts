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
    if (args[0] === "top") return { code: 1, stdout: "", stderr: "not running", ...answer(args) };
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

function receivedAnswer(received: boolean) {
  return { stdout: JSON.stringify({ received, at: received ? "2026-11-06T10:00:03.000Z" : null }) };
}

test("first run creates the internal network, recreates the sink, copies the tarball in and reports a received canary", async () => {
  const { calls, docker } = recordingDocker((args) => {
    if (args[0] === "network" && args[1] === "inspect") return { code: 1, stderr: "no such network" };
    if (args[0] === "exec") return receivedAnswer(true);
    return {};
  });
  const evidence = await scanSandbox(request, Buffer.from("tarball"), image, docker);
  assert.deepEqual(calls.map((args) => args[0]), ["network", "network", "rm", "run", "create", "cp", "start", "rm", "exec"]);
  assert.deepEqual(calls[1], ["network", "create", "--internal", "bulkhead_sandbox"]);
  assert.deepEqual(calls[2], ["rm", "--force", "canarysink"]);
  assert.deepEqual(calls[3], sinkArgs());
  const container = flagValue(calls[4] ?? [], "--name");
  assert.equal(calls[5]?.[2], `${container}:/tmp/package.tgz`);
  const token = (calls[4] ?? []).find((arg) => arg.startsWith("CANARY_TOKEN="))?.slice("CANARY_TOKEN=".length) ?? "";
  assert.match(token, /^[0-9a-f]{48}$/);
  assert.ok(calls[8]?.at(-1)?.endsWith(`token=${token}`));
  assert.equal(evidence.malicious, true);
  assert.equal(evidence.simulated, true);
  assert.equal(evidence.findings[0]?.rule, "canaryTokenExfiltrated");
});

test("the sink is recreated once per runner and a silent install is not malicious", async () => {
  const { calls, docker } = recordingDocker((args) => {
    if (args[0] === "network") return { stdout: "true\n" };
    if (args[0] === "exec") return receivedAnswer(false);
    return {};
  });
  await scanSandbox(request, Buffer.from("tarball"), image, docker);
  const evidence = await scanSandbox({ ...request, version: "1.4.0" }, Buffer.from("tarball"), image, docker);
  assert.equal(calls.filter((args) => args.join(" ") === "rm --force canarysink").length, 1);
  assert.equal(calls.filter((args) => args[0] === "run").length, 1);
  assert.ok(!calls.some((args) => args[1] === "create"));
  assert.equal(evidence.malicious, false);
  assert.deepEqual(evidence.findings, []);
});

test("an existing network that is not internal stops the run before any container starts", async () => {
  const { calls, docker } = recordingDocker((args) => (args[0] === "network" ? { stdout: "false\n" } : {}));
  await assert.rejects(scanSandbox(request, Buffer.from("tarball"), image, docker), /not internal, refusing/);
  assert.deepEqual(calls, [["network", "inspect", "--format", "{{.Internal}}", "bulkhead_sandbox"]]);
});

test("a failing install throws but a timed out install still asks the sink", async () => {
  const failing = recordingDocker((args) => (args[0] === "network" ? { stdout: "true" } : args[0] === "start" ? { code: 1, stderr: "npm error" } : {}));
  await assert.rejects(scanSandbox(request, Buffer.from("tarball"), image, failing.docker), /exited with code 1: npm error/);
  assert.equal(failing.calls.at(-1)?.[0], "rm");
  const timedOut = recordingDocker((args) => {
    if (args[0] === "network") return { stdout: "true" };
    if (args[0] === "start") return { code: 1, timedOut: true };
    if (args[0] === "exec") return receivedAnswer(true);
    return {};
  });
  assert.equal((await scanSandbox(request, Buffer.from("tarball"), image, timedOut.docker)).malicious, true);
});

const topHeader = "UID    PID    PPID   C      STIME  TTY    TIME       CMD";
const topSnapshots = [
  [topHeader, "1000   10     1      0      10:00  ?      00:00:00   npm install /tmp/package.tgz"],
  [topHeader, "1000   10     1      0      10:00  ?      00:00:00   npm install /tmp/package.tgz", "1000   20     10     0      10:00  ?      00:00:00   sh -c node postinstall.js"],
  [topHeader, "1000   20     10     0      10:00  ?      00:00:00   sh -c node postinstall.js", "1000   21     20     0      10:00  ?      00:00:00   node postinstall.js"],
];

test("every process seen in the run container during the install is kept as a finding", async () => {
  let polls = 0;
  const docker: DockerRunner = async (args) => {
    if (args[0] === "network") return { code: 0, stdout: "true", stderr: "" };
    if (args[0] === "top") return { code: 0, stdout: (topSnapshots[Math.min(polls++, topSnapshots.length - 1)] ?? []).join("\n"), stderr: "" };
    if (args[0] === "start") await new Promise((resolve) => setTimeout(resolve, 150));
    if (args[0] === "exec") return { code: 0, stdout: JSON.stringify({ received: false, at: null }), stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  };
  const evidence = await scanSandbox(request, Buffer.from("tarball"), image, docker);
  assert.ok(polls >= 3);
  assert.deepEqual(
    evidence.findings.map(({ rule, detail }) => `${rule}:${detail}`),
    ["sandboxProcess:npm install /tmp/package.tgz", "sandboxProcess:sh -c node postinstall.js", "sandboxProcess:node postinstall.js"],
  );
  assert.equal(evidence.malicious, false);
});

test("the run container is removed even when copy fails", async () => {
  const { calls, docker } = recordingDocker((args) => (args[0] === "network" ? { stdout: "true" } : args[0] === "cp" ? { code: 1, stderr: "copy failed" } : {}));
  await assert.rejects(scanSandbox(request, Buffer.from("tarball"), image, docker), /docker cp failed: copy failed/);
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
    const processes = evidence.findings.filter(({ rule }) => rule === "sandboxProcess").map(({ detail }) => detail);
    assert.ok(processes.some((command) => command.startsWith("npm")), `version ${version} npm seen`);
    if (expected) {
      assert.ok(processes.some((command) => /^node postinstall\.js/.test(command)), `node seen in ${processes.join(" | ")}`);
    }
  }
});
