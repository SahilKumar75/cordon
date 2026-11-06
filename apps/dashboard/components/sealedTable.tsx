"use client";

import Link from "next/link";
import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { sealRegistryAbi, sealStatusNames, signedSnapshotSchema } from "@cordon/shared";
import { usePolled } from "@/lib/api";
import { formatDateTime, shortHash } from "@/lib/format";
import { SealStamp } from "./sealStamp";
import { BrokenLine, Notice, QueryState, Tape } from "./ui";

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
          <div className="overflow-x-auto border border-line bg-panel">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th className="h-12 px-4 pl-6 font-medium">Version</th>
                  <th className="h-12 px-4 font-medium">Status on chain</th>
                  <th className="h-12 px-4 font-medium">Sealed at</th>
                  <th className="h-12 px-4 font-medium">Seal key</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sealKeys.map((key, index) => {
                  const entry = entries.get(key);
                  const status = sealStatusNames[statuses[index] ?? 0] ?? "None";
                  return (
                    <tr key={key}>
                      <td className="relative h-12 px-4 pl-6 font-mono">
                        {status === "Sealed" && <Tape tone="accent" className="absolute inset-y-0 left-0 h-full w-1.5" />}
                        <Link href={`/seal/${key}`} className="underline decoration-line underline-offset-4 hover:text-accent">
                          {entry ? `${entry.name}@${entry.version}` : "Name not in snapshot yet"}
                        </Link>
                      </td>
                      <td className="h-12 px-4">
                        <SealStamp status={status} size="small" />
                      </td>
                      <td className="h-12 px-4 text-muted">{entry?.sealedAt ? formatDateTime(entry.sealedAt) : "Unknown"}</td>
                      <td className="h-12 px-4 font-mono text-muted" title={key}>
                        {shortHash(key)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </QueryState>
  );
}

function EmptyLedger() {
  return (
    <svg viewBox="0 0 320 120" width="240" height="90" fill="none" strokeWidth="1.5" aria-hidden="true" className="shrink-0">
      <rect x="2" y="2" width="316" height="116" className="fill-paper stroke-ink" />
      <path d="M2 26h316M2 52h316M2 78h316M2 104h316M40 2v116" strokeWidth="1" className="stroke-line" />
      <rect x="54" y="31" width="72" height="17" strokeDasharray="5 4" className="stroke-muted" transform="rotate(-4 90 39)" />
      <text x="180" y="18" fontSize="11" className="fill-muted font-mono">
        no seals yet
      </text>
    </svg>
  );
}
