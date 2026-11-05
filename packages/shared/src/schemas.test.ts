import assert from "node:assert/strict";
import { test } from "node:test";
import { doiPattern } from "./constants.ts";
import { reportSchema } from "./schemas.ts";

const cleanReport = {
  version: 1,
  paperId: "10.1000/example",
  paperHash: `0x${"a".repeat(64)}`,
  checkedAt: "2026-11-05T12:00:00.000Z",
  dbVersion: "crossref+openalex@20261105",
  references: [
    {
      raw: "Unresolved reference without a doi",
      doi: null,
      resolved: false,
      retracted: false,
      retractionDate: null,
      source: null,
      matchConfidence: 0,
    },
  ],
  summary: { status: "Clean", total: 1, resolvedCount: 0, unresolvedCount: 1, retractedCount: 0 },
  advisory: null,
};

test("an unresolved reference alone keeps the report clean", () => {
  assert.equal(reportSchema.safeParse(cleanReport).success, true);
});

test("report rejects flagged status with no retracted reference", () => {
  const mislabelled = { ...cleanReport, summary: { ...cleanReport.summary, status: "Flagged" } };
  assert.equal(reportSchema.safeParse(mislabelled).success, false);
});

test("report rejects a total that differs from the reference count", () => {
  const miscounted = { ...cleanReport, summary: { ...cleanReport.summary, total: 2 } };
  assert.equal(reportSchema.safeParse(miscounted).success, false);
});

test("doi match stops before trailing punctuation", () => {
  assert.equal("See (doi 10.1000/abc.123).".match(doiPattern)?.[0], "10.1000/abc.123");
  assert.equal("10.1016/j.cell.2020.01.001, 2020".match(doiPattern)?.[0], "10.1016/j.cell.2020.01.001");
});
