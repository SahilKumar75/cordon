import assert from "node:assert/strict";
import { test } from "node:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { stopwatchSchema, type SignedGuardReport } from "@bulkhead/shared";
import { pollChain } from "./chainPoller.ts";
import { pollRegistry } from "./registryPoller.ts";
import { buildServer } from "./server.ts";
import {
  demoKey,
  demoName,
  demoVersion,
  fakeChain,
  guardReport,
  registryAddress,
  reporterKey,
  sealedLog,
  signedReport,
  tempDatabasePath,
  verdictLog,
} from "./testSupport.ts";
import { openDatabase, timelineOf } from "./timeline.ts";

const dashboardOrigin = "http://localhost:3000";
const checkedAt = "2026-11-06T10:00:00.000Z";

function watcher(minutesAfterCheck = 1) {
  const db = openDatabase(tempDatabasePath());
  const app = buildServer({
    db,
    demoRegistry: true,
    reporters: new Set([privateKeyToAccount(reporterKey).address.toLowerCase()]),
    dashboardOrigin,
    latestSnapshot: () => null,
    now: () => new Date(Date.parse(checkedAt) + minutesAfterCheck * 60_000),
  });
  return { db, app };
}

function postReport(app: ReturnType<typeof watcher>["app"], body: unknown) {
  return app.inject({ method: "POST", url: "/reports", payload: body as SignedGuardReport });
}

function recordedRows(db: ReturnType<typeof watcher>["db"]) {
  return [
    timelineOf(db, demoKey).length,
    (db.prepare("SELECT COUNT(*) AS count FROM service_status").get() as { count: number }).count,
    (db.prepare("SELECT COUNT(*) AS count FROM seen_reports").get() as { count: number }).count,
  ];
}

test("a valid signed report records a guardBlocked event and the service status", async () => {
  const { db, app } = watcher();
  const response = await postReport(app, await signedReport(guardReport()));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { recorded: 1 });
  assert.deepEqual(timelineOf(db, demoKey).map((event) => [event.kind, event.actor, event.at]), [["guardBlocked", "checkout", checkedAt]]);
  const services = (await app.inject({ url: "/services" })).json();
  assert.equal(services[0].service, "checkout");
  assert.equal(services[0].healthy, false);
});

test("a report without a service is recorded with ci as actor", async () => {
  const { db, app } = watcher();
  await postReport(app, await signedReport(guardReport({ service: null })));
  assert.equal(timelineOf(db, demoKey)[0]?.actor, "ci");
});

test("an unsigned report is refused with 401 and records nothing", async () => {
  const { db, app } = watcher();
  const response = await postReport(app, { report: guardReport() });
  assert.equal(response.statusCode, 401);
  assert.deepEqual(recordedRows(db), [0, 0, 0]);
});

test("a report signed by a key outside the reporter list is refused", async () => {
  const { db, app } = watcher();
  const response = await postReport(app, await signedReport(guardReport(), generatePrivateKey()));
  assert.equal(response.statusCode, 401);
  assert.deepEqual(recordedRows(db), [0, 0, 0]);
});

test("a report whose signature does not cover its content is refused", async () => {
  const { db, app } = watcher();
  const signed = await signedReport(guardReport());
  const response = await postReport(app, { ...signed, report: { ...signed.report, packagesChecked: 99 } });
  assert.equal(response.statusCode, 401);
  assert.deepEqual(recordedRows(db), [0, 0, 0]);
});

test("a replayed report is refused the second time and records nothing more", async () => {
  const { db, app } = watcher();
  const signed = await signedReport(guardReport());
  assert.equal((await postReport(app, signed)).statusCode, 200);
  const before = recordedRows(db);
  const replay = await postReport(app, signed);
  assert.equal(replay.statusCode, 401);
  assert.match(replay.json().error, /already received/);
  assert.deepEqual(recordedRows(db), before);
});

test("a report checked more than ten minutes ago is refused", async () => {
  const { db, app } = watcher(11);
  const response = await postReport(app, await signedReport(guardReport()));
  assert.equal(response.statusCode, 401);
  assert.deepEqual(recordedRows(db), [0, 0, 0]);
});

test("a malformed report body is a 400", async () => {
  const { app } = watcher();
  const signed = await signedReport(guardReport());
  const response = await postReport(app, { ...signed, report: { ...signed.report, outcome: "maybe" } });
  assert.equal(response.statusCode, 400);
});

test("the stopwatch shows publish, first verdict, quorum and first block", async () => {
  const { db, app } = watcher();
  const change = { seq: 1, name: demoName, version: demoVersion, publishedAt: "2026-11-06T09:59:00.000Z", tarballUrl: "http://127.0.0.1:4873/colorkit.tgz", integrity: "sha512-x" };
  await pollRegistry(db, "http://127.0.0.1:4873", async () => Response.json([change]));
  await pollChain(db, fakeChain([verdictLog(2), sealedLog(4)], () => 5).client, { registry: registryAddress, startBlock: 1n, maxBlockRange: 100n });
  await postReport(app, await signedReport(guardReport()));
  const stopwatch = stopwatchSchema.parse((await app.inject({ url: `/stopwatch/${demoKey}` })).json());
  const events = timelineOf(db, demoKey);
  assert.equal(stopwatch.publishedAt, change.publishedAt);
  assert.equal(stopwatch.firstVerdictAt, events.find((event) => event.kind === "verdict")?.at);
  assert.equal(stopwatch.sealedAt, events.find((event) => event.kind === "sealed")?.at);
  assert.equal(stopwatch.firstBlockAt, checkedAt);
  assert.equal(stopwatch.simulated, true);
  assert.deepEqual((await app.inject({ url: "/stopwatch" })).json(), [stopwatch]);
});

test("timeline and stopwatch reject bad keys and unknown keys", async () => {
  const { app } = watcher();
  assert.equal((await app.inject({ url: "/timeline/nothex" })).statusCode, 400);
  assert.equal((await app.inject({ url: `/stopwatch/${demoKey}` })).statusCode, 404);
  assert.equal((await app.inject({ url: "/snapshot" })).statusCode, 503);
});

test("a tampered timeline is served as an error instead of a broken chain", async () => {
  const { db, app } = watcher();
  await postReport(app, await signedReport(guardReport()));
  await postReport(app, await signedReport(guardReport({ lockfile: "other/package-lock.json" })));
  db.prepare("UPDATE timeline_events SET actor = 'someone' WHERE position = 0").run();
  const response = await app.inject({ url: `/timeline/${demoKey}` });
  assert.equal(response.statusCode, 500);
  assert.match(response.json().error, /broken/);
});

test("only the dashboard origin gets cors headers", async () => {
  const { app } = watcher();
  const allowed = await app.inject({ url: "/health", headers: { origin: dashboardOrigin } });
  assert.equal(allowed.headers["access-control-allow-origin"], dashboardOrigin);
  const other = await app.inject({ url: "/health", headers: { origin: "http://evil.test" } });
  assert.equal(other.headers["access-control-allow-origin"], undefined);
  const preflight = await app.inject({ method: "OPTIONS", url: "/reports", headers: { origin: dashboardOrigin } });
  assert.equal(preflight.statusCode, 204);
});
