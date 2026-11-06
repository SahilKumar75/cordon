"use client";

import Link from "next/link";
import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { sealRegistryAbi, sealStatusNames, signedSnapshotSchema } from "@bulkhead/shared";
import { usePolled } from "@/lib/api";
import { formatDateTime, shortHash } from "@/lib/format";
import { Notice, QueryState, SealStatus } from "./ui";

export function SealedTable({ registry }: { registry: Address }) {
  const count = useReadContract({ address: registry, abi: sealRegistryAbi, functionName: "sealedKeyCount", query: { refetchInterval: 4000 } });
  return (
    <QueryState
      query={count}
      loading="Counting sealed versions on SealRegistry."
      empty="Nothing has been sealed on this registry yet."
      isEmpty={(total) => total === 0n}
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
            <Notice icon="warning" tone="accent">
              Package names are unavailable because the signed snapshot did not load: {snapshot.error.message}
            </Notice>
          )}
          <div className="overflow-x-auto border border-line bg-panel">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-muted">
                <tr>
                  <th className="p-4 font-medium">Version</th>
                  <th className="p-4 font-medium">Status on chain</th>
                  <th className="p-4 font-medium">Sealed at</th>
                  <th className="p-4 font-medium">Seal key</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sealKeys.map((key, index) => {
                  const entry = entries.get(key);
                  return (
                    <tr key={key}>
                      <td className="p-4 font-mono">
                        <Link href={`/seal/${key}`} className="underline decoration-line underline-offset-4 hover:text-accent">
                          {entry ? `${entry.name}@${entry.version}` : "Name not in snapshot yet"}
                        </Link>
                      </td>
                      <td className="p-4">
                        <SealStatus status={sealStatusNames[statuses[index] ?? 0] ?? "None"} />
                      </td>
                      <td className="p-4 text-muted">{entry?.sealedAt ? formatDateTime(entry.sealedAt) : "Unknown"}</td>
                      <td className="p-4 font-mono text-muted" title={key}>
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
