import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { verifyMessage } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { guardReportDigestOf, guardReportSchema, signedGuardReportSchema } from "@cordon/shared";
import {
  checkLockfile,
  installChecked,
  installedAdvice,
  npmGitSetting,
  placeholderFallbackMinAgeDays,
  sendReport, type Npm } from "./check.ts";
import {
  chainTransport,
  daysAgo,
  failingTransport,
  registryRoutes,
  sealedKey,
  sealedName,
  sealedVersion,
  settingsFor,
  sign,
  snapshotOf,
  stubFetch,
  tempDir,
  writeInstalled,
  writeLockfile,
  type FetchCall,
} from "./testFixtures.ts";

const sealedChain = chainTransport([{ key: sealedKey, status: 1 }]);
const registryUrl = "http://registry.test";

function recordingNpm(version = "10.9.0"): Npm & { calls: { command: string; args: string[]; cwd: string }[]; versionReads: number } {
  const npm = {
    calls: [] as { command: string; args: string[]; cwd: string }[],
    versionReads: 0,
    run: async (command: string, args: string[], cwd: string) => {
      npm.calls.push({ command, args, cwd });
      return 0;
    },
    version: async () => {
      npm.versionReads += 1;
      return version;
    },
  };
  return npm;
}

test("a Sealed transitive version blocks", async () => {
  const dir = tempDir();
  writeLockfile(dir, {
    "node_modules/widget": { version: "3.0.0" },
    [`node_modules/widget/node_modules/${sealedName}`]: { version: sealedVersion },
  });
  const report = await checkLockfile(settingsFor(dir, { transport: sealedChain }));
  guardReportSchema.parse(report);
  assert.equal(report.outcome, "blocked");
  assert.equal(report.listSource, "chain");
  assert.equal(report.snapshotAgeSeconds, null);
  assert.equal(report.fallback, null);
  assert.equal(report.packagesChecked, 2);
  assert.deepEqual(report.blocked.map(({ name, version, key }) => [name, version, key]), [[sealedName, sealedVersion, sealedKey]]);
});

test("an alias of a Sealed version blocks under its real name", async () => {
  const dir = tempDir();
  writeLockfile(dir, { "node_modules/colors": { name: sealedName, version: sealedVersion } });
  const report = await checkLockfile(settingsFor(dir, { transport: sealedChain }));
  assert.equal(report.outcome, "blocked");
  assert.equal(report.blocked[0]?.name, sealedName);
});

test("the neighbouring version of a Sealed package is allowed", async () => {
  const dir = tempDir();
  writeLockfile(dir, { [`node_modules/${sealedName}`]: { version: "1.4.0" } });
  const report = await checkLockfile(settingsFor(dir, { transport: sealedChain }));
  assert.equal(report.outcome, "allowed");
  assert.deepEqual(report.advice, []);
});

test("a report from a signed snapshot carries the snapshot age and no age advice", async () => {
  const signer = privateKeyToAccount(generatePrivateKey());
  const snapshotUrl = "http://watcher.test/snapshot";
  const dir = tempDir();
  writeLockfile(dir, { [`node_modules/${sealedName}`]: { version: sealedVersion } });
  const fetchFn = stubFetch({ [snapshotUrl]: await sign(signer, snapshotOf()) });
  const report = await checkLockfile(settingsFor(dir, { transport: failingTransport, snapshotUrl, snapshotSigner: signer.address, fetchFn }));
  guardReportSchema.parse(report);
  assert.equal(report.listSource, "snapshot");
  assert.equal(report.snapshotAgeSeconds, 60);
  assert.equal(report.outcome, "blocked");
  assert.deepEqual(report.advice, []);
});

test("check rejects a hidden lockfile on its own", async () => {
  const dir = tempDir();
  mkdirSync(join(dir, "node_modules"));
  const hidden = writeLockfile(join(dir, "node_modules"), { "node_modules/widget": { version: "3.0.0" } }, 3, ".package-lock.json");
  const report = await checkLockfile(settingsFor(hidden, { transport: sealedChain }));
  assert.equal(report.outcome, "unavailable");
  assert.match(report.advice[0] ?? "", /is not npm-shrinkwrap\.json or package-lock\.json/);
});

test("a version 1 or missing lockfile is unavailable", async () => {
  const legacy = tempDir();
  writeLockfile(legacy, {}, 1);
  for (const dir of [legacy, tempDir()]) {
    const report = await checkLockfile(settingsFor(dir, { transport: sealedChain }));
    assert.equal(report.outcome, "unavailable");
  }
});

test("an already installed Sealed version advises removing persistence, then rotating credentials", async () => {
  const dir = tempDir();
  writeLockfile(dir, { [`node_modules/${sealedName}`]: { version: sealedVersion } });
  writeInstalled(dir, `node_modules/${sealedName}`, { name: sealedName, version: sealedVersion });
  const report = await checkLockfile(settingsFor(dir, { transport: sealedChain }));
  assert.equal(report.blocked[0]?.alreadyInstalled, true);
  assert.deepEqual(report.advice, installedAdvice);
  assert.match(report.advice[0] ?? "", /persistence.*daemons.*IDE or coding agent hooks/);
  assert.match(report.advice[1] ?? "", /rotate every credential/);
  assert.match(report.advice[2] ?? "", /runtime stop does not undo/);
});

test("a Sealed version that is not installed carries no install advice", async () => {
  const dir = tempDir();
  writeLockfile(dir, { [`node_modules/${sealedName}`]: { version: sealedVersion } });
  const report = await checkLockfile(settingsFor(dir, { transport: sealedChain }));
  assert.equal(report.blocked[0]?.alreadyInstalled, false);
  assert.deepEqual(report.advice, []);
});

function fallbackLockfile(): string {
  const dir = tempDir();
  writeLockfile(dir, {
    "node_modules/fresh": { version: "1.0.0" },
    "node_modules/settled": { version: "2.0.0" },
    "node_modules/undated": { version: "0.1.0" },
  });
  return dir;
}

const fallbackFetch = stubFetch(
  registryRoutes(registryUrl, {
    fresh: { time: { "1.0.0": daysAgo(1) } },
    settled: { time: { "2.0.0": daysAgo(30) } },
    undated: { time: {} },
  }),
);

test("with no list, the age fallback blocks young and undated versions and allows old ones", async () => {
  const settings = settingsFor(fallbackLockfile(), { transport: failingTransport, fallbackMinAgeDays: 5, registryUrl, fetchFn: fallbackFetch });
  const report = await checkLockfile(settings);
  guardReportSchema.parse(report);
  assert.equal(report.listSource, "none");
  assert.deepEqual(report.fallback, { minAgeDays: 5, placeholder: false });
  assert.deepEqual(
    report.tooYoung.map(({ name, publishedAt }) => [name, publishedAt]).sort(),
    [["fresh", daysAgo(1)], ["undated", null]],
  );
  assert.equal(report.snapshotAgeSeconds, null);
  assert.equal(report.outcome, "blocked");
  assert.match(report.advice[0] ?? "", /Sealed list was not checked/);
  assert.ok(report.advice.some((line) => line.includes("Publish time could not be read for undated@0.1.0")));
  assert.ok(!settings.warnings.some((warning) => warning.includes("placeholder")));
});

test("with no list and only old versions, the age fallback allows", async () => {
  const dir = tempDir();
  writeLockfile(dir, { "node_modules/settled": { version: "2.0.0" } });
  const settings = settingsFor(dir, { transport: failingTransport, fallbackMinAgeDays: 5, registryUrl, fetchFn: fallbackFetch });
  const report = await checkLockfile(settings);
  assert.equal(report.outcome, "allowed");
  assert.deepEqual(report.tooYoung, []);
});

test("an unset N uses the placeholder, warns every time and marks the report", async () => {
  const settings = settingsFor(fallbackLockfile(), { transport: failingTransport, registryUrl, fetchFn: fallbackFetch });
  const first = await checkLockfile(settings);
  await checkLockfile(settings);
  assert.deepEqual(first.fallback, { minAgeDays: placeholderFallbackMinAgeDays, placeholder: true });
  assert.equal(settings.warnings.filter((warning) => warning.includes("placeholder of 3 days")).length, 2);
});

test("the minimum age applies even when the list loads", async () => {
  const dir = tempDir();
  writeLockfile(dir, { "node_modules/fresh": { version: "1.0.0" }, "node_modules/settled": { version: "2.0.0" } });
  const report = await checkLockfile(settingsFor(dir, { transport: sealedChain, minAgeDays: 7, registryUrl, fetchFn: fallbackFetch }));
  assert.equal(report.listSource, "chain");
  assert.equal(report.fallback, null);
  assert.deepEqual(report.tooYoung.map(({ name }) => name), ["fresh"]);
  assert.equal(report.outcome, "blocked");
});

test("install never runs npm ci when blocked or unavailable", async () => {
  const blocked = tempDir();
  writeLockfile(blocked, { [`node_modules/${sealedName}`]: { version: sealedVersion } });
  const legacy = tempDir();
  writeLockfile(legacy, {}, 1);
  const spawner = recordingNpm();
  assert.equal((await installChecked(settingsFor(blocked, { transport: sealedChain }), spawner)).exitCode, 1);
  assert.equal((await installChecked(settingsFor(legacy, { transport: sealedChain }), spawner)).exitCode, 2);
  assert.deepEqual(spawner.calls, []);
});

test("install runs npm ci with scripts disabled when allowed, against the lockfile npm ci will use", async () => {
  const dir = tempDir();
  const packageLock = writeLockfile(dir, { "node_modules/widget": { version: "3.0.0" } });
  writeLockfile(dir, { [`node_modules/${sealedName}`]: { version: sealedVersion } }, 3, "npm-shrinkwrap.json");
  const spawner = recordingNpm();
  const shadowed = await installChecked(settingsFor(packageLock, { transport: sealedChain }), spawner);
  assert.equal(shadowed.report.outcome, "blocked");
  assert.deepEqual(spawner.calls, []);
  const clean = tempDir();
  writeLockfile(clean, { "node_modules/widget": { version: "3.0.0" } });
  const allowed = await installChecked(settingsFor(clean, { transport: sealedChain }), spawner);
  assert.equal(allowed.exitCode, 0);
  assert.deepEqual(spawner.calls, [{ command: "npm", args: ["ci", "--ignore-scripts"], cwd: clean }]);
  assert.equal(spawner.versionReads, 1);
});

test("install passes the npm git setting only when the installed npm supports it, reading the version once", async () => {
  const clean = tempDir();
  writeLockfile(clean, { "node_modules/widget": { version: "3.0.0" } });
  const setting = { name: "exampleGitSetting", minimumVersion: "11.2.0" };
  const older = recordingNpm("11.1.9");
  await installChecked(settingsFor(clean, { transport: sealedChain }), older, setting);
  assert.deepEqual(older.calls[0]?.args, ["ci", "--ignore-scripts"]);
  const newer = recordingNpm("11.2.0");
  await installChecked(settingsFor(clean, { transport: sealedChain }), newer, setting);
  assert.deepEqual(newer.calls[0]?.args, ["ci", "--ignore-scripts", "--exampleGitSetting=none"]);
  assert.equal(newer.versionReads, 1);
});

test("install sets allow-git to none on npm 11.9.0 and later, and npm 10 gets no flag", async () => {
  assert.deepEqual(npmGitSetting, { name: "allow-git", minimumVersion: "11.9.0" });
  const clean = tempDir();
  writeLockfile(clean, { "node_modules/widget": { version: "3.0.0" } });
  const runs = await Promise.all(
    ["10.9.2", "11.8.0", "11.9.0", "12.0.0"].map(async (version) => {
      const npm = recordingNpm(version);
      await installChecked(settingsFor(clean, { transport: sealedChain }), npm);
      return [version, npm.calls[0]?.args.join(" ")];
    }),
  );
  assert.deepEqual(runs, [
    ["10.9.2", "ci --ignore-scripts"],
    ["11.8.0", "ci --ignore-scripts"],
    ["11.9.0", "ci --ignore-scripts --allow-git=none"],
    ["12.0.0", "ci --ignore-scripts --allow-git=none"],
  ]);
});

function gitLockfile(): string {
  const dir = tempDir();
  writeLockfile(dir, {
    "node_modules/widget": { version: "3.0.0" },
    "node_modules/widget/node_modules/fromGit": { version: "1.0.0", resolved: "git+ssh://git@github.com/org/fromGit.git#abc" },
  });
  return dir;
}

test("git dependencies are listed and block by default", async () => {
  const spawner = recordingNpm();
  const { report, exitCode } = await installChecked(settingsFor(gitLockfile(), { transport: sealedChain }), spawner);
  guardReportSchema.parse(report);
  assert.equal(report.outcome, "blocked");
  assert.equal(exitCode, 1);
  assert.deepEqual(report.gitDependencies.map(({ name, resolved }) => [name, resolved]), [["fromGit", "git+ssh://git@github.com/org/fromGit.git#abc"]]);
  assert.match(report.advice[0] ?? "", /block the outcome/);
  assert.deepEqual(spawner.calls, []);
});

test("GUARD_ALLOW_GIT_DEPENDENCIES turns the git block into a warning", async () => {
  const report = await checkLockfile(settingsFor(gitLockfile(), { transport: sealedChain, allowGitDependencies: true }));
  assert.equal(report.outcome, "allowed");
  assert.equal(report.gitDependencies.length, 1);
  assert.match(report.advice[0] ?? "", /allowed by GUARD_ALLOW_GIT_DEPENDENCIES/);
});

test("every check report carries empty gitDependencies and hookFiles when there are none", async () => {
  const dir = tempDir();
  writeLockfile(dir, { "node_modules/widget": { version: "3.0.0" } });
  const report = await checkLockfile(settingsFor(dir, { transport: sealedChain }));
  assert.deepEqual([report.gitDependencies, report.hookFiles], [[], []]);
  const unavailable = await checkLockfile(settingsFor(tempDir(), { transport: sealedChain }));
  assert.deepEqual([unavailable.gitDependencies, unavailable.hookFiles], [[], []]);
});

test("nothing is sent anywhere unless both report settings are set", async () => {
  const dir = tempDir();
  writeLockfile(dir, { [`node_modules/${sealedName}`]: { version: sealedVersion } });
  const calls: FetchCall[] = [];
  const settings = settingsFor(dir, { transport: sealedChain, reporterPrivateKey: generatePrivateKey(), fetchFn: stubFetch({}, calls) });
  const report = await checkLockfile(settings);
  assert.equal(await sendReport(report, settings), false);
  assert.equal(await sendReport(report, { ...settings, reporterPrivateKey: null, reportUrl: "http://watcher.test/reports" }), false);
  assert.deepEqual(calls, []);
});

test("a configured report is posted signed with guardReportDigestOf", async () => {
  const dir = tempDir();
  writeLockfile(dir, { [`node_modules/${sealedName}`]: { version: sealedVersion } });
  const privateKey = generatePrivateKey();
  const reportUrl = "http://watcher.test/reports";
  const calls: FetchCall[] = [];
  const settings = settingsFor(dir, { transport: sealedChain, reportUrl, reporterPrivateKey: privateKey, fetchFn: stubFetch({ [reportUrl]: { recorded: 1 } }, calls) });
  const report = await checkLockfile(settings);
  assert.equal(await sendReport(report, settings), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.init?.method, "POST");
  const signed = signedGuardReportSchema.parse(JSON.parse(String(calls[0]?.init?.body)));
  assert.equal(signed.signer, privateKeyToAccount(privateKey).address);
  const valid = await verifyMessage({ address: signed.signer as `0x${string}`, message: { raw: guardReportDigestOf(signed.report) }, signature: signed.signature as `0x${string}` });
  assert.equal(valid, true);
});
