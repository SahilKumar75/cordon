import assert from "node:assert/strict";
import { test } from "node:test";
import { sealKeyOf } from "@cordon/shared";
import { checkLockfile } from "./check.ts";
import { packumentReader } from "./registry.ts";
import { overridesOf, proposeRollbacks } from "./rollback.ts";
import { chainTransport, daysAgo, now, registryRoutes, sealedKey, sealedName, sealedVersion, settingsFor, stubFetch, tempDir, writeLockfile } from "./testFixtures.ts";

const registryUrl = "http://registry.test";
const colorkitTimes = {
  "1.3.9": daysAgo(90),
  "1.4.0": daysAgo(40),
  "1.4.1": daysAgo(1),
  "1.5.0": daysAgo(1),
  "1.4.1-beta.1": daysAgo(2),
};
const registryWarnings: string[] = [];
const readPackument = packumentReader(registryUrl, stubFetch(registryRoutes(registryUrl, { [sealedName]: { time: colorkitTimes } })), (message) =>
  registryWarnings.push(message), 5_000,
);

test("rollback proposes the highest earlier release that is neither Sealed nor too young", async () => {
  const sealedKeys = new Set([sealedKey, sealKeyOf(sealedName, "1.4.0")]);
  const target = { name: sealedName, version: sealedVersion };
  const [proposal] = await proposeRollbacks([target], { sealedKeys, minAgeDays: 0, now }, readPackument);
  assert.deepEqual(proposal, { name: sealedName, from: sealedVersion, to: "1.3.9" });
  const [unsealed] = await proposeRollbacks([target], { sealedKeys: new Set([sealedKey]), minAgeDays: 0, now }, readPackument);
  assert.equal(unsealed?.to, "1.4.0");
  const [aged] = await proposeRollbacks([target], { sealedKeys: new Set([sealedKey]), minAgeDays: 60, now }, readPackument);
  assert.equal(aged?.to, "1.3.9");
});

test("rollback proposes nothing when metadata is unreadable", async () => {
  const [proposal] = await proposeRollbacks([{ name: "unknown", version: "1.0.0" }], { sealedKeys: new Set(), minAgeDays: 0, now }, readPackument);
  assert.equal(proposal?.to, null);
  await proposeRollbacks([{ name: "missing", version: "1.0.0" }], { sealedKeys: new Set(), minAgeDays: 0, now }, readPackument);
  assert.equal(registryWarnings.length, 1);
  assert.match(registryWarnings[0] ?? "", /registry\.test\/unknown answered 404/);
});

test("check reports the rollback and the overrides snippet covers only proposals", async () => {
  const dir = tempDir();
  writeLockfile(dir, { [`node_modules/${sealedName}`]: { version: sealedVersion } });
  const fetchFn = stubFetch(registryRoutes(registryUrl, { [sealedName]: { time: colorkitTimes } }));
  const report = await checkLockfile(settingsFor(dir, { transport: chainTransport([{ key: sealedKey, status: 1 }]), registryUrl, fetchFn }));
  assert.deepEqual(report.rollback, [{ name: sealedName, from: sealedVersion, to: "1.4.0" }]);
  assert.deepEqual(overridesOf([...report.rollback, { name: "other", from: "1.0.0", to: null }]), { overrides: { [sealedName]: "1.4.0" } });
});
