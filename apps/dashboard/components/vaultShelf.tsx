"use client";

import { AsciiArt, asciiVault } from "./asciiArt";
import { useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "motion/react";
import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { sealRegistryAbi, sealStatusNames, signedSnapshotSchema, type SealStatusName } from "@cordon/shared";
import { usePolled } from "@/lib/api";
import { formatDateTime, shortHash } from "@/lib/format";
import { useWebgl } from "@/lib/useWebgl";
import { ResinBlock } from "./resinBlock";
import { BrokenLine, Notice, QueryState } from "./ui";

const VaultShelfScene = dynamic(() => import("./vaultShelfScene"), { ssr: false });

const statusLabel: Record<SealStatusName, string> = { Sealed: "Sealed in resin", Unsealed: "Unsealed by guardian", None: "Not sealed", Cleared: "Not sealed" };

export function VaultShelf({ registry }: { registry: Address }) {
  const count = useReadContract({ address: registry, abi: sealRegistryAbi, functionName: "sealedKeyCount", query: { refetchInterval: 4000 } });
  return (
    <QueryState
      query={count}
      loading="Counting sealed versions on SealRegistry."
      empty="The vault is empty. A version lands here once distinct detector votes reach quorum."
      isEmpty={(total) => total === 0n}
      emptyArt={<AsciiArt art={asciiVault} />}
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
  const webgl = useWebgl();
  const slots = useRef(new Map<string, HTMLElement>());
  const hovered = useRef<string | null>(null);
  return (
    <QueryState query={keys} loading="Reading sealed keys from SealRegistry.">
      {([sealKeys, statuses]) => (
        <>
          {snapshot.isError && (
            <Notice icon="warning" tone="accent" art={<BrokenLine label="watcher" />}>
              Package names are unavailable because the signed snapshot did not load: {snapshot.error.message}
            </Notice>
          )}
          <div className="relative">
            <ul className="flex flex-wrap">
              {sealKeys.map((key, index) => {
                const entry = entries.get(key);
                const status = sealStatusNames[statuses[index] ?? 0] ?? "None";
                return (
                  <motion.li
                    key={key}
                    className="w-48"
                    initial={{ opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.5, delay: Math.min(index, 12) * 0.06, ease: [0.2, 0.8, 0.3, 1] }}
                    onPointerEnter={() => { hovered.current = key; }}
                    onPointerLeave={() => { hovered.current = null; }}
                    onFocus={() => { hovered.current = key; }}
                    onBlur={() => { hovered.current = null; }}
                  >
                    <Link href={`/seal/${key}`} className="group block">
                      <div className="flex h-36 items-end justify-center border-b-[6px] border-plum">
                        {webgl ? (
                          <span
                            ref={(node) => {
                              if (node) slots.current.set(key, node);
                              else slots.current.delete(key);
                            }}
                            role="img"
                            aria-label={statusLabel[status]}
                            className="block h-full w-full"
                          />
                        ) : (
                          <span className="resinBlock pb-1">
                            <ResinBlock status={status} size={72} />
                          </span>
                        )}
                      </div>
                      <div className="px-3 pt-3 text-center">
                        <div className="text-[15px] group-hover:text-copper">{entry ? entry.version : shortHash(key)}</div>
                        {entry && <div className="truncate text-[12px] text-jade">{entry.name}</div>}
                        <div className="mt-1 text-[12px] text-jade">
                          {status === "Unsealed" ? "unsealed" : entry?.sealedAt ? formatDateTime(entry.sealedAt) : "sealed time unknown"}
                        </div>
                      </div>
                    </Link>
                  </motion.li>
                );
              })}
            </ul>
            {webgl && (
              <VaultShelfScene
                items={sealKeys.map((key, index) => ({ key, sealed: (sealStatusNames[statuses[index] ?? 0] ?? "None") === "Sealed" }))}
                slots={slots}
                hovered={hovered}
              />
            )}
          </div>
        </>
      )}
    </QueryState>
  );
}
