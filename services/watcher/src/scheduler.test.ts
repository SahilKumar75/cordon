import assert from "node:assert/strict";
import { test } from "node:test";
import type { ScanRequest, ScanResponse } from "@cordon/shared";
import { pollRegistry } from "./registryPoller.ts";
import { pollChain } from "./chainPoller.ts";
import { attestations, rescanSuspects, runScheduler } from "./scheduler.ts";
import { blockTimeOf, demoKey, demoName, demoVersion, detectorAddress, fakeChain, guardianLog, registryAddress, tempDatabasePath, verdictLog } from "./testSupport.ts";
import { openDatabase } from "./timeline.ts";

const registryUrl = "http://127.0.0.1:4873";
const detectorsUrl = "http://127.0.0.1:4000";

async function seeded() {
  const db = openDatabase(tempDatabasePath());
  const changes = ["1.4.0", demoVersion].map((version, index) => ({
    seq: index + 1,
    name: demoName,
    version,
    publishedAt: "2026-11-06T10:00:00.000Z",
    tarballUrl: `${registryUrl}/colorkit-${version}.tgz`,
    integrity: `sha512-${version}`,
  }));
  await pollRegistry(db, registryUrl, async () => Response.json(changes));
  return db;
}

function scanResponseFor(request: ScanRequest): ScanResponse {
  const malicious = request.version === demoVersion;
  return {
    name: request.name,
    version: request.version,
    key: demoKey,
    verdicts: malicious
      ? [
          {
            key: demoKey,
            detector: "staticScripts",
            detectorAddress,
            evidenceHash: `0x${"ab".repeat(32)}`,
            malicious: true,
            simulated: true,
            txHash: null,
            submittedAt: "2026-11-06T10:00:20.000Z",
          },
        ]
      : [],
    failures: [{ detector: "advisoryFeed", error: "osv unreachable" }],
  };
}

test("each publish is scanned once, in order, and a failed scan is retried next tick", async () => {
  const db = await seeded();
  const scanned: string[] = [];
  let failNext = true;
  const fetchImpl = async (url: string, init?: RequestInit) => {
    assert.equal(url, `${detectorsUrl}/scan`);
    const request = JSON.parse(String(init?.body)) as ScanRequest;
    scanned.push(request.version);
    if (request.version === demoVersion && failNext) {
      failNext = false;
      return new Response("busy", { status: 503 });
    }
    return Response.json(scanResponseFor(request));
  };
  const failures: string[] = [];
  await assert.rejects(runScheduler(db, detectorsUrl, fetchImpl, (failure) => failures.push(failure)), /503/);
  assert.equal(await runScheduler(db, detectorsUrl, fetchImpl, (failure) => failures.push(failure)), 1);
  assert.equal(await runScheduler(db, detectorsUrl, fetchImpl, (failure) => failures.push(failure)), 0);
  assert.deepEqual(scanned, ["1.4.0", demoVersion, demoVersion]);
  assert.equal(failures.length, 2);
  assert.match(failures[0] ?? "", /advisoryFeed on @cordondemo\/colorkit@1\.4\.0: osv unreachable/);
});

test("scan verdicts become attestations, simulated on the demo registry", async () => {
  const db = await seeded();
  await runScheduler(db, detectorsUrl, async (_url, init) => Response.json(scanResponseFor(JSON.parse(String(init?.body)))), () => {});
  const [attestation] = attestations(db, false);
  assert.equal(attestation?.name, demoName);
  assert.equal(attestation?.version, demoVersion);
  assert.equal(attestation?.detector, "staticScripts");
  assert.equal(attestation?.simulated, true);
  assert.equal(attestation?.txHash, null);
});

test("a Suspect version is rescanned once per quarter of the vote lifetime and a cleared one is not", async () => {
  const db = await seeded();
  const lifetime = 4 * 3600;
  const votedAt = blockTimeOf(2) * 1000;
  await pollChain(db, fakeChain([verdictLog(2)], () => 8).client, { registry: registryAddress, startBlock: 1n, maxBlockRange: 100n }, new Date(votedAt));
  const scanned: string[] = [];
  const fetchImpl = async (_url: string, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as ScanRequest;
    scanned.push(request.version);
    return Response.json(scanResponseFor(request));
  };
  const at = (offsetMs: number) => ({ voteLifetimeSeconds: lifetime, now: new Date(votedAt + offsetMs) });
  assert.equal(await rescanSuspects(db, detectorsUrl, fetchImpl, at(60_000), () => {}), 0);
  assert.equal(await rescanSuspects(db, detectorsUrl, fetchImpl, at(3600_000), () => {}), 1);
  assert.equal(await rescanSuspects(db, detectorsUrl, fetchImpl, at(3600_000 + 60_000), () => {}), 0);
  assert.equal(await rescanSuspects(db, detectorsUrl, fetchImpl, at(7200_000), () => {}), 1);
  assert.deepEqual(scanned, [demoVersion, demoVersion]);
  await pollChain(db, fakeChain([guardianLog("Cleared", 9)], () => 10).client, { registry: registryAddress, startBlock: 1n, maxBlockRange: 100n }, new Date(votedAt));
  assert.equal(await rescanSuspects(db, detectorsUrl, fetchImpl, at(3 * 3600_000), () => {}), 0);
});
