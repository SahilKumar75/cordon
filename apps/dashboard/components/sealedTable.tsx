"use client";

import Link from "next/link";
import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { sealRegistryAbi, sealStatusNames, signedSnapshotSchema } from "@cordon/shared";
import { usePolled } from "@/lib/api";
import { formatDateTime, shortHash } from "@/lib/format";
import { SealStamp } from "./sealStamp";
import { BrokenLine, Notice, QueryState } from "./ui";

export function SealedTable({ registry }: { registry: Address }) {
  const count = useReadContract({ address: registry, abi: sealRegistryAbi, functionName: "sealedKeyCount", query: { refetchInterval: 4000 } });
  return (
    <QueryState
      query={count}
      loading="Counting sealed versions on SealRegistry."
      empty="Nothing sealed yet. A version appears here once distinct detector votes reach quorum."
      isEmpty={(total) => total === 0n}
      emptyArt={<EmptyLedger />}
    >
      {(total) => <SealedRows registry={registry} total={total} />}
    </QueryState>
  );
}

function SealedRows({ registry, total }: { registry: Address; total: bigint }) {
  const keys = useReadContract({
    address: registry,
    abi: sealRegistryAbi,
    functionName: "sealedKeys",
    args: [0n, total],
    query: { refetchInterval: 4000 },
  });
  const snapshot = usePolled("watcher", "/snapshot", signedSnapshotSchema, 4000);
  const entries = new Map(snapshot.data?.snapshot.entries.map((entry) => [entry.key, entry]));
  return (
    <QueryState query={keys} loading="Reading sealed keys from SealRegistry.">
      {([sealKeys, statuses]) => (
        <>
          {snapshot.isError && (
            <Notice icon="warning" tone="accent" art={<BrokenLine label="watcher" />}>
              Package names are unavailable because the signed snapshot did not load: {snapshot.error.message}
            </Notice>
          )}
          <div className="grid grid-cols-[1fr_auto] gap-x-10 border-b border-hair pb-2 text-xs text-dim sm:grid-cols-[1fr_8rem_14rem]">
            <span>Version</span>
            <span className="hidden sm:block">Status</span>
            <span>Sealed at</span>
          </div>
          <ul className="divide-y divide-hair">
            {sealKeys.map((key, index) => {
              const entry = entries.get(key);
              const status = sealStatusNames[statuses[index] ?? 0] ?? "None";
              return (
                <li key={key} className="grid grid-cols-[1fr_auto] items-center gap-x-10 gap-y-2 py-4 sm:grid-cols-[1fr_8rem_14rem]">
                  <Link href={`/seal/${key}`} className="font-mono text-base hover:text-fg">
                    {entry ? `${entry.name}@${entry.version}` : shortHash(key)}
                  </Link>
                  <SealStamp status={status} size="small" />
                  <span className="text-sm text-dim">{entry?.sealedAt ? formatDateTime(entry.sealedAt) : "Unknown"}</span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </QueryState>
  );
}

function EmptyLedger() {
  return (
    <svg viewBox="0 0 320 120" width="240" height="90" fill="none" strokeWidth="1.5" aria-hidden="true" className="shrink-0">
      <rect x="2" y="2" width="316" height="116" className="fill-raised stroke-dim" />
      <path d="M2 26h316M2 52h316M2 78h316M2 104h316M40 2v116" strokeWidth="1" className="stroke-hair" />
      <rect x="54" y="31" width="72" height="17" strokeDasharray="5 4" className="stroke-dim" transform="rotate(-4 90 39)" />
      <text x="180" y="18" fontSize="11" className="fill-dim font-mono">
        no seals yet
      </text>
    </svg>
  );
}
