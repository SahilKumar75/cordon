import assert from "node:assert/strict";
import { test } from "node:test";
import { createPublicClient, type WalletArkivClient } from "@arkiv-network/sdk";
import type { Hex } from "viem";
import { evidenceHashOf, type Evidence } from "@cordon/shared";
import { evidenceEntity, publishEvidence, readEvidence, type EvidenceWriter } from "./arkiv.ts";
import { arkivQueryTransport, type ArkivRow } from "./testSupport.ts";

const owner: Hex = "0xDe760446b5a7fFf40f17625f77d4165BaA013Fc9";
const entityKey: Hex = `0x${"e1".repeat(32)}`;

const evidence: Evidence = {
  name: "@cordondemo/colorkit",
  version: "1.4.1",
  detector: "staticScripts",
  integrity: "sha512-abc",
  malicious: true,
  simulated: true,
  findings: [{ rule: "installScriptNetwork", detail: "postinstall calls fetch", file: "postinstall.js" }],
  advisoryUrl: null,
  observedAt: "2026-11-06T10:00:01.000Z",
};
const text = JSON.stringify(evidence, null, 2);

function recordingWriter(calls: unknown[][]): EvidenceWriter {
  const createEntity = (async (...args: unknown[]) => {
    calls.push(args);
    return { entityKey, txHash: `0x${"7a".repeat(32)}`, expiresAt: 1n };
  }) as WalletArkivClient["createEntity"];
  return { account: { address: owner }, createEntity };
}

const reader = (rows: ArkivRow[], queries: unknown[] = []) => createPublicClient({ transport: arkivQueryTransport(rows, queries) });

test("publishing writes the indexed fields and the evidence file text as the body", async () => {
  const calls: unknown[][] = [];
  const reference = await publishEvidence(recordingWriter(calls), evidence, text);
  assert.deepEqual(reference, { entityKey, txHash: `0x${"7a".repeat(32)}`, owner });
  const [schema, values, options] = calls[0] as [unknown, Record<string, unknown>, { expiration: unknown }];
  assert.equal(schema, evidenceEntity);
  assert.equal(values.evidenceHash, evidenceHashOf(evidence));
  assert.match(String(values.evidenceHash), /^0x[0-9a-f]{64}$/);
  assert.deepEqual([values.detector, values.name, values.version, values.malicious], ["staticScripts", "@cordondemo/colorkit", "1.4.1", true]);
  assert.equal(new TextDecoder().decode(values.body as Uint8Array), text);
  assert.ok(options.expiration);
});

test("a name longer than 128 bytes stays in the body only", async () => {
  const calls: unknown[][] = [];
  const longName = { ...evidence, name: `@cordondemo/${"a".repeat(130)}` };
  await publishEvidence(recordingWriter(calls), longName, JSON.stringify(longName, null, 2));
  const values = calls[0]?.[1] as Record<string, unknown>;
  assert.equal(values.name, undefined);
  assert.equal(JSON.parse(new TextDecoder().decode(values.body as Uint8Array)).name, longName.name);
});

test("the reader queries by schema and hash and returns the parsed body with key and owner", async () => {
  const queries: unknown[] = [];
  const hash = evidenceHashOf(evidence);
  const found = await readEvidence(reader([{ key: entityKey, owner, body: text }], queries), hash.toUpperCase().replace("0X", "0x"));
  assert.deepEqual(found, { evidence, entityKey, owner });
  assert.equal(queries[0], `arkiv.schema = str('cordon.evidence') AND evidenceHash = str('${hash}')`);
});

test("the reader returns null when nothing matches", async () => {
  assert.equal(await readEvidence(reader([]), evidenceHashOf(evidence)), null);
  const forged = JSON.stringify({ ...evidence, malicious: false });
  const notJson = "not json";
  const rows = [forged, notJson].map((body) => ({ key: entityKey, owner, body }));
  assert.equal(await readEvidence(reader(rows), evidenceHashOf(evidence)), null);
});

test("the reader skips rows whose body does not hash to the requested hash", async () => {
  const forged = { key: `0x${"f0".repeat(32)}` as Hex, owner: "0x0000000000000000000000000000000000000bad" as Hex, body: JSON.stringify({ ...evidence, findings: [] }) };
  const found = await readEvidence(reader([forged, { key: entityKey, owner, body: text }]), evidenceHashOf(evidence));
  assert.equal(found?.entityKey, entityKey);
  assert.equal(found?.owner, owner);
});
