import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { keccak256, toHex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex32 } from "@cordon/shared";
import { loadSealedList } from "./sealedList.ts";
import { chainTransport, failingTransport, now, sealedKey, sealedName, sealedVersion, settingsFor, sign, snapshotOf, stubFetch, tempDir } from "./testFixtures.ts";

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
  assert.equal(calls.filter((method) => method === "eth_call").length, 5);
});

test("chain lists a flagged key as Suspect only while it has live votes and status None", async () => {
  const flagged = [
    { key: sealedKey, status: 0, votes: 1 },
    { key: keccak256(toHex("expired")) as Hex32, status: 0, votes: 0 },
    { key: keccak256(toHex("cleared")) as Hex32, status: 3, votes: 1 },
    { key: keccak256(toHex("sealed")) as Hex32, status: 1, votes: 2 },
  ];
  const list = await loadSealedList(settingsFor("", { transport: chainTransport([], { flagged }) }));
  assert.deepEqual([...list.suspects.entries()], [[sealedKey, { votes: 1, suspectUntil: null }]]);
});

test("a signed snapshot carries Suspect entries with their expiry", async () => {
  const suspectUntil = new Date(now.getTime() + 3600_000).toISOString();
  const signed = await sign(signer, snapshotOf({ entries: [{ name: sealedName, version: sealedVersion, key: sealedKey, status: "Suspect", sealedAt: null, votes: 1, suspectUntil }] }));
  const list = await loadSealedList(snapshotSettings(signed));
  assert.equal(list.keys.size, 0);
  assert.deepEqual(list.suspects.get(sealedKey), { votes: 1, suspectUntil });
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
    await sign(signer, snapshotOf({ generatedAt: new Date(now.getTime() + 61_000).toISOString() })),
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

test("a snapshot dated within the clock skew allowance is accepted", async () => {
  const signed = await sign(signer, snapshotOf({ generatedAt: new Date(now.getTime() + 30_000).toISOString() }));
  const list = await loadSealedList(snapshotSettings(signed));
  assert.equal(list.source, "snapshot");
  assert.equal(list.snapshotAgeSeconds, 0);
});

function monotonicSettings(transport: ReturnType<typeof chainTransport>, cacheDir: string, served: unknown = null) {
  return settingsFor("", {
    transport,
    cacheDir,
    snapshotUrl,
    snapshotSigner: signer.address,
    fetchFn: stubFetch(served === null ? {} : { [snapshotUrl]: served }),
  });
}

test("an RPC that returns an empty list after a seal is rejected and the cached signed snapshot keeps the version blocked", async () => {
  const cacheDir = tempDir();
  const signed = await sign(signer, snapshotOf());
  const first = await loadSealedList(monotonicSettings(chainTransport([{ key: sealedKey, status: 1 }]), cacheDir, signed));
  assert.equal(first.source, "chain");
  await loadSealedList(snapshotSettings(signed, cacheDir));
  const settings = monotonicSettings(chainTransport([]), cacheDir);
  const list = await loadSealedList(settings);
  assert.equal(list.source, "snapshot");
  assert.ok(list.keys.has(sealedKey));
  assert.ok(settings.warnings.some((warning) => warning.includes("chain list rejected") && warning.includes(sealedKey)));
  assert.ok(settings.warnings.some((warning) => warning.includes("snapshot fetch failed")));
});

test("with no snapshot at all a previously sealed version stays blocked when the RPC drops it", async () => {
  const cacheDir = tempDir();
  await loadSealedList(monotonicSettings(chainTransport([{ key: sealedKey, status: 1 }]), cacheDir));
  const settings = monotonicSettings(chainTransport([]), cacheDir);
  const list = await loadSealedList(settings);
  assert.equal(list.source, "none");
  assert.ok(list.keys.has(sealedKey));
  assert.ok(settings.warnings.some((warning) => warning.includes("stay blocked")));
});

test("a key the chain marks Unsealed with a matching Unsealed event is released", async () => {
  const cacheDir = tempDir();
  await loadSealedList(monotonicSettings(chainTransport([{ key: sealedKey, status: 1 }]), cacheDir));
  const calls: string[] = [];
  const settings = monotonicSettings(chainTransport([{ key: sealedKey, status: 2 }], { unsealEvents: [sealedKey], calls }), cacheDir);
  const list = await loadSealedList(settings);
  assert.equal(list.source, "chain");
  assert.equal(list.keys.has(sealedKey), false);
  assert.ok(calls.includes("eth_getLogs"));
  assert.deepEqual(settings.warnings, []);
  const later = await loadSealedList(monotonicSettings(chainTransport([{ key: sealedKey, status: 2 }]), cacheDir));
  assert.equal(later.source, "chain");
});

test("a key the chain marks Unsealed without an Unsealed event is kept blocked", async () => {
  const cacheDir = tempDir();
  await loadSealedList(monotonicSettings(chainTransport([{ key: sealedKey, status: 1 }]), cacheDir));
  const settings = monotonicSettings(chainTransport([{ key: sealedKey, status: 2 }]), cacheDir);
  const list = await loadSealedList(settings);
  assert.notEqual(list.source, "chain");
  assert.ok(list.keys.has(sealedKey));
});

test("a signed snapshot that omits a previously sealed version does not release it", async () => {
  const cacheDir = tempDir();
  await loadSealedList(monotonicSettings(chainTransport([{ key: sealedKey, status: 1 }]), cacheDir));
  const settings = snapshotSettings(await sign(signer, snapshotOf({ entries: [] })), cacheDir);
  const list = await loadSealedList(settings);
  assert.equal(list.source, "snapshot");
  assert.ok(list.keys.has(sealedKey));
});

test("seals remembered for another registry are not applied", async () => {
  const cacheDir = tempDir();
  await loadSealedList(monotonicSettings(chainTransport([{ key: sealedKey, status: 1 }]), cacheDir));
  const settings = settingsFor("", { transport: chainTransport([]), cacheDir, registryAddress: "0x00000000000000000000000000000000000000cc" });
  const list = await loadSealedList(settings);
  assert.equal(list.source, "chain");
  assert.equal(list.keys.size, 0);
});
