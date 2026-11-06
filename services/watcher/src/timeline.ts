import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { timelineEventHashOf, zeroHash, type Hex32, type Stopwatch, type TimelineEvent, type TimelineKind } from "@bulkhead/shared";

export type NewEvent = Omit<TimelineEvent, "prevHash" | "hash">;

type EventRow = { seal_key: string; kind: string; at: string; actor: string; ref: string | null; prev_hash: string; hash: string };

const schemaSql = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(schemaSql);
  return db;
}

export function inTransaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec("BEGIN");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function cursorOf(db: DatabaseSync, name: string): string | null {
  const row = db.prepare("SELECT value FROM cursors WHERE name = ?").get(name) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setCursor(db: DatabaseSync, name: string, value: string): void {
  db.prepare("INSERT INTO cursors (name, value) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET value = excluded.value").run(name, value);
}

export function appendEvent(db: DatabaseSync, event: NewEvent): boolean {
  const duplicate = db
    .prepare("SELECT 1 FROM timeline_events WHERE seal_key = ? AND kind = ? AND actor = ? AND ref IS ?")
    .get(event.key, event.kind, event.actor, event.ref);
  if (duplicate) return false;
  const head = db
    .prepare("SELECT position, hash FROM timeline_events WHERE seal_key = ? ORDER BY position DESC LIMIT 1")
    .get(event.key) as { position: number; hash: Hex32 } | undefined;
  const chained = { ...event, prevHash: head?.hash ?? zeroHash, hash: zeroHash };
  db.prepare("INSERT INTO timeline_events (seal_key, position, kind, at, actor, ref, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
    event.key,
    (head?.position ?? -1) + 1,
    event.kind,
    event.at,
    event.actor,
    event.ref,
    chained.prevHash,
    timelineEventHashOf(chained),
  );
  return true;
}

export function timelineOf(db: DatabaseSync, key: string): TimelineEvent[] {
  const rows = db.prepare("SELECT * FROM timeline_events WHERE seal_key = ? ORDER BY position").all(key) as EventRow[];
  return rows.map((row) => ({
    key: row.seal_key as Hex32,
    kind: row.kind as TimelineKind,
    at: row.at,
    actor: row.actor,
    ref: row.ref,
    prevHash: row.prev_hash as Hex32,
    hash: row.hash as Hex32,
  }));
}

export function isChainIntact(events: TimelineEvent[]): boolean {
  return events.every(
    (event, index) => event.prevHash === (events[index - 1]?.hash ?? zeroHash) && timelineEventHashOf(event) === event.hash,
  );
}

export function verifiedTimelineOf(db: DatabaseSync, key: string): TimelineEvent[] {
  const events = timelineOf(db, key);
  if (!isChainIntact(events)) throw new Error(`timeline chain for ${key} is broken`);
  return events;
}

export function timelineHeads(db: DatabaseSync): { key: Hex32; hash: Hex32 }[] {
  const keys = db.prepare("SELECT DISTINCT seal_key FROM timeline_events ORDER BY seal_key").all() as { seal_key: Hex32 }[];
  return keys.map(({ seal_key }) => ({ key: seal_key, hash: verifiedTimelineOf(db, seal_key).at(-1)?.hash as Hex32 }));
}

type PublishRow = { seal_key: Hex32; name: string; version: string; published_at: string };

function firstAt(events: TimelineEvent[], kinds: TimelineKind[]): string | null {
  return events.find((event) => kinds.includes(event.kind))?.at ?? null;
}

function stopwatchOfPublish(db: DatabaseSync, publish: PublishRow, demoRegistry: boolean): Stopwatch {
  const events = verifiedTimelineOf(db, publish.seal_key);
  const simulatedVerdict = db.prepare("SELECT 1 FROM verdicts WHERE seal_key = ? AND simulated = 1").get(publish.seal_key);
  return {
    key: publish.seal_key,
    name: publish.name,
    version: publish.version,
    simulated: demoRegistry || simulatedVerdict !== undefined,
    publishedAt: publish.published_at,
    firstVerdictAt: firstAt(events, ["verdict"]),
    sealedAt: firstAt(events, ["sealed"]),
    firstBlockAt: firstAt(events, ["guardBlocked"]),
  };
}

const publishColumns = "SELECT seal_key, name, version, MIN(published_at) AS published_at FROM publishes";

export function stopwatches(db: DatabaseSync, demoRegistry: boolean): Stopwatch[] {
  const publishes = db.prepare(`${publishColumns} GROUP BY seal_key ORDER BY published_at DESC`).all() as PublishRow[];
  return publishes.map((publish) => stopwatchOfPublish(db, publish, demoRegistry));
}

export function stopwatchOf(db: DatabaseSync, key: string, demoRegistry: boolean): Stopwatch | null {
  const publish = db.prepare(`${publishColumns} WHERE seal_key = ? GROUP BY seal_key`).get(key) as PublishRow | undefined;
  return publish ? stopwatchOfPublish(db, publish, demoRegistry) : null;
}
