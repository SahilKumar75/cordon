import type { DatabaseSync } from "node:sqlite";
import type { Address, PublicClient } from "viem";
import { sealRegistryAbi } from "@cordon/shared";
import { appendEvent, cursorOf, inTransaction, setCursor } from "./timeline.ts";

export type ChainPollSettings = { registry: Address; startBlock: bigint; maxBlockRange: bigint };

type RegistryLog = Awaited<ReturnType<typeof fetchLogs>>[number];

function fetchLogs(client: PublicClient, registry: Address, fromBlock: bigint, toBlock: bigint) {
  return client.getContractEvents({ address: registry, abi: sealRegistryAbi, fromBlock, toBlock, strict: true });
}

function rememberSeal(db: DatabaseSync, key: string): void {
  db.prepare("INSERT OR IGNORE INTO seals (seal_key, name, version) SELECT seal_key, name, version FROM publishes WHERE seal_key = ? LIMIT 1").run(key);
}

const guardianKinds = { Unsealed: "unsealed", Resealed: "resealed", Promoted: "promoted", Cleared: "cleared" } as const;

function applyLog(db: DatabaseSync, log: RegistryLog, at: string): void {
  const ref = log.transactionHash;
  if (log.eventName === "VerdictSubmitted") {
    appendEvent(db, { key: log.args.key, kind: "verdict", at, actor: log.args.detector.toLowerCase(), ref });
    db.prepare("UPDATE verdicts SET tx_hash = ? WHERE seal_key = ? AND detector_address = ?").run(ref, log.args.key, log.args.detector.toLowerCase());
  }
  if (log.eventName === "Sealed") {
    db.prepare("INSERT OR IGNORE INTO seals (seal_key, name, version) VALUES (?, ?, ?)").run(log.args.key, log.args.name, log.args.version);
    appendEvent(db, { key: log.args.key, kind: "sealed", at, actor: "registry", ref });
  }
  if (log.eventName === "Unsealed" || log.eventName === "Resealed" || log.eventName === "Promoted" || log.eventName === "Cleared") {
    if (log.eventName === "Promoted" || log.eventName === "Resealed") rememberSeal(db, log.args.key);
    appendEvent(db, { key: log.args.key, kind: guardianKinds[log.eventName], at, actor: log.args.guardian.toLowerCase(), ref });
  }
}

async function blockTimes(client: PublicClient, logs: RegistryLog[]): Promise<Map<bigint, string>> {
  const numbers = [...new Set(logs.map((log) => log.blockNumber))];
  const blocks = await Promise.all(numbers.map((blockNumber) => client.getBlock({ blockNumber })));
  return new Map(blocks.map((block) => [block.number, new Date(Number(block.timestamp) * 1000).toISOString()]));
}

async function pollRange(db: DatabaseSync, client: PublicClient, registry: Address, fromBlock: bigint, toBlock: bigint): Promise<number> {
  const logs = (await fetchLogs(client, registry, fromBlock, toBlock)).sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : Number(a.blockNumber - b.blockNumber),
  );
  const times = await blockTimes(client, logs);
  inTransaction(db, () => {
    for (const log of logs) applyLog(db, log, times.get(log.blockNumber) as string);
    setCursor(db, "chainBlock", String(toBlock));
  });
  return logs.length;
}

export async function pollChain(db: DatabaseSync, client: PublicClient, settings: ChainPollSettings, now: Date): Promise<number> {
  const processed = cursorOf(db, "chainBlock");
  const latest = await client.getBlockNumber({ cacheTime: 0 });
  let fromBlock = processed === null ? settings.startBlock : BigInt(processed) + 1n;
  let seen = 0;
  while (fromBlock <= latest) {
    const toBlock = fromBlock + settings.maxBlockRange - 1n < latest ? fromBlock + settings.maxBlockRange - 1n : latest;
    seen += await pollRange(db, client, settings.registry, fromBlock, toBlock);
    fromBlock = toBlock + 1n;
  }
  setCursor(db, "chainPolledAt", now.toISOString());
  return seen;
}
