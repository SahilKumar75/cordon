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
import { CountUp } from "./countUp";
import { Icon } from "./icon";
import { BrokenLine, Notice, QueryState, Stat } from "./ui";

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
      {([sealKeys, statuses]) => {
        const names = sealKeys.map((_, index) => sealStatusNames[statuses[index] ?? 0] ?? "None");
        const sealedCount = names.filter((name) => name === "Sealed").length;
        const unsealedCount = names.filter((name) => name === "Unsealed").length;
        const lastSealed = sealKeys
          .map((key) => entries.get(key)?.sealedAt)
          .filter((at): at is string => Boolean(at))
          .sort()
          .at(-1);
        return (
        <>
          <div className="mb-10 grid gap-4 sm:grid-cols-3">
            <Stat label="sealed now" value={<CountUp value={sealedCount} />} tone="text-persimmon" />
            <Stat label="last sealed" value={<span className="text-[22px] leading-7">{lastSealed ? formatDateTime(lastSealed) : "unknown"}</span>} />
            <Stat label="status breakdown" value={<CountUp value={sealKeys.length} />}>
              <div className="flex h-2 overflow-hidden rounded-full bg-plum">
                <motion.div
                  className="accentTrack h-full origin-left"
                  style={{ width: `${(sealedCount / Math.max(sealKeys.length, 1)) * 100}%` }}
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.9, ease: [0.2, 0.8, 0.3, 1] }}
                />
              </div>
              <div className="mt-2 flex gap-4 text-[12px] text-jade">
                <span>{sealedCount} sealed</span>
                <span>{unsealedCount} unsealed</span>
              </div>
            </Stat>
          </div>
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
                    className="relative w-40 hover:z-30 focus-within:z-30 sm:w-48"
                    initial={{ opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.5, delay: Math.min(index, 12) * 0.06, ease: [0.2, 0.8, 0.3, 1] }}
                    onPointerEnter={() => { hovered.current = key; }}
                    onPointerLeave={() => { hovered.current = null; }}
                    onFocus={() => { hovered.current = key; }}
                    onBlur={() => { hovered.current = null; }}
                  >
                    <Link href={`/seal/${key}`} data-cursor="open" className="group relative block">
                      <div className="flex h-36 items-end justify-center">
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
                      <div className="accentTrack mx-2 h-1.5 rounded-full opacity-80 shadow-[var(--shadowSoft)]" />
                      <div className="px-3 pt-3 text-center">
                        <div className="text-[15px] group-hover:text-copper">{entry ? entry.version : shortHash(key)}</div>
                        {entry && <div className="truncate text-[12px] text-jade">{entry.name}</div>}
                        <div className="mt-1 text-[12px] text-jade">
                          {status === "Unsealed" ? "unsealed" : entry?.sealedAt ? formatDateTime(entry.sealedAt) : "sealed time unknown"}
                        </div>
                      </div>
                      <div className="hoverCard panel absolute left-1/2 top-2 z-20 w-56 -translate-x-1/2 px-4 py-3 text-left shadow-[var(--shadowLift)]">
                        <div className="flex items-center gap-2 text-[13px] text-bone">
                          <span className={status === "Sealed" ? "text-persimmon" : "text-jade"}>
                            <Icon name={status === "Sealed" ? "sealed" : "unsealed"} />
                          </span>
                          <span className="truncate">{entry ? `${entry.name}@${entry.version}` : shortHash(key)}</span>
                        </div>
                        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
                          <dt className="text-jade">status</dt>
                          <dd>{status}</dd>
                          <dt className="text-jade">sealed</dt>
                          <dd>{entry?.sealedAt ? formatDateTime(entry.sealedAt) : "unknown"}</dd>
                          <dt className="text-jade">votes</dt>
                          <dd>{entry ? entry.votes : "unknown"}</dd>
                        </dl>
                        <span className="mt-2 inline-flex items-center gap-1 text-[12px] text-copper">
                          <Icon name="link" />
                          Open seal
                        </span>
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
        );
      }}
    </QueryState>
  );
}
