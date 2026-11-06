import assert from "node:assert/strict";
import { test } from "node:test";
import { timelineEventHashOf, zeroHash } from "@bulkhead/shared";
import { demoKey, tempDatabasePath } from "./testSupport.ts";
import { appendEvent, isChainIntact, openDatabase, timelineHeads, timelineOf, verifiedTimelineOf } from "./timeline.ts";

function seededDatabase() {
  const db = openDatabase(tempDatabasePath());
  appendEvent(db, { key: demoKey, kind: "published", at: "2026-11-06T10:00:00.000Z", actor: "registry", ref: "https://registry.test/a.tgz" });
  appendEvent(db, { key: demoKey, kind: "verdict", at: "2026-11-06T10:00:30.000Z", actor: "0xd1", ref: "0xaa" });
  appendEvent(db, { key: demoKey, kind: "sealed", at: "2026-11-06T10:01:00.000Z", actor: "registry", ref: "0xbb" });
  return db;
}

test("events chain per key from the zero hash and the head is the last hash", () => {
  const db = seededDatabase();
  const events = timelineOf(db, demoKey);
  assert.deepEqual(events.map((event) => event.kind), ["published", "verdict", "sealed"]);
  assert.equal(events[0]?.prevHash, zeroHash);
  assert.equal(events[1]?.prevHash, events[0]?.hash);
  assert.ok(events.every((event) => timelineEventHashOf(event) === event.hash));
  assert.deepEqual(timelineHeads(db), [{ key: demoKey, hash: events[2]?.hash }]);
});

test("the same event with the same ref is appended once", () => {
  const db = seededDatabase();
  const appended = appendEvent(db, { key: demoKey, kind: "verdict", at: "2026-11-06T10:00:30.000Z", actor: "0xd1", ref: "0xaa" });
  assert.equal(appended, false);
  assert.equal(timelineOf(db, demoKey).length, 3);
});

test("a tampered timeline row fails the chain check", () => {
  const db = seededDatabase();
  db.prepare("UPDATE timeline_events SET at = ? WHERE seal_key = ? AND position = 1").run("2026-11-06T09:00:00.000Z", demoKey);
  assert.equal(isChainIntact(timelineOf(db, demoKey)), false);
  assert.throws(() => verifiedTimelineOf(db, demoKey), /broken/);
  assert.throws(() => timelineHeads(db), /broken/);
});

test("a removed timeline row fails the chain check", () => {
  const db = seededDatabase();
  db.prepare("DELETE FROM timeline_events WHERE seal_key = ? AND position = 1").run(demoKey);
  assert.equal(isChainIntact(timelineOf(db, demoKey)), false);
});
