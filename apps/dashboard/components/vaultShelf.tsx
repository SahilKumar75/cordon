"use client";

import Link from "next/link";
import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { sealRegistryAbi, sealStatusNames, signedSnapshotSchema } from "@cordon/shared";
import { usePolled } from "@/lib/api";
import { formatDateTime, shortHash } from "@/lib/format";
import { ResinBlock } from "./resinBlock";
import { BrokenLine, Notice, QueryState } from "./ui";

export function VaultShelf({ registry }: { registry: Address }) {
  const count = useReadContract({ address: registry, abi: sealRegistryAbi, functionName: "sealedKeyCount", query: { refetchInterval: 4000 } });
  return (
    <QueryState
      query={count}
      loading="Counting sealed versions on SealRegistry."
      empty="The vault is empty. A version lands here once distinct detector votes reach quorum."
      isEmpty={(total) => total === 0n}
      emptyArt={<ResinBlock status="None" size={56} />}
    >
      {(total) => <Shelf registry={registry} total={total} />}
    </QueryState>
  );
}

function Shelf({ registry, total }: { registry: Address; total: bigint }) {
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
          <ul className="flex flex-wrap">
            {sealKeys.map((key, index) => {
              const entry = entries.get(key);
              const status = sealStatusNames[statuses[index] ?? 0] ?? "None";
              return (
                <li key={key} className="slideIn w-48" style={{ animationDelay: `${index * 70}ms` }}>
                  <Link href={`/seal/${key}`} className="group block">
                    <div className="flex h-36 items-end justify-center border-b-[6px] border-plum">
                      <span className="resinBlock pb-1">
                        <ResinBlock status={status} size={72} />
                      </span>
                    </div>
                    <div className="px-3 pt-3 text-center">
                      <div className="text-[15px] group-hover:text-copper">{entry ? entry.version : shortHash(key)}</div>
                      {entry && <div className="truncate text-[12px] text-jade">{entry.name}</div>}
                      <div className="mt-1 text-[12px] text-jade">
                        {status === "Unsealed" ? "unsealed" : entry?.sealedAt ? formatDateTime(entry.sealedAt) : "sealed time unknown"}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </QueryState>
  );
}
