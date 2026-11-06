import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { verifyMessage } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { signedSnapshotSchema, snapshotDigestOf } from "@cordon/shared";
import { pollChain } from "./chainPoller.ts";
import { publishSnapshot } from "./publisher.ts";
import { demoKey, demoName, demoVersion, fakeChain, guardianLog, registryAddress, sealedLog, tempDatabasePath, verdictLog } from "./testSupport.ts";
import { openDatabase, timelineOf } from "./timeline.ts";

const settings = { chainId: 84532, registry: registryAddress, startBlock: 1n };
const now = new Date("2026-11-06T10:05:00.000Z");

async function sealedDatabase(extraLogs = [] as ReturnType<typeof sealedLog>[]) {
  const path = tempDatabasePath();
  const db = openDatabase(path);
  await pollChain(db, fakeChain([verdictLog(2), sealedLog(3), ...extraLogs], () => 8).client, { registry: registryAddress, startBlock: 1n, maxBlockRange: 100n }, now);
  return { db, snapshotPath: join(dirname(path), "snapshot.json") };
}

test("the snapshot is signed, written to disk and carries chain, registry, entries and heads", async () => {
  const { db, snapshotPath } = await sealedDatabase();
  const account = privateKeyToAccount(generatePrivateKey());
  const signed = await publishSnapshot(db, settings, account, snapshotPath);
  assert.deepEqual(signedSnapshotSchema.parse(JSON.parse(await readFile(snapshotPath, "utf8"))), signed);
  assert.equal(signed.signer, account.address);
  assert.equal(await verifyMessage({ address: account.address, message: { raw: snapshotDigestOf(signed.snapshot) }, signature: signed.signature as `0x${string}` }), true);
  assert.equal(signed.snapshot.chainId, 84532);
  assert.equal(signed.snapshot.registry, registryAddress);
  assert.equal(signed.snapshot.blockNumber, 8);
  assert.equal(signed.snapshot.generatedAt, now.toISOString());
  assert.deepEqual(signed.snapshot.timelineHeads, [{ key: demoKey, hash: timelineOf(db, demoKey).at(-1)?.hash }]);
  assert.deepEqual(signed.snapshot.entries, [{ key: demoKey, name: demoName, version: demoVersion, status: "Sealed", sealedAt: timelineOf(db, demoKey)[1]?.at }]);
});

test("rewriting history changes the heads so the old signature no longer verifies", async () => {
  const { db, snapshotPath } = await sealedDatabase();
  const account = privateKeyToAccount(generatePrivateKey());
  const signed = await publishSnapshot(db, settings, account, snapshotPath);
  db.prepare("DELETE FROM timeline_events WHERE position = 1").run();
  const rewritten = { ...signed.snapshot, timelineHeads: [{ key: demoKey, hash: timelineOf(db, demoKey)[0]?.hash ?? demoKey }] };
  assert.equal(await verifyMessage({ address: account.address, message: { raw: snapshotDigestOf(rewritten) }, signature: signed.signature as `0x${string}` }), false);
});

test("an unsealed version is listed as Unsealed and a reseal restores Sealed", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const unsealed = await sealedDatabase([guardianLog("Unsealed", 5)]);
  const afterUnseal = await publishSnapshot(unsealed.db, settings, account, unsealed.snapshotPath);
  assert.equal(afterUnseal.snapshot.entries[0]?.status, "Unsealed");
  const resealed = await sealedDatabase([guardianLog("Unsealed", 5), guardianLog("Resealed", 7)]);
  const afterReseal = await publishSnapshot(resealed.db, settings, account, resealed.snapshotPath);
  assert.equal(afterReseal.snapshot.entries[0]?.status, "Sealed");
  assert.equal(afterReseal.snapshot.entries[0]?.sealedAt, timelineOf(resealed.db, demoKey).at(-1)?.at);
});

test("a failed chain poll does not make the snapshot look fresh", async () => {
  const { db, snapshotPath } = await sealedDatabase();
  const account = privateKeyToAccount(generatePrivateKey());
  const down = fakeChain([], () => {
    throw new Error("rpc down");
  });
  await assert.rejects(pollChain(db, down.client, { registry: registryAddress, startBlock: 1n, maxBlockRange: 100n }, new Date("2026-11-06T11:00:00.000Z")));
  const signed = await publishSnapshot(db, settings, account, snapshotPath);
  assert.equal(signed.snapshot.generatedAt, now.toISOString());
});

test("no snapshot is signed before the first successful chain poll", async () => {
  const path = tempDatabasePath();
  const account = privateKeyToAccount(generatePrivateKey());
  await assert.rejects(publishSnapshot(openDatabase(path), settings, account, join(dirname(path), "snapshot.json")), /no successful chain poll/);
});
