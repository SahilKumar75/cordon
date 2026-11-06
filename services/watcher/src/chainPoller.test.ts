import assert from "node:assert/strict";
import { test } from "node:test";
import { pollChain } from "./chainPoller.ts";
import { blockTimeOf, demoKey, detectorAddress, fakeChain, registryAddress, sealedLog, tempDatabasePath, verdictLog } from "./testSupport.ts";
import { openDatabase, setCursor, timelineOf } from "./timeline.ts";

const settings = { registry: registryAddress, startBlock: 1n, maxBlockRange: 4n };
const secondDetector = "0x00000000000000000000000000000000000000d2";

test("registry logs become timeline events with block time and tx hash", async () => {
  const db = openDatabase(tempDatabasePath());
  const logs = [verdictLog(3), verdictLog(9, 0, secondDetector), sealedLog(9, 1)];
  const { client } = fakeChain(logs, () => 10);
  assert.equal(await pollChain(db, client, settings), 3);
  const events = timelineOf(db, demoKey);
  assert.deepEqual(events.map((event) => [event.kind, event.actor]), [["verdict", detectorAddress], ["verdict", secondDetector], ["sealed", "registry"]]);
  assert.equal(events[0]?.at, new Date(blockTimeOf(3) * 1000).toISOString());
  assert.equal(events[2]?.ref, logs[2]?.txHash);
});

test("replaying the same logs leaves the timeline unchanged", async () => {
  const db = openDatabase(tempDatabasePath());
  const { client } = fakeChain([verdictLog(2), sealedLog(5)], () => 6);
  await pollChain(db, client, settings);
  const before = timelineOf(db, demoKey);
  setCursor(db, "chainBlock", "0");
  assert.equal(await pollChain(db, client, settings), 2);
  assert.deepEqual(timelineOf(db, demoKey), before);
});

test("the block cursor resumes after a restart and skips processed blocks", async () => {
  const path = tempDatabasePath();
  const logs = [verdictLog(2)];
  let latest = 3;
  const first = fakeChain(logs, () => latest);
  await pollChain(openDatabase(path), first.client, settings);
  logs.push(sealedLog(5));
  latest = 6;
  const restarted = openDatabase(path);
  const second = fakeChain(logs, () => latest);
  assert.equal(await pollChain(restarted, second.client, settings), 1);
  assert.deepEqual(timelineOf(restarted, demoKey).map((event) => event.kind), ["verdict", "sealed"]);
  assert.equal(restarted.prepare("SELECT value FROM cursors WHERE name = 'chainBlock'").get()?.value, "6");
});

test("a chain verdict fills the tx hash of the matching attestation", async () => {
  const db = openDatabase(tempDatabasePath());
  db.prepare("INSERT INTO verdicts VALUES (?, 'staticScripts', ?, ?, 1, 1, NULL, '2026-11-06T10:00:00.000Z')").run(demoKey, detectorAddress, `0x${"ab".repeat(32)}`);
  const logs = [verdictLog(2)];
  await pollChain(db, fakeChain(logs, () => 2).client, settings);
  assert.equal(db.prepare("SELECT tx_hash FROM verdicts").get()?.tx_hash, logs[0]?.txHash);
});
