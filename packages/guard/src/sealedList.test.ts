import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { keccak256, toHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex32 } from "@bulkhead/shared";
import { loadSealedList } from "./sealedList.ts";
import { chainTransport, failingTransport, now, sealedKey, settingsFor, sign, snapshotOf, stubFetch, tempDir } from "./testFixtures.ts";

const signer = privateKeyToAccount(generatePrivateKey());
const forger = privateKeyToAccount(generatePrivateKey());
const snapshotUrl = "http://watcher.test/snapshot";

function snapshotSettings(served: unknown, cacheDir: string | null = null) {
  return settingsFor("", {
    transport: failingTransport,
    snapshotUrl,
    snapshotSigner: signer.address,
    cacheDir,
    fetchFn: stubFetch(served === null ? {} : { [snapshotUrl]: served }),
  });
}

test("chain pages through every sealed key and keeps only status Sealed", async () => {
  const seals = Array.from({ length: 1201 }, (_, index) => ({ key: keccak256(toHex(index)) as Hex32, status: index === 7 ? 2 : 1 }));
  const calls: string[] = [];
  const list = await loadSealedList(settingsFor("", { transport: chainTransport(seals, { calls }) }));
  assert.equal(list.source, "chain");
  assert.equal(list.keys.size, 1200);
  assert.equal(list.keys.has(seals[7]!.key), false);
  assert.equal(calls.filter((method) => method === "eth_call").length, 4);
});

test("an RPC on the wrong chain is not trusted", async () => {
  const transport = chainTransport([{ key: sealedKey, status: 1 }], { remoteChainId: 1 });
  const list = await loadSealedList(settingsFor("", { transport }));
  assert.equal(list.source, "none");
});

test("a valid signed snapshot is used when the chain is down and replaces the cache", async () => {
  const cacheDir = tempDir();
  const signed = await sign(signer, snapshotOf());
  const list = await loadSealedList(snapshotSettings(signed, cacheDir));
  assert.equal(list.source, "snapshot");
  assert.equal(list.snapshotAgeSeconds, 60);
  assert.ok(list.keys.has(sealedKey));
  assert.deepEqual(JSON.parse(readFileSync(join(cacheDir, "sealedSnapshot.json"), "utf8")), signed);
});

test("the cached snapshot is used when the snapshot URL fails", async () => {
  const cacheDir = tempDir();
  await loadSealedList(snapshotSettings(await sign(signer, snapshotOf()), cacheDir));
  const list = await loadSealedList(snapshotSettings(null, cacheDir));
  assert.equal(list.source, "snapshot");
  assert.ok(list.keys.has(sealedKey));
});

test("forged, stale, wrong chain and wrong registry snapshots are rejected and never cached", async () => {
  const forged = await sign(forger, snapshotOf());
  const cases = [
    { ...forged, signer: signer.address },
    forged,
    await sign(signer, snapshotOf({ generatedAt: new Date(now.getTime() - 601_000).toISOString() })),
    await sign(signer, snapshotOf({ chainId: 1 })),
    await sign(signer, snapshotOf({ registry: "0x00000000000000000000000000000000000000bb" })),
    { ...(await sign(signer, snapshotOf())), snapshot: snapshotOf({ entries: [] }) },
  ];
  for (const served of cases) {
    const cacheDir = tempDir();
    const settings = snapshotSettings(served, cacheDir);
    const list = await loadSealedList(settings);
    assert.equal(list.source, "none");
    assert.equal(existsSync(join(cacheDir, "sealedSnapshot.json")), false);
    assert.ok(settings.warnings.some((warning) => warning.includes("snapshot rejected")));
  }
});
