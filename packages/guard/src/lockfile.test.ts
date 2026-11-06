import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readLockfile, resolveLockfilePath } from "./lockfile.ts";
import { tempDir, writeLockfile } from "./testFixtures.ts";

test("npm-shrinkwrap.json is chosen before package-lock.json", () => {
  const dir = tempDir();
  writeLockfile(dir, {});
  const shrinkwrap = writeLockfile(dir, {}, 3, "npm-shrinkwrap.json");
  assert.equal(resolveLockfilePath(dir), shrinkwrap);
});

test("versions 2 and 3 include transitive entries and key aliases by their real name", () => {
  for (const version of [2, 3]) {
    const dir = tempDir();
    const path = writeLockfile(
      dir,
      {
        "node_modules/left": { version: "2.0.0" },
        "node_modules/left/node_modules/@scope/deep": { version: "0.3.1" },
        "node_modules/colors": { name: "@bulkheaddemo/colorkit", version: "1.4.1" },
        "packages/local": { name: "local", version: "1.0.0" },
        "node_modules/local": { resolved: "packages/local", link: true },
      },
      version,
    );
    const read = readLockfile(path);
    assert.ok(read.ok);
    assert.deepEqual(
      read.entries.map(({ name, version: entryVersion }) => `${name}@${entryVersion}`),
      ["left@2.0.0", "@scope/deep@0.3.1", "@bulkheaddemo/colorkit@1.4.1"],
    );
  }
});

test("version 1, no version, missing and unreadable lockfiles are not ok", () => {
  const dir = tempDir();
  assert.equal(readLockfile(writeLockfile(dir, {}, 1)).ok, false);
  const unversioned = join(dir, "unversioned.json");
  writeFileSync(unversioned, JSON.stringify({ packages: {} }));
  assert.equal(readLockfile(unversioned).ok, false);
  assert.equal(readLockfile(join(dir, "missing.json")).ok, false);
  const broken = join(dir, "broken.json");
  writeFileSync(broken, "{ not json");
  assert.equal(readLockfile(broken).ok, false);
});

test("read errors other than a missing file or bad JSON surface", () => {
  const dir = tempDir();
  const directory = join(dir, "package-lock.json");
  mkdirSync(directory);
  assert.throws(() => readLockfile(directory), /cannot read .*package-lock\.json: EISDIR/);
});
