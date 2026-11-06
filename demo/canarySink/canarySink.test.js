import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const postinstall = join(here, "..", "poisonedPackage", "v1.4.1", "postinstall.js");
let sink;
let sinkUrl;

before(async () => {
  sink = spawn(process.execPath, [join(here, "server.js")], { env: { ...process.env, CANARY_SINK_PORT: "0" } });
  const line = await new Promise((resolve) => sink.stdout.once("data", (data) => resolve(String(data))));
  sinkUrl = `http://127.0.0.1:${line.trim().split(":").pop()}`;
});

after(() => sink.kill());

function runPostinstall(env) {
  const tempFolder = mkdtempSync(join(tmpdir(), "cordonSinkTest"));
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [postinstall], { env: { PATH: process.env.PATH, TMPDIR: tempFolder, ...env } });
    child.on("exit", (code) => resolve({ code, canaryFile: join(tempFolder, "cordonDemoCanary.txt") }));
  });
}

test("sink answers false for a token it never saw", async () => {
  const answer = await fetch(`${sinkUrl}/received?token=neverSent`).then((response) => response.json());
  assert.deepEqual(answer, { received: false, at: null });
});

test("sink rejects a body without a token", async () => {
  const response = await fetch(`${sinkUrl}/collect`, { method: "POST", body: "not json" });
  assert.equal(response.status, 400);
});

test("poisoned postinstall sends the canary to a local sink", async () => {
  const { code, canaryFile } = await runPostinstall({ CANARY_TOKEN: "canaryLocal", CANARY_SINK_URL: sinkUrl });
  assert.equal(code, 0);
  assert.equal(readFileSync(canaryFile, "utf8"), "canaryLocal");
  const answer = await fetch(`${sinkUrl}/received?token=canaryLocal`).then((response) => response.json());
  assert.equal(answer.received, true);
});

test("poisoned postinstall does nothing when the sink is not local", async () => {
  const { code, canaryFile } = await runPostinstall({ CANARY_TOKEN: "canaryRemote", CANARY_SINK_URL: "http://example.com" });
  assert.equal(code, 0);
  assert.equal(existsSync(canaryFile), false);
  const answer = await fetch(`${sinkUrl}/received?token=canaryRemote`).then((response) => response.json());
  assert.equal(answer.received, false);
});

test("poisoned postinstall does nothing without a canary token", async () => {
  const { code, canaryFile } = await runPostinstall({ CANARY_SINK_URL: sinkUrl });
  assert.equal(code, 0);
  assert.equal(existsSync(canaryFile), false);
});
