import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { verifyMessage } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { signedSnapshotSchema, snapshotDigestOf } from "@cordon/shared";
import { pollChain } from "./chainPoller.ts";
import { publishSnapshot } from "./publisher.ts";
import { blockTimeOf, demoKey, demoName, demoVersion, fakeChain, guardianLog, registryAddress, sealedLog, tempDatabasePath, verdictLog, type ChainLog } from "./testSupport.ts";
import { openDatabase, timelineOf } from "./timeline.ts";

const lifetimeSeconds = 30 * 86_400;
const settings = { chainId: 84532, registry: registryAddress, startBlock: 1n, voteLifetimeSeconds: lifetimeSeconds };
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
  assert.deepEqual(signed.snapshot.entries, [{ key: demoKey, name: demoName, version: demoVersion, status: "Sealed", sealedAt: timelineOf(db, demoKey)[1]?.at, votes: 1, suspectUntil: null }]);
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

async function flaggedDatabase(logs: ChainLog[]) {
  const path = tempDatabasePath();
  const db = openDatabase(path);
  db.prepare("INSERT INTO publishes (seq, seal_key, name, version, published_at, tarball_url, integrity) VALUES (1, ?, ?, ?, ?, ?, ?)").run(
    demoKey,
    demoName,
    demoVersion,
    "2026-10-26T00:00:00.000Z",
    "http://127.0.0.1:4873/colorkit-1.4.1.tgz",
    "sha512-x",
  );
  await pollChain(db, fakeChain(logs, () => 8).client, { registry: registryAddress, startBlock: 1n, maxBlockRange: 100n }, now);
  return { db, snapshotPath: join(dirname(path), "snapshot.json") };
}

test("a version with one live vote below quorum is listed as Suspect until the vote expires", async () => {
  const { db, snapshotPath } = await flaggedDatabase([verdictLog(2)]);
  const account = privateKeyToAccount(generatePrivateKey());
  const signed = await publishSnapshot(db, settings, account, snapshotPath);
  const votedAt = blockTimeOf(2) * 1000;
  assert.deepEqual(signed.snapshot.entries, [
    { key: demoKey, name: demoName, version: demoVersion, status: "Suspect", sealedAt: null, votes: 1, suspectUntil: new Date(votedAt + lifetimeSeconds * 1000).toISOString() },
  ]);
  const expired = await publishSnapshot(db, { ...settings, voteLifetimeSeconds: 60 }, account, snapshotPath);
  assert.deepEqual(expired.snapshot.entries, []);
});

test("a guardian clear lists the version as Cleared and a promote lists it as Sealed", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const cleared = await flaggedDatabase([verdictLog(2), guardianLog("Cleared", 4)]);
  assert.equal((await publishSnapshot(cleared.db, settings, account, cleared.snapshotPath)).snapshot.entries[0]?.status, "Cleared");
  const promoted = await flaggedDatabase([verdictLog(2), guardianLog("Promoted", 4)]);
  const entry = (await publishSnapshot(promoted.db, settings, account, promoted.snapshotPath)).snapshot.entries[0];
  assert.equal(entry?.status, "Sealed");
  assert.equal(entry?.sealedAt, timelineOf(promoted.db, demoKey).at(-1)?.at);
  assert.deepEqual(promoted.db.prepare("SELECT name, version FROM seals").all().map((row) => ({ ...row })), [{ name: demoName, version: demoVersion }]);
});
