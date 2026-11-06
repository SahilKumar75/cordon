import assert from "node:assert/strict";
import { closeSync, ftruncateSync, openSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { maxLockfileBytes } from "../../packages/guard/src/lockfile.ts";
import { deadUrl, makeTempDir, runGuard } from "../support/services.ts";

const temps: string[] = [];

after(() => {
  for (const path of temps) rmSync(path, { recursive: true, force: true });
});

async function checkUnavailable(write: (file: string) => void, reason: RegExp): Promise<void> {
  const directory = makeTempDir();
  temps.push(directory);
  const file = join(directory, "package-lock.json");
  write(file);
  const run = await runGuard(["check", "--lockfile", file], { CHAIN_ID: "31337", RPC_URL: await deadUrl() });
  assert.equal(run.report.outcome, "unavailable");
  assert.equal(run.report.packagesChecked, 0);
  assert.match(run.report.advice.join("\n"), reason);
  assert.equal(run.code, 2);
}

test("a malformed lockfile gives outcome unavailable and exit code 2", async () => {
  await checkUnavailable((file) => writeFileSync(file, '{"lockfileVersion": 3, "packages": {'), /is not valid JSON/);
});

test("an oversized lockfile gives outcome unavailable and exit code 2", async () => {
  const oversized = (file: string) => {
    const handle = openSync(file, "w");
    ftruncateSync(handle, maxLockfileBytes + 1);
    closeSync(handle);
  };
  await checkUnavailable(oversized, /is larger than/);
});
