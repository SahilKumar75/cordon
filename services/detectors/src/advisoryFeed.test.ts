import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { replayTimelineSchema } from "@bulkhead/shared";
import { replayAdvisory, scanAdvisories } from "./advisoryFeed.ts";
import type { FetchLike } from "./staticScripts.ts";

type Recording = { queryUrl: string; method: string; requestBody?: unknown; fetchedAt: string; response: unknown };

async function recording(file: string): Promise<Recording> {
  return JSON.parse(await readFile(new URL(`./fixtures/${file}`, import.meta.url), "utf8"));
}

const osvQuery = await recording("osvQueryTanstackReactRouter.json");
const osvVuln = await recording("osvVulnMal20263465.json");
const npmTimes = await recording("npmTimesTanstackReactRouter.json");

function recordedFetch(recordings: Recording[], seen: { url: string; body: unknown }[] = []): FetchLike {
  return async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    seen.push({ url, body });
    const match = recordings.find((item) => item.queryUrl === url && (item.method === "GET" || JSON.stringify(item.requestBody) === JSON.stringify(body)));
    return match ? Response.json(match.response) : new Response("not recorded", { status: 404 });
  };
}

const scanRequest = {
  name: "@tanstack/react-router",
  version: "1.169.5",
  tarballUrl: "https://registry.npmjs.org/@tanstack/react-router/-/react-router-1.169.5.tgz",
  integrity: "sha512-notdownloaded",
  publishedAt: "2026-05-11T19:20:42.105Z",
};

test("a recorded OSV response marks the exact version malicious with only MAL advisories", async () => {
  const seen: { url: string; body: unknown }[] = [];
  const evidence = await scanAdvisories(scanRequest, "https://api.osv.dev", recordedFetch([osvQuery], seen));
  assert.deepEqual(seen[0]?.body, { package: { name: "@tanstack/react-router", ecosystem: "npm" }, version: "1.169.5" });
  assert.equal(evidence.malicious, true);
  assert.equal(evidence.simulated, true);
  assert.equal(evidence.advisoryUrl, "https://osv.dev/vulnerability/MAL-2026-3465");
  assert.deepEqual(evidence.findings.map(({ detail }) => detail.split(":")[0]), ["MAL-2026-3465"]);
});

test("a version absent from the advisory is not malicious", async () => {
  const response = osvQuery.response as { vulns: unknown[] };
  const fetchAll: FetchLike = async () => Response.json(response);
  const evidence = await scanAdvisories({ ...scanRequest, version: "1.169.4" }, "https://api.osv.dev", fetchAll);
  assert.equal(evidence.malicious, false);
  assert.equal(evidence.advisoryUrl, null);
});

test("replay builds a sourced timeline from OSV and npm publish times", async () => {
  const timeline = await replayAdvisory("MAL-2026-3465", "https://api.osv.dev", recordedFetch([osvVuln, npmTimes]));
  assert.deepEqual(replayTimelineSchema.parse(timeline), timeline);
  assert.equal(timeline.replay, true);
  assert.deepEqual(timeline.packages, [
    { name: "@tanstack/react-router", version: "1.169.8" },
    { name: "@tanstack/react-router", version: "1.169.5" },
  ]);
  assert.deepEqual(
    timeline.events.map(({ label, at }) => `${at} ${label}`),
    [
      "2026-05-11T19:20:42.105Z npm publish @tanstack/react-router@1.169.5",
      "2026-05-11T19:26:17.716Z npm publish @tanstack/react-router@1.169.8",
      "2026-05-11T23:44:35.000Z OSV advisory MAL-2026-3465 published",
      "2026-05-12T07:09:29.153Z OSV advisory MAL-2026-3465 last modified",
    ],
  );
  assert.ok(timeline.events.every(({ sourceUrl }) => sourceUrl.startsWith("https://api.osv.dev/") || sourceUrl.startsWith("https://registry.npmjs.org/")));
});

test("replay fails clearly when OSV does not know the advisory", async () => {
  await assert.rejects(replayAdvisory("MAL-0000-0", "https://api.osv.dev", recordedFetch([])), /status 404/);
});
