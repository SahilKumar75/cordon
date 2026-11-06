import assert from "node:assert/strict";
import { test } from "node:test";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { verifyMessage } from "viem";
import { productName, zeroHash } from "./constants.ts";
import { evidenceHashOf, sealKeyOf, snapshotDigestOf, timelineEventHashOf } from "./hashing.ts";
import type { Evidence, SealedSnapshot, TimelineEvent } from "./types.ts";

const evidence: Evidence = {
  name: "@cordondemo/colorkit",
  version: "1.4.1",
  detector: "staticScripts",
  integrity: "sha512 placeholder for test",
  malicious: true,
  simulated: true,
  findings: [{ rule: "installScriptNetwork", detail: "postinstall calls fetch", file: "package.json" }],
  advisoryUrl: null,
  observedAt: "2026-11-06T10:00:00.000Z",
};

test("seal key is per version and stable", () => {
  assert.equal(sealKeyOf("@cordondemo/colorkit", "1.4.1"), sealKeyOf("@cordondemo/colorkit", "1.4.1"));
  assert.notEqual(sealKeyOf("@cordondemo/colorkit", "1.4.1"), sealKeyOf("@cordondemo/colorkit", "1.4.0"));
  assert.notEqual(sealKeyOf("@cordondemo/colorkit", "1.4.1"), sealKeyOf("@cordondemo/colorkits", "1.4.1"));
});

test("seal key does not collide when name and version boundaries shift", () => {
  assert.notEqual(sealKeyOf("ab", "c"), sealKeyOf("a", "bc"));
});

test("evidence hash ignores key order and tracks content", () => {
  const reordered = Object.fromEntries(Object.entries(evidence).reverse()) as Evidence;
  assert.equal(evidenceHashOf(reordered), evidenceHashOf(evidence));
  assert.notEqual(evidenceHashOf({ ...evidence, malicious: false }), evidenceHashOf(evidence));
});

test("timeline event hash excludes its own hash and covers the previous hash", () => {
  const event: TimelineEvent = {
    key: sealKeyOf("@cordondemo/colorkit", "1.4.1"),
    kind: "sealed",
    at: "2026-11-06T10:00:05.000Z",
    actor: "registry",
    ref: null,
    prevHash: zeroHash,
    hash: zeroHash,
  };
  const hash = timelineEventHashOf(event);
  assert.equal(timelineEventHashOf({ ...event, hash }), hash);
  assert.notEqual(timelineEventHashOf({ ...event, prevHash: hash }), hash);
});

test("a signed snapshot verifies only for its signer and content", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const snapshot: SealedSnapshot = {
    product: productName,
    chainId: 84532,
    registry: "0x0000000000000000000000000000000000000001",
    blockNumber: 10,
    generatedAt: "2026-11-06T10:00:06.000Z",
    entries: [],
    timelineHeads: [],
  };
  const digest = snapshotDigestOf(snapshot);
  const signature = await account.signMessage({ message: { raw: digest } });
  assert.equal(await verifyMessage({ address: account.address, message: { raw: digest }, signature }), true);
  const tampered = snapshotDigestOf({ ...snapshot, blockNumber: 11 });
  assert.equal(await verifyMessage({ address: account.address, message: { raw: tampered }, signature }), false);
});
