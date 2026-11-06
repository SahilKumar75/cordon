import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { downloadTarball, scanStatic } from "./staticScripts.ts";
import { packFixture } from "./testSupport.ts";

function requestFor(version: string, tarball: Buffer) {
  return {
    name: "@cordondemo/colorkit",
    version,
    tarballUrl: `http://localhost:4873/colorkit-${version}.tgz`,
    integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
    publishedAt: "2026-11-06T10:00:00.000Z",
  };
}

const cleanManifest = JSON.stringify({ name: "@cordondemo/colorkit", version: "1.4.0", main: "index.js" });
const poisonedManifest = JSON.stringify({
  name: "@cordondemo/colorkit",
  version: "1.4.1",
  scripts: { postinstall: "node postinstall.js", test: "curl example" },
});
const poisonedScript = "const token = process.env.CANARY_TOKEN; await fetch(process.env.CANARY_SINK_URL);";

test("a version without install scripts passes", async () => {
  const tarball = await packFixture({ "package.json": cleanManifest, "index.js": "export const red = 1;" });
  const evidence = await scanStatic(requestFor("1.4.0", tarball), tarball);
  assert.equal(evidence.malicious, false);
  assert.deepEqual(evidence.findings, []);
  assert.equal(evidence.simulated, true);
});

test("a postinstall whose called file reads env and touches the network is flagged", async () => {
  const tarball = await packFixture({ "package.json": poisonedManifest, "postinstall.js": poisonedScript });
  const evidence = await scanStatic(requestFor("1.4.1", tarball), tarball);
  assert.equal(evidence.malicious, true);
  assert.deepEqual(
    evidence.findings.map(({ rule, file }) => `${rule}:${file}`).sort(),
    ["installScriptEnv:postinstall.js", "installScriptNetwork:postinstall.js"],
  );
});

test("a shell install command that exports a variable is flagged on the command itself", async () => {
  const manifest = JSON.stringify({ name: "x", version: "1.0.0", scripts: { preinstall: "sh -c 'echo $HOME | wget -q -'" } });
  const tarball = await packFixture({ "package.json": manifest });
  const evidence = await scanStatic(requestFor("1.0.0", tarball), tarball);
  assert.deepEqual(
    evidence.findings.map(({ rule }) => rule).sort(),
    ["installScriptEnv", "installScriptNetwork", "installScriptShell"],
  );
  assert.ok(evidence.findings.every(({ file }) => file === "package.json"));
});

test("non lifecycle scripts are ignored", async () => {
  const manifest = JSON.stringify({ name: "x", version: "1.0.0", scripts: { test: "curl http://example.com", build: "sh build.sh" } });
  const tarball = await packFixture({ "package.json": manifest });
  assert.equal((await scanStatic(requestFor("1.0.0", tarball), tarball)).malicious, false);
});

function rulesOf(findings: { rule: string; file: string | null }[]): string[] {
  return findings.map(({ rule, file }) => `${rule}:${file}`).sort();
}

async function findingsFor(files: Record<string, string | Uint8Array>) {
  const tarball = await packFixture(files);
  const evidence = await scanStatic(requestFor("9.9.9", tarball), tarball);
  return { malicious: evidence.malicious, rules: rulesOf(evidence.findings) };
}

test("the TanStack pattern of a git optionalDependency and a prepare script that runs bun is flagged", async () => {
  const manifest = JSON.stringify({
    name: "fixture",
    version: "9.9.9",
    scripts: { prepare: "bun run tanstack_runner.js && exit 1" },
    optionalDependencies: { "@tanstack/setup": "github:tanstack/router#79ac49eedf774dd4b0cfa308722bc463cfe5885c" },
  });
  const result = await findingsFor({ "package.json": manifest, "tanstack_runner.js": "console.log('fixture text only')" });
  assert.equal(result.malicious, true);
  assert.deepEqual(result.rules, ["gitDependency:package.json", "installScriptRuntime:package.json"]);
});

test("git dependencies in every common spelling are flagged and registry ranges are not", async () => {
  const dependencies = { a: "git+https://github.com/example/a.git", b: "example/b#main", c: "^1.2.0", d: "https://github.com/example/d", e: "1.x || 2.x" };
  const result = await findingsFor({ "package.json": JSON.stringify({ name: "fixture", version: "9.9.9", dependencies }) });
  assert.deepEqual(result.rules, ["gitDependency:package.json", "gitDependency:package.json", "gitDependency:package.json"]);
});

test("install scripts that start deno or python are flagged", async () => {
  for (const command of ["deno run setup.ts", "python3 setup.py install"]) {
    const result = await findingsFor({ "package.json": JSON.stringify({ name: "fixture", version: "9.9.9", scripts: { install: command } }) });
    assert.deepEqual(result.rules, ["installScriptRuntime:package.json"], command);
  }
});

test("a loader file that chmods and starts a downloaded binary is flagged", async () => {
  const manifest = JSON.stringify({ name: "fixture", version: "9.9.9", scripts: { postinstall: "node loader.js" } });
  const loader = "const fs = require('fs'); fs.chmodSync('tool', 0o755); require('child_process').execFileSync('./tool');";
  const result = await findingsFor({ "package.json": manifest, "loader.js": loader });
  assert.deepEqual(result.rules, ["installScriptShell:loader.js"]);
  const bunLoader = await findingsFor({ "package.json": manifest, "loader.js": "fixture text: starts bun x payload" });
  assert.deepEqual(bunLoader.rules, ["installScriptRuntime:loader.js"]);
});

test("node run on a native binary flags the call and the payload", async () => {
  const manifest = JSON.stringify({ name: "fixture", version: "9.9.9", scripts: { postinstall: "node payload.bin" } });
  const elf = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
  const result = await findingsFor({ "package.json": manifest, "payload.bin": elf });
  assert.deepEqual(result.rules, ["installScriptCallsNonJs:payload.bin", "installScriptNodeNonJs:package.json", "payloadNonJavaScript:payload.bin"]);
});

test("payload files are recognised by magic bytes and shebang, plain JavaScript is not", async () => {
  const payloads = {
    "bin/macho": new Uint8Array([0xcf, 0xfa, 0xed, 0xfe, 0x07]),
    "bin/tool.exe": new Uint8Array([0x4d, 0x5a, 0x90, 0x00]),
    "lib/module.wasm": new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00]),
    "scripts/run": "#!/bin/sh\necho fixture\n",
    "scripts/setup.sh": "echo fixture\n",
    "cli.js": "#!/usr/bin/env node\nconsole.log('fixture')\n",
  };
  const result = await findingsFor({ "package.json": cleanManifest, ...payloads });
  assert.deepEqual(result.rules, [
    "payloadNonJavaScript:bin/macho",
    "payloadNonJavaScript:bin/tool.exe",
    "payloadNonJavaScript:lib/module.wasm",
    "payloadNonJavaScript:scripts/run",
    "payloadNonJavaScript:scripts/setup.sh",
  ]);
  assert.equal(result.malicious, false);
});

test("an ELF binary without install scripts is kept as a finding but is not malicious", async () => {
  const elf = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
  const result = await findingsFor({ "package.json": cleanManifest, "prebuilds/addon.node": elf });
  assert.deepEqual(result.rules, ["payloadNonJavaScript:prebuilds/addon.node"]);
  assert.equal(result.malicious, false);
});

test("a shell script called by an install hook is flagged as a non JavaScript call", async () => {
  const manifest = JSON.stringify({ name: "fixture", version: "9.9.9", scripts: { install: "./setup.sh" } });
  const result = await findingsFor({ "package.json": manifest, "setup.sh": "echo fixture\n" });
  assert.deepEqual(result.rules, ["installScriptCallsNonJs:setup.sh", "payloadNonJavaScript:setup.sh"]);
});

test("download rejects a tarball whose integrity does not match", async () => {
  const tarball = await packFixture({ "package.json": cleanManifest });
  const fakeFetch = async () => new Response(new Uint8Array(tarball));
  const { tarballUrl, integrity } = requestFor("1.4.0", tarball);
  assert.deepEqual(await downloadTarball(tarballUrl, integrity, fakeFetch), tarball);
  await assert.rejects(downloadTarball(tarballUrl, "sha512-AAAA", fakeFetch), /integrity mismatch/);
  await assert.rejects(
    downloadTarball(tarballUrl, integrity, async () => new Response("gone", { status: 404 })),
    /status 404/,
  );
});
