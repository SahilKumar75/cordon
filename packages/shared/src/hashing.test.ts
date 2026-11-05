import assert from "node:assert/strict";
import { test } from "node:test";
import { hashReport, paperHashOf } from "./hashing.ts";
import type { Report } from "./types.ts";

const report: Report = {
  version: 1,
  paperId: "10.1000/example",
  paperHash: paperHashOf("10.1000/example"),
  checkedAt: "2026-11-05T12:00:00.000Z",
  dbVersion: "crossref 2026-11-05",
  references: [
    {
      raw: "Example reference",
      doi: "10.1000/cited",
      resolved: true,
      retracted: false,
      retractionDate: null,
      source: "crossref",
      matchConfidence: 1,
    },
  ],
  summary: { status: "Clean", total: 1, resolvedCount: 1, unresolvedCount: 0, retractedCount: 0 },
  advisory: null,
};

test("report hash ignores key order", () => {
  const reordered = Object.fromEntries(Object.entries(report).reverse()) as Report;
  assert.equal(hashReport(reordered), hashReport(report));
});

test("report hash changes when a reference changes", () => {
  const flagged: Report = {
    ...report,
    references: [{ ...report.references[0]!, retracted: true }],
  };
  assert.notEqual(hashReport(flagged), hashReport(report));
});

test("paper hash treats doi url, prefix and case as the same paper", () => {
  const expected = paperHashOf("10.1000/example");
  assert.equal(paperHashOf("https://doi.org/10.1000/EXAMPLE"), expected);
  assert.equal(paperHashOf("doi: 10.1000/example "), expected);
});
