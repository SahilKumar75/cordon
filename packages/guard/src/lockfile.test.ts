import assert from "node:assert/strict";
import { mkdirSync, truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { maxLockfileBytes, nonRegistrySourcesOf, readLockfile, resolveLockfilePath } from "./lockfile.ts";
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
        "node_modules/colors": { name: "@cordondemo/colorkit", version: "1.4.1" },
        "packages/local": { name: "local", version: "1.0.0" },
        "node_modules/local": { resolved: "packages/local", link: true },
      },
      version,
    );
    const read = readLockfile(path);
    assert.ok(read.ok);
    assert.deepEqual(
      read.entries.map(({ name, version: entryVersion }) => `${name}@${entryVersion}`),
      ["left@2.0.0", "@scope/deep@0.3.1", "@cordondemo/colorkit@1.4.1"],
    );
  }
});

function lockfileContaining(text: string): string {
  const path = join(tempDir(), "package-lock.json");
  writeFileSync(path, text);
  return path;
}

test("version 1, version 4, no version, missing and malformed lockfiles are not ok", () => {
  assert.equal(readLockfile(writeLockfile(tempDir(), {}, 1)).ok, false);
  const future = readLockfile(writeLockfile(tempDir(), {}, 4));
  assert.equal(future.ok, false);
  assert.match(future.ok ? "" : future.reason, /lockfileVersion 4/);
  assert.equal(readLockfile(lockfileContaining(JSON.stringify({ packages: {} }))).ok, false);
  assert.equal(readLockfile(join(tempDir(), "package-lock.json")).ok, false);
  assert.equal(readLockfile(lockfileContaining("{ not json")).ok, false);
});

test("an unknown lockfile format is not ok", () => {
  const dir = tempDir();
  const yarn = join(dir, "yarn.lock");
  writeFileSync(yarn, JSON.stringify({ lockfileVersion: 3, packages: {} }));
  assert.equal(readLockfile(yarn).ok, false);
});

test("a lockfile larger than the size limit is not ok", () => {
  const path = writeLockfile(tempDir(), {});
  truncateSync(path, maxLockfileBytes + 1);
  const read = readLockfile(path);
  assert.equal(read.ok, false);
  assert.match(read.ok ? "" : read.reason, /larger than/);
});

function kindsOf(packages: Record<string, object>, registryUrl = "https://registry.npmjs.org") {
  const path = writeLockfile(tempDir(), packages);
  const read = readLockfile(path);
  assert.ok(read.ok);
  return nonRegistrySourcesOf(read.entries, path, registryUrl).map(({ name, kind }) => [name, kind]);
}

test("every source other than the registry is classified by kind, nested entries included", () => {
  assert.deepEqual(
    kindsOf({
      "node_modules/plain": { version: "1.0.0", resolved: "https://registry.npmjs.org/plain/-/plain-1.0.0.tgz" },
      "node_modules/unresolved": { version: "2.1.0" },
      "node_modules/viaGitPlus": { version: "1.0.0", resolved: "git+ssh://git@github.com/org/viaGitPlus.git" },
      "node_modules/viaGit": { version: "1.0.0", resolved: "git://github.com/org/viaGit.git" },
      "node_modules/viaGithub": { version: "1.0.0", resolved: "github:org/viaGithub" },
      "node_modules/viaShorthand": { version: "org/viaShorthand" },
      "node_modules/plain/node_modules/viaCommit": { version: "1.0.0", resolved: "git+https://github.com/fork/viaCommit.git#0123456789abcdef0123456789abcdef01234567" },
      "node_modules/viaShorthandRef": { version: "org/viaShorthandRef#main" },
      "node_modules/viaCodeload": { version: "1.0.0", resolved: "https://codeload.github.com/org/viaCodeload/tar.gz/abc" },
      "node_modules/viaTarball": { version: "1.0.0", resolved: "https://cdn.example.com/viaTarball-1.0.0.tgz" },
      "node_modules/plain/node_modules/viaFile": { version: "1.0.0", resolved: "file:vendor/viaFile-1.0.0.tgz" },
      "node_modules/linked": { resolved: "packages/linked", link: true },
    }),
    [
      ["viaGitPlus", "git"],
      ["viaGit", "git"],
      ["viaGithub", "github"],
      ["viaShorthand", "github"],
      ["viaCommit", "commit"],
      ["viaShorthandRef", "commit"],
      ["viaCodeload", "github"],
      ["viaTarball", "tarball"],
      ["viaFile", "file"],
    ],
  );
});

test("a registry entry on a custom NPM_REGISTRY_URL origin is allowed, and the public registry then is not", () => {
  const packages = {
    "node_modules/mirrored": { version: "1.0.0", resolved: "http://localhost:4873/mirrored/-/mirrored-1.0.0.tgz" },
    "node_modules/public": { version: "1.0.0", resolved: "https://registry.npmjs.org/public/-/public-1.0.0.tgz" },
  };
  assert.deepEqual(kindsOf(packages, "http://localhost:4873"), [["public", "tarball"]]);
  assert.deepEqual(kindsOf(packages), [["mirrored", "tarball"]]);
});

test("read errors other than a missing file or bad JSON surface", () => {
  const dir = tempDir();
  const directory = join(dir, "package-lock.json");
  mkdirSync(directory);
  assert.throws(() => readLockfile(directory), /cannot read .*package-lock\.json: EISDIR/);
});
