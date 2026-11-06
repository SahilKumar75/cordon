import type { DatabaseSync } from "node:sqlite";
import { registryChangeSchema, sealKeyOf, type RegistryChange } from "@cordon/shared";
import { appendEvent, cursorOf, inTransaction, setCursor } from "./timeline.ts";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const registryChangesSchema = registryChangeSchema.array();

function recordChange(db: DatabaseSync, change: RegistryChange): boolean {
  const key = sealKeyOf(change.name, change.version);
  const inserted = db
    .prepare("INSERT OR IGNORE INTO publishes (seq, seal_key, name, version, published_at, tarball_url, integrity) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(change.seq, key, change.name, change.version, change.publishedAt, change.tarballUrl, change.integrity);
  if (inserted.changes === 0) return false;
  return appendEvent(db, { key, kind: "published", at: change.publishedAt, actor: "registry", ref: `${change.seq} ${change.tarballUrl}` });
}

export async function pollRegistry(db: DatabaseSync, registryUrl: string, fetchImpl: FetchLike): Promise<number> {
  const since = Number(cursorOf(db, "registrySeq") ?? 0);
  const response = await fetchImpl(`${registryUrl}/_changes?since=${since}`);
  if (!response.ok) throw new Error(`registry changes feed answered ${response.status}`);
  const changes = registryChangesSchema.parse(await response.json()).filter((change) => change.seq > since).sort((a, b) => a.seq - b.seq);
  return inTransaction(db, () => {
    const recorded = changes.filter((change) => recordChange(db, change)).length;
    const last = changes.at(-1);
    if (last) setCursor(db, "registrySeq", String(last.seq));
    return recorded;
  });
}
