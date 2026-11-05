import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { create } from "tar";
import { guardReportSchema } from "@bulkhead/shared";
import { audit, packageFromTarballUrl } from "./audit.ts";
import { installedAdvice } from "./check.ts";
import { chainTransport, failingTransport, sealedKey, sealedName, sealedVersion, settingsFor, tempDir, writeInstalled, writeLockfile } from "./testFixtures.ts";

const sealedChain = chainTransport([{ key: sealedKey, status: 1 }]);

function auditSettings(scope: { paths?: string[]; cacheDirs?: string[]; dockerImages?: string[] }, transport = sealedChain) {
  return { ...settingsFor("", { transport }), paths: scope.paths ?? [], cacheDirs: scope.cacheDirs ?? [], dockerImages: scope.dockerImages ?? [] };
}

test("tarball URLs from the npm cache map to name and version", () => {
  assert.deepEqual(packageFromTarballUrl("http://r.test/@bulkheaddemo/colorkit/-/colorkit-1.4.1.tgz"), { name: sealedName, version: "1.4.1" });
  assert.deepEqual(packageFromTarballUrl("http://r.test/@bulkheaddemo%2fcolorkit/-/colorkit-1.4.1.tgz"), { name: sealedName, version: "1.4.1" });
  assert.deepEqual(packageFromTarballUrl("http://r.test/left-pad/-/left-pad-1.3.0.tgz"), { name: "left-pad", version: "1.3.0" });
  assert.equal(packageFromTarballUrl("http://r.test/left-pad"), null);
});

test("audit finds Sealed versions in nested lockfiles and hidden lockfiles, all marked already installed", async () => {
  const root = tempDir();
  const service = join(root, "services", "orders");
  mkdirSync(service, { recursive: true });
  writeLockfile(service, { [`node_modules/${sealedName}`]: { version: sealedVersion } });
  const other = join(root, "worker");
  mkdirSync(join(other, "node_modules"), { recursive: true });
  writeLockfile(join(other, "node_modules"), { "node_modules/colors": { name: sealedName, version: sealedVersion } }, 3, ".package-lock.json");
  const report = await audit(auditSettings({ paths: [root] }));
  guardReportSchema.parse(report);
  assert.equal(report.outcome, "blocked");
  assert.equal(report.blocked.length, 2);
  assert.ok(report.blocked.every((block) => block.alreadyInstalled));
  assert.deepEqual(report.advice, installedAdvice);
});

test("audit reads the npm cache index", async () => {
  const cache = tempDir();
  const bucket = join(cache, "_cacache", "index-v5", "ab", "cd");
  mkdirSync(bucket, { recursive: true });
  const entry = (url: string) => `0123abcd\t${JSON.stringify({ key: `make-fetch-happen:request-cache:${url}`, integrity: "sha512-x" })}`;
  writeFileSync(join(bucket, "entry"), [entry("http://r.test/left-pad/-/left-pad-1.3.0.tgz"), entry(`http://r.test/${sealedName}/-/colorkit-${sealedVersion}.tgz`)].join("\n"));
  const report = await audit(auditSettings({ cacheDirs: [cache] }));
  assert.equal(report.packagesChecked, 2);
  assert.deepEqual(report.blocked.map(({ name, version, alreadyInstalled }) => [name, version, alreadyInstalled]), [[sealedName, sealedVersion, true]]);
});

test("audit reads node_modules package.json files inside saved Docker image layers", async () => {
  const work = tempDir();
  const layerRoot = join(work, "layerRoot");
  writeInstalled(layerRoot, `app/node_modules/${sealedName}`, { name: sealedName, version: sealedVersion });
  writeInstalled(layerRoot, "app/node_modules/left-pad", { name: "left-pad", version: "1.3.0" });
  const image = join(work, "image");
  mkdirSync(join(image, "blobs", "sha256"), { recursive: true });
  await create({ file: join(image, "blobs", "sha256", "layerone"), cwd: layerRoot, gzip: true }, ["app"]);
  writeFileSync(join(image, "blobs", "sha256", "config"), JSON.stringify({ architecture: "arm64" }));
  writeFileSync(join(image, "manifest.json"), JSON.stringify([{ Layers: ["blobs/sha256/layerone"] }]));
  const saved = join(work, "image.tar");
  await create({ file: saved, cwd: image }, ["manifest.json", "blobs"]);
  const report = await audit(auditSettings({ dockerImages: [saved] }));
  assert.equal(report.packagesChecked, 2);
  assert.equal(report.outcome, "blocked");
  assert.equal(report.blocked[0]?.alreadyInstalled, true);
  assert.match(report.blocked[0]?.lockfilePath ?? "", /node_modules\/@bulkheaddemo\/colorkit\/package\.json$/);
});

test("audit without a Sealed list is unavailable, and a clean audit is allowed", async () => {
  const root = tempDir();
  writeLockfile(root, { "node_modules/left-pad": { version: "1.3.0" } });
  assert.equal((await audit(auditSettings({ paths: [root] }, failingTransport))).outcome, "unavailable");
  assert.equal((await audit(auditSettings({ paths: [root] }))).outcome, "allowed");
});
