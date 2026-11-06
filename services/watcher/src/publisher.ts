import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import type { DatabaseSync } from "node:sqlite";
import { verifyMessage, type Address, type LocalAccount } from "viem";
import { productName, signedSnapshotSchema, snapshotDigestOf, type EntryStatusName, type Hex32, type SealEntry, type SealedSnapshot, type SignedSnapshot, type TimelineEvent, type TimelineKind } from "@cordon/shared";
import { cursorOf, timelineHeads, timelineOf } from "./timeline.ts";

export type SnapshotSettings = { chainId: number; registry: Address; startBlock: bigint; voteLifetimeSeconds: number };

type NamedKey = { seal_key: Hex32; name: string; version: string };

const statusOfKind: Partial<Record<TimelineKind, EntryStatusName>> = {
  sealed: "Sealed",
  resealed: "Sealed",
  promoted: "Sealed",
  unsealed: "Unsealed",
  cleared: "Cleared",
};

function liveVoteTimes(events: TimelineEvent[], now: Date, lifetimeSeconds: number): number[] {
  const latestByDetector = new Map<string, number>();
  for (const event of events) if (event.kind === "verdict") latestByDetector.set(event.actor, Date.parse(event.at));
  return [...latestByDetector.values()].filter((at) => at + lifetimeSeconds * 1000 > now.getTime());
}

function entryOf(db: DatabaseSync, named: NamedKey, now: Date, lifetimeSeconds: number): SealEntry | null {
  const events = timelineOf(db, named.seal_key);
  const lastChange = events.filter((event) => statusOfKind[event.kind]).at(-1);
  const live = liveVoteTimes(events, now, lifetimeSeconds);
  const status = lastChange ? (statusOfKind[lastChange.kind] as EntryStatusName) : live.length ? "Suspect" : null;
  if (!status) return null;
  const lastSeal = events.filter((event) => statusOfKind[event.kind] === "Sealed").at(-1);
  const suspectUntil = status === "Suspect" ? new Date(Math.max(...live) + lifetimeSeconds * 1000).toISOString() : null;
  return { key: named.seal_key, name: named.name, version: named.version, status, sealedAt: lastSeal?.at ?? null, votes: live.length, suspectUntil };
}

export function snapshotEntries(db: DatabaseSync, now: Date, lifetimeSeconds: number): SealEntry[] {
  const named = db
    .prepare(
      `SELECT seal_key, name, version FROM seals
       UNION SELECT DISTINCT seal_key, name, version FROM publishes
       WHERE seal_key IN (SELECT seal_key FROM timeline_events WHERE kind = 'verdict')
       ORDER BY seal_key`,
    )
    .all() as NamedKey[];
  const unique = [...new Map(named.map((row) => [row.seal_key, row])).values()];
  return unique.flatMap((row) => entryOf(db, row, now, lifetimeSeconds) ?? []);
}

function buildSnapshot(db: DatabaseSync, settings: SnapshotSettings): SealedSnapshot {
  const processed = cursorOf(db, "chainBlock");
  const polledAt = cursorOf(db, "chainPolledAt");
  if (polledAt === null) throw new Error("no successful chain poll yet, snapshot not signed");
  return {
    product: productName,
    chainId: settings.chainId,
    registry: settings.registry,
    blockNumber: Number(processed ?? settings.startBlock),
    generatedAt: polledAt,
    entries: snapshotEntries(db, new Date(polledAt), settings.voteLifetimeSeconds),
    timelineHeads: timelineHeads(db),
  };
}

export async function publishSnapshot(db: DatabaseSync, settings: SnapshotSettings, account: LocalAccount, path: string): Promise<SignedSnapshot> {
  const snapshot = buildSnapshot(db, settings);
  const signed = { snapshot, signer: account.address, signature: await account.signMessage({ message: { raw: snapshotDigestOf(snapshot) } }) };
  await writeFile(path, JSON.stringify(signed, null, 2));
  return signed;
}

export async function loadSavedSnapshot(path: string, settings: SnapshotSettings, signer: Address): Promise<SignedSnapshot | null> {
  if (!existsSync(path)) return null;
  const parsed = signedSnapshotSchema.safeParse(JSON.parse(await readFile(path, "utf8")));
  if (!parsed.success) return null;
  const { snapshot, signature } = parsed.data;
  const matches =
    parsed.data.signer.toLowerCase() === signer.toLowerCase() &&
    snapshot.chainId === settings.chainId &&
    snapshot.registry.toLowerCase() === settings.registry.toLowerCase();
  if (!matches) return null;
  const valid = await verifyMessage({ address: signer, message: { raw: snapshotDigestOf(snapshot) }, signature: signature as `0x${string}` });
  return valid ? parsed.data : null;
}
