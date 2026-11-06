import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { productName, snapshotDigestOf, type SealedSnapshot } from "@cordon/shared";
import { loadSavedSnapshot, type SnapshotSettings } from "./publisher.ts";
import { pollRegistry } from "./registryPoller.ts";
import { runScheduler } from "./scheduler.ts";
import { registryAddress, tempDatabasePath } from "./testSupport.ts";
import { openDatabase } from "./timeline.ts";

const silent = createServer(() => {});
await new Promise<void>((resolve) => silent.listen(0, "127.0.0.1", resolve));
const silentUrl = `http://127.0.0.1:${(silent.address() as { port: number }).port}`;
after(() => {
  silent.closeAllConnections();
  silent.close();
});

async function elapsedMs(work: () => Promise<unknown>): Promise<number> {
  const started = performance.now();
  await work();
  return performance.now() - started;
}

test("the registry poller gives up on a registry that never answers", async () => {
  const db = openDatabase(tempDatabasePath());
  const took = await elapsedMs(() => assert.rejects(pollRegistry(db, silentUrl, fetch, 200), /timeout|aborted/i));
  assert.ok(took < 2_000, `took ${took}ms`);
});

test("a scan request to detectors that never answer fails instead of hanging the tick", async () => {
  const db = openDatabase(tempDatabasePath());
  db.prepare("INSERT INTO publishes (seq, seal_key, name, version, published_at, tarball_url, integrity) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    1,
    `0x${"11".repeat(32)}`,
    "@cordondemo/colorkit",
    "1.4.1",
    "2026-11-06T10:00:00.000Z",
    "http://127.0.0.1/colorkit.tgz",
    "sha512-AAAA",
  );
  const took = await elapsedMs(() => assert.rejects(runScheduler(db, silentUrl, fetch, () => {}, 200), /timeout|aborted/i));
  assert.ok(took < 2_000, `took ${took}ms`);
});

const signer = privateKeyToAccount(generatePrivateKey());
const settings: SnapshotSettings = { chainId: 31337, registry: registryAddress, startBlock: 0n, voteLifetimeSeconds: 86_400 };

async function savedSnapshot(overrides: Partial<SealedSnapshot> = {}, account = signer): Promise<string> {
  const snapshot: SealedSnapshot = {
    product: productName,
    chainId: settings.chainId,
    registry: settings.registry,
    blockNumber: 7,
    generatedAt: "2026-11-06T10:00:00.000Z",
    entries: [],
    timelineHeads: [],
    ...overrides,
  };
  const signed = { snapshot, signer: account.address, signature: await account.signMessage({ message: { raw: snapshotDigestOf(snapshot) } }) };
  const path = join(dirname(tempDatabasePath()), "snapshot.json");
  writeFileSync(path, JSON.stringify(signed));
  return path;
}

test("the saved snapshot is served again after a restart when it is ours", async () => {
  const loaded = await loadSavedSnapshot(await savedSnapshot(), settings, signer.address);
  assert.equal(loaded?.snapshot.blockNumber, 7);
});

test("a saved snapshot from another signer, chain or registry is not served after a restart", async () => {
  const stranger = privateKeyToAccount(generatePrivateKey());
  assert.equal(await loadSavedSnapshot(await savedSnapshot({}, stranger), settings, signer.address), null);
  assert.equal(await loadSavedSnapshot(await savedSnapshot({ chainId: 1 }), settings, signer.address), null);
  assert.equal(await loadSavedSnapshot(await savedSnapshot({ registry: "0x00000000000000000000000000000000000000bb" }), settings, signer.address), null);
  assert.equal(await loadSavedSnapshot(join(dirname(tempDatabasePath()), "missing.json"), settings, signer.address), null);
});
