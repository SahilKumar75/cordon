import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { after, before, test } from "node:test";
import { type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { guardReportDigestOf, sealKeyOf, type GuardReport, type TimelineEvent } from "@bulkhead/shared";
import { buildContracts, startChain, submitVerdict, type LocalChain } from "../support/chain.ts";
import { eventually, makeTempDir, runGuard, startWatcher, writeLockfile, type Service } from "../support/services.ts";

const name = "@bulkheaddemo/colorkit";
const poisoned = sealKeyOf(name, "1.4.1");
const reporterKey = generatePrivateKey();
const temps = [makeTempDir(), makeTempDir()];

let chain: LocalChain;
let registry: Address;
let watcher: Service;

before(async () => {
  await buildContracts();
  chain = await startChain();
  const detectors = [await chain.funded(), await chain.funded(), await chain.funded()];
  registry = await chain.deployRegistry({ detectors, guardian: generatePrivateKey(), quorum: 2, disputeWindow: 3600, maxSealsPerDay: 10 });
  await submitVerdict(chain.rpcUrl, registry, detectors[0] as Hex, name, "1.4.1");
  await submitVerdict(chain.rpcUrl, registry, detectors[1] as Hex, name, "1.4.1");
  watcher = await startWatcher(chain, registry, generatePrivateKey(), reporterKey, temps[0] as string);
});

after(async () => {
  await watcher?.stop();
  chain?.stop();
  for (const path of temps) rmSync(path, { recursive: true, force: true });
});

async function blockedReport(): Promise<GuardReport> {
  const lockfile = writeLockfile(temps[1] as string, [{ path: "node_modules/@bulkheaddemo/colorkit", name, version: "1.4.1" }]);
  const env = { CHAIN_ID: String(chain.chainId), RPC_URL: chain.rpcUrl, REGISTRY_ADDRESS: registry };
  const run = await runGuard(["check", "--lockfile", lockfile, "--service", "ordersApi"], env);
  assert.equal(run.report.outcome, "blocked");
  return run.report;
}

function postReport(body: unknown): Promise<Response> {
  return fetch(`${watcher.url}/reports`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

async function getJson<T>(path: string): Promise<T> {
  return (await fetch(`${watcher.url}${path}`)).json() as Promise<T>;
}

async function guardBlockedEvents(): Promise<TimelineEvent[]> {
  return (await getJson<TimelineEvent[]>(`/timeline/${poisoned}`)).filter((event) => event.kind === "guardBlocked");
}

test("an unsigned guard report is refused with 401 and records nothing", async () => {
  const report = await blockedReport();
  const stranger = privateKeyToAccount(generatePrivateKey());
  const strangerSignature = await stranger.signMessage({ message: { raw: guardReportDigestOf(report) } });
  for (const body of [{ report }, { report, signer: privateKeyToAccount(reporterKey).address }, { report, signer: stranger.address, signature: strangerSignature }]) {
    assert.equal((await postReport(body)).status, 401);
  }
  assert.deepEqual(await getJson("/services"), []);
  assert.deepEqual(await guardBlockedEvents(), []);
});

test("a valid guard report posted twice is accepted once and refused with 401 the second time", async () => {
  await eventually(async () => (await getJson<TimelineEvent[]>(`/timeline/${poisoned}`)).some((event) => event.kind === "sealed"), "the watcher to record the seal");
  const report = await blockedReport();
  const account = privateKeyToAccount(reporterKey);
  const signed = { report, signer: account.address, signature: await account.signMessage({ message: { raw: guardReportDigestOf(report) } }) };
  const first = await postReport(signed);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { recorded: 1 });
  const replay = await postReport(signed);
  assert.equal(replay.status, 401);
  assert.match(((await replay.json()) as { error: string }).error, /already received/);
  const services = await getJson<{ service: string; healthy: boolean }[]>("/services");
  assert.deepEqual(services.map(({ service, healthy }) => ({ service, healthy })), [{ service: "ordersApi", healthy: false }]);
  assert.equal((await guardBlockedEvents()).length, 1);
});
