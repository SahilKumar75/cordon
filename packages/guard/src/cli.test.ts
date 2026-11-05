import assert from "node:assert/strict";
import { test } from "node:test";
import { run } from "./cli.ts";
import { tempDir, writeLockfile } from "./testFixtures.ts";

const quietEnv = { GUARD_FALLBACK_MIN_AGE_DAYS: "3" };

test("exit codes are 0 for allowed, 1 for blocked and 2 for unavailable", async (context) => {
  const output = context.mock.method(process.stdout, "write", () => true);
  const empty = tempDir();
  writeLockfile(empty, {});
  const undated = tempDir();
  writeLockfile(undated, { "node_modules/widget": { version: "1.0.0" } });
  const legacy = tempDir();
  writeLockfile(legacy, {}, 1);
  assert.equal(await run(["check", "--lockfile", empty], quietEnv), 0);
  assert.equal(await run(["check", "--lockfile", undated], quietEnv), 1);
  assert.equal(await run(["check", "--lockfile", legacy], quietEnv), 2);
  assert.equal(JSON.parse(String(output.mock.calls[2]?.arguments[0])).outcome, "unavailable");
});

test("install through the CLI spawns npm ci only when allowed", async (context) => {
  context.mock.method(process.stdout, "write", () => true);
  const calls: string[][] = [];
  const spawner = async (command: string, args: string[]) => {
    calls.push([command, ...args]);
    return 0;
  };
  const undated = tempDir();
  writeLockfile(undated, { "node_modules/widget": { version: "1.0.0" } });
  assert.equal(await run(["install", "--lockfile", undated], quietEnv, spawner), 1);
  const empty = tempDir();
  writeLockfile(empty, {});
  assert.equal(await run(["install", "--lockfile", empty], quietEnv, spawner), 0);
  assert.deepEqual(calls, [["npm", "ci", "--ignore-scripts"]]);
});

test("invalid configuration and unknown commands are rejected", async () => {
  await assert.rejects(run(["check"], { GUARD_FALLBACK_MIN_AGE_DAYS: "zero" }), /GUARD_FALLBACK_MIN_AGE_DAYS/);
  await assert.rejects(run(["launch"], quietEnv), /usage/);
  await assert.rejects(run(["sidecar", "--lockfile", "x", "--service", "s", "--port", "0"], quietEnv), /POLL_INTERVAL_SECONDS/);
});
