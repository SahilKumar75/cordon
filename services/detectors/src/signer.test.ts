import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { generatePrivateKey } from "viem/accounts";
import { sealKeyOf, type Evidence } from "@cordon/shared";
import { createSigner } from "./signer.ts";
import { mockRegistryTransport, newRegistryState, testChain } from "./testSupport.ts";

const evidence: Evidence = {
  name: "@cordondemo/colorkit",
  version: "1.4.1",
  detector: "staticScripts",
  integrity: "sha512-fixture",
  malicious: true,
  simulated: true,
  findings: [{ rule: "installScriptNetwork", detail: "postinstall calls fetch", file: "postinstall.js" }],
  advisoryUrl: null,
  observedAt: "2026-11-06T10:00:00.000Z",
};

const key = sealKeyOf(evidence.name, evidence.version);

async function setup() {
  const state = newRegistryState();
  const pendingDir = join(await mkdtemp(join(tmpdir(), "detectorsSigner")), "pending");
  const keys = { staticScripts: generatePrivateKey(), sandboxCanary: generatePrivateKey(), advisoryFeed: generatePrivateKey() };
  const signer = createSigner({ chain: testChain, transport: mockRegistryTransport(state), registry: "0x00000000000000000000000000000000000000aa", keys, pendingDir });
  return { state, pendingDir, signer };
}

test("each detector votes from its own key and the pending file is cleared", async () => {
  const { state, pendingDir, signer } = await setup();
  const first = await signer.submit(evidence);
  const second = await signer.submit({ ...evidence, detector: "sandboxCanary" });
  assert.equal(state.sent.length, 2);
  assert.equal(first.txHash, state.sent[0]);
  assert.notEqual(first.detectorAddress, second.detectorAddress);
  assert.deepEqual([...(state.voters.get(key) ?? [])], [first.detectorAddress.toLowerCase(), second.detectorAddress.toLowerCase()]);
  assert.deepEqual(await readdir(pendingDir), []);
});

test("benign evidence never touches the chain", async () => {
  const { state, signer } = await setup();
  const verdict = await signer.submit({ ...evidence, malicious: false, findings: [] });
  assert.equal(verdict.malicious, false);
  assert.equal(verdict.txHash, null);
  assert.equal(state.sent.length, 0);
});

test("an already sealed version or an earlier vote is skipped without a transaction", async () => {
  const { state, signer } = await setup();
  state.sealed.add(key);
  assert.equal((await signer.submit(evidence)).txHash, null);
  state.sealed.clear();
  await signer.submit(evidence);
  await signer.submit(evidence);
  assert.equal(state.sent.length, 1);
});

test("a DuplicateVote revert counts as done", async () => {
  const { state, pendingDir, signer } = await setup();
  state.revert = "DuplicateVote";
  assert.equal((await signer.submit(evidence)).txHash, null);
  assert.deepEqual(await readdir(pendingDir), []);
});

test("rate limits and network failures stay pending until a retry lands", async () => {
  const { state, pendingDir, signer } = await setup();
  state.revert = "SealRateLimited";
  await signer.submit(evidence);
  state.revert = null;
  state.rpcDown = true;
  await signer.submit({ ...evidence, detector: "advisoryFeed" });
  assert.equal((await readdir(pendingDir)).length, 2);
  assert.equal(await signer.retryPending(), 0);
  state.rpcDown = false;
  assert.equal(await signer.retryPending(), 2);
  assert.equal(state.sent.length, 2);
  assert.deepEqual(await readdir(pendingDir), []);
});

test("a reverted receipt stays pending", async () => {
  const { state, pendingDir, signer } = await setup();
  state.receiptStatus = "0x0";
  await signer.submit(evidence);
  assert.equal((await readdir(pendingDir)).length, 1);
});

test("detectors are listed with distinct addresses and marked simulated", async () => {
  const { signer } = await setup();
  const detectors = signer.detectors();
  assert.deepEqual(detectors.map(({ id }) => id), ["staticScripts", "sandboxCanary", "advisoryFeed"]);
  assert.equal(new Set(detectors.map(({ address }) => address)).size, 3);
  assert.ok(detectors.every(({ simulated }) => simulated));
});
