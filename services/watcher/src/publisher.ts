import { writeFile } from "node:fs/promises";
import type { DatabaseSync } from "node:sqlite";
import type { Address, LocalAccount } from "viem";
import { productName, snapshotDigestOf, type Hex32, type SealEntry, type SealedSnapshot, type SignedSnapshot } from "@bulkhead/shared";
import { cursorOf, timelineHeads, timelineOf } from "./timeline.ts";

export type SnapshotSettings = { chainId: number; registry: Address; startBlock: bigint };

function sealEntryOf(db: DatabaseSync, seal: { seal_key: Hex32; name: string; version: string }): SealEntry {
  const changes = timelineOf(db, seal.seal_key).filter((event) => ["sealed", "unsealed", "resealed"].includes(event.kind));
  const lastSeal = changes.filter((event) => event.kind !== "unsealed").at(-1);
  return {
    key: seal.seal_key,
    name: seal.name,
    version: seal.version,
    status: changes.at(-1)?.kind === "unsealed" ? "Unsealed" : "Sealed",
    sealedAt: lastSeal?.at ?? null,
  };
}

function buildSnapshot(db: DatabaseSync, settings: SnapshotSettings, now: Date): SealedSnapshot {
  const seals = db.prepare("SELECT seal_key, name, version FROM seals ORDER BY seal_key").all() as { seal_key: Hex32; name: string; version: string }[];
  const processed = cursorOf(db, "chainBlock");
  return {
    product: productName,
    chainId: settings.chainId,
    registry: settings.registry,
    blockNumber: Number(processed ?? settings.startBlock),
    generatedAt: now.toISOString(),
    entries: seals.map((seal) => sealEntryOf(db, seal)),
    timelineHeads: timelineHeads(db),
  };
}

export async function publishSnapshot(db: DatabaseSync, settings: SnapshotSettings, account: LocalAccount, path: string, now: Date): Promise<SignedSnapshot> {
  const snapshot = buildSnapshot(db, settings, now);
  const signed = { snapshot, signer: account.address, signature: await account.signMessage({ message: { raw: snapshotDigestOf(snapshot) } }) };
  await writeFile(path, JSON.stringify(signed, null, 2));
  return signed;
}
