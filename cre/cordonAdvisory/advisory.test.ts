import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { decodeAbiParameters } from "viem";
import { evidenceHashOf, osvQueryBody, reportPayloadOf, verdictOf } from "./advisory.ts";

const recorded = JSON.parse(readFileSync(new URL("../../services/detectors/src/fixtures/osvQueryTanstackReactRouter.json", import.meta.url), "utf8")) as { response: unknown };
const tanstack = { name: "@tanstack/react-router", version: "1.169.5" };

describe("advisory verdict from the recorded OSV response for MAL-2026-3465", () => {
  const verdict = verdictOf(tanstack, JSON.stringify(recorded.response));

  test("only MAL ids count, so the GHSA entry does not", () => {
    expect(verdict.malicious).toBe(true);
    expect(verdict.malIds).toEqual(["MAL-2026-3465"]);
    expect(verdict.osvModified).toBe("2026-05-12T07:09:29.153799Z");
  });

  test("the report payload decodes to name, version and the evidence hash the receiver forwards", () => {
    const [name, version, evidenceHash] = decodeAbiParameters([{ type: "string" }, { type: "string" }, { type: "bytes32" }], reportPayloadOf(verdict));
    expect([name, version]).toEqual([tanstack.name, tanstack.version]);
    expect(evidenceHash).toBe(evidenceHashOf(verdict));
  });

  test("the evidence hash is stable and changes when the advisory changes", () => {
    expect(evidenceHashOf(verdict)).toBe(evidenceHashOf(verdictOf(tanstack, JSON.stringify(recorded.response))));
    expect(evidenceHashOf({ ...verdict, osvModified: "2026-05-13T00:00:00Z" })).not.toBe(evidenceHashOf(verdict));
  });
});

test("an empty OSV answer or GHSA only answer is clean", () => {
  expect(verdictOf(tanstack, "{}").malicious).toBe(false);
  expect(verdictOf(tanstack, JSON.stringify({ vulns: [{ id: "GHSA-g7cv-rxg3-hmpx" }] })).malicious).toBe(false);
});

test("the OSV query asks for the exact npm version", () => {
  expect(JSON.parse(osvQueryBody(tanstack))).toEqual({ package: { ecosystem: "npm", name: tanstack.name }, version: tanstack.version });
});
