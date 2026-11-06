import assert from "node:assert/strict";
import { test } from "node:test";
import type { RegistryChange } from "@cordon/shared";
import { pollRegistry } from "./registryPoller.ts";
import { demoKey, demoName, tempDatabasePath } from "./testSupport.ts";
import { openDatabase, timelineOf } from "./timeline.ts";

const registryUrl = "http://127.0.0.1:4873";

function change(seq: number, version: string): RegistryChange {
  return {
    seq,
    name: demoName,
    version,
    publishedAt: `2026-11-06T10:00:0${seq}.000Z`,
    tarballUrl: `${registryUrl}/${demoName}/-/colorkit-${version}.tgz`,
    integrity: `sha512-${version}`,
  };
}

function feed(changes: RegistryChange[]) {
  const requested: string[] = [];
  const fetchImpl = async (url: string) => {
    requested.push(url);
    const since = Number(new URL(url).searchParams.get("since"));
    return Response.json(changes.filter((item) => item.seq > since));
  };
  return { requested, fetchImpl };
}

test("publishes are stored with a published event and the cursor resumes after a restart", async () => {
  const path = tempDatabasePath();
  const changes = [change(1, "1.4.0"), change(2, "1.4.1")];
  const first = feed(changes);
  assert.equal(await pollRegistry(openDatabase(path), registryUrl, first.fetchImpl), 2);
  assert.equal(first.requested[0], `${registryUrl}/_changes?since=0`);

  changes.push(change(3, "1.4.2"));
  const restarted = openDatabase(path);
  const second = feed(changes);
  assert.equal(await pollRegistry(restarted, registryUrl, second.fetchImpl), 1);
  assert.equal(second.requested[0], `${registryUrl}/_changes?since=2`);
  assert.deepEqual(timelineOf(restarted, demoKey).map((event) => [event.kind, event.at]), [["published", "2026-11-06T10:00:02.000Z"]]);
  assert.equal((restarted.prepare("SELECT COUNT(*) AS count FROM publishes").get() as { count: number }).count, 3);
});

test("a feed that repeats old changes records nothing twice", async () => {
  const db = openDatabase(tempDatabasePath());
  const changes = [change(1, "1.4.1")];
  await pollRegistry(db, registryUrl, async () => Response.json(changes));
  assert.equal(await pollRegistry(db, registryUrl, async () => Response.json(changes)), 0);
  assert.equal(timelineOf(db, demoKey).length, 1);
});

test("a failing feed leaves the cursor where it was", async () => {
  const db = openDatabase(tempDatabasePath());
  await assert.rejects(pollRegistry(db, registryUrl, async () => new Response("down", { status: 502 })), /502/);
  const { requested, fetchImpl } = feed([change(1, "1.4.1")]);
  assert.equal(await pollRegistry(db, registryUrl, fetchImpl), 1);
  assert.equal(requested[0], `${registryUrl}/_changes?since=0`);
});
