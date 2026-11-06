import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, test } from "node:test";
import { generatePrivateKey } from "viem/accounts";
import { productName, type GuardReport } from "@cordon/shared";
import { sendReport } from "./check.ts";
import { packumentReader } from "./registry.ts";
import { loadSealedList } from "./sealedList.ts";
import { settingsFor } from "./testFixtures.ts";

const silent = createServer(() => {});
await new Promise<void>((resolve) => silent.listen(0, "127.0.0.1", resolve));
const silentUrl = `http://127.0.0.1:${(silent.address() as { port: number }).port}`;
after(() => {
  silent.closeAllConnections();
  silent.close();
});

async function elapsedMs<T>(work: () => Promise<T>): Promise<{ result: T; took: number }> {
  const started = performance.now();
  const result = await work();
  return { result, took: performance.now() - started };
}

test("an RPC and a snapshot URL that never answer fail fast and the guard falls back", async () => {
  const settings = settingsFor("", { rpcUrl: silentUrl, snapshotUrl: `${silentUrl}/snapshot`, httpTimeoutMs: 200, fetchFn: fetch });
  const { result, took } = await elapsedMs(() => loadSealedList(settings));
  assert.equal(result.source, "none");
  assert.ok(took < 2_000, `took ${took}ms`);
  assert.ok(settings.warnings.some((warning) => warning.startsWith("chain unavailable")));
  assert.ok(settings.warnings.some((warning) => warning.startsWith("snapshot fetch failed")));
});

test("registry metadata that never arrives counts as unreadable instead of hanging", async () => {
  const warnings: string[] = [];
  const read = packumentReader(silentUrl, fetch, (message) => warnings.push(message), 200);
  const { result, took } = await elapsedMs(() => read("@cordondemo/colorkit"));
  assert.equal(result, null);
  assert.ok(took < 2_000, `took ${took}ms`);
  assert.equal(warnings.length, 1);
});

test("a report endpoint that never answers is given up on", async () => {
  const report = { product: productName } as GuardReport;
  const settings = settingsFor("", { reportUrl: `${silentUrl}/reports`, reporterPrivateKey: generatePrivateKey(), httpTimeoutMs: 200, fetchFn: fetch });
  const { result, took } = await elapsedMs(() => sendReport(report, settings));
  assert.equal(result, false);
  assert.ok(took < 2_000, `took ${took}ms`);
  assert.ok(settings.warnings.some((warning) => warning.startsWith("report not delivered")));
});
