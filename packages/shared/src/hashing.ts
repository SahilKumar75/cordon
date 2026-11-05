import { encodeAbiParameters, keccak256, toBytes } from "viem";
import { ecosystem } from "./constants.ts";
import type { Evidence, Hex32, SealedSnapshot, TimelineEvent } from "./types.ts";

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashJson(value: unknown): Hex32 {
  return keccak256(toBytes(stableStringify(value)));
}

export function sealKeyOf(name: string, version: string): Hex32 {
  return keccak256(
    encodeAbiParameters([{ type: "string" }, { type: "string" }, { type: "string" }], [ecosystem, name, version]),
  );
}

export function evidenceHashOf(evidence: Evidence): Hex32 {
  return hashJson(evidence);
}

export function timelineEventHashOf({ hash: _hash, ...event }: TimelineEvent): Hex32 {
  return hashJson(event);
}

export function snapshotDigestOf(snapshot: SealedSnapshot): Hex32 {
  return hashJson(snapshot);
}
