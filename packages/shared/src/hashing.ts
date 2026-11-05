import { keccak256, toBytes } from "viem";
import type { Hex32, Report } from "./types.ts";

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function paperHashOf(paperId: string): Hex32 {
  const normalized = paperId
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//, "")
    .replace(/^doi:\s*/, "");
  return keccak256(toBytes(normalized));
}

export function hashReport({ advisory: _advisory, ...hardChecks }: Report): Hex32 {
  return keccak256(toBytes(stableStringify(hardChecks)));
}
