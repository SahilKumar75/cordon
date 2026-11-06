import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readJson } from "./lockfile.ts";
import { dirname, join } from "node:path";
import { createPublicClient, http, verifyMessage, type Address, type PublicClient, type Transport } from "viem";
import { sealRegistryAbi, signedSnapshotSchema, snapshotDigestOf, type Hex32, type ListSource, type SignedSnapshot } from "@cordon/shared";

export type ListSettings = {
  chainId: number | null;
  rpcUrl: string | null;
  registryAddress: Address | null;
  registryStartBlock?: number | null;
  snapshotUrl: string | null;
  snapshotSigner: Address | null;
  snapshotMaxAgeSeconds: number | null;
  cacheDir: string | null;
  transport?: Transport;
  fetchFn: typeof fetch;
  now: () => Date;
  warn: (message: string) => void;
};

export type SealedList = { source: ListSource; keys: Set<Hex32>; snapshotAgeSeconds: number | null };

const sealedStatus = 1;
const unsealedStatus = 2;
const pageSize = 500n;
const cacheFileName = "sealedSnapshot.json";
const knownFileName = "knownSealed.json";
const clockSkewSeconds = 60;

type ChainRead = { client: PublicClient; sealed: Set<Hex32>; unsealed: Set<Hex32> };

async function readChain(settings: ListSettings, registry: Address, chainId: number): Promise<ChainRead> {
  const transport = settings.transport ?? http(settings.rpcUrl ?? undefined, { retryCount: 0, timeout: 10_000 });
  const client = createPublicClient({ transport });
  const remoteChainId = await client.getChainId();
  if (remoteChainId !== chainId) throw new Error(`RPC reports chain ${remoteChainId}, expected ${chainId}`);
  const total = await client.readContract({ address: registry, abi: sealRegistryAbi, functionName: "sealedKeyCount" });
  const sealed = new Set<Hex32>();
  const unsealed = new Set<Hex32>();
  for (let offset = 0n; offset < total; offset += pageSize) {
    const [page, statuses] = await client.readContract({
      address: registry,
      abi: sealRegistryAbi,
      functionName: "sealedKeys",
      args: [offset, pageSize],
    });
    page.forEach((key, index) => {
      if (statuses[index] === sealedStatus) sealed.add(key.toLowerCase() as Hex32);
      if (statuses[index] === unsealedStatus) unsealed.add(key.toLowerCase() as Hex32);
    });
  }
  return { client, sealed, unsealed };
}

async function hasUnsealEvent(read: ChainRead, registry: Address, key: Hex32, fromBlock: number): Promise<boolean> {
  if (!read.unsealed.has(key)) return false;
  const logs = await read.client
    .getContractEvents({ address: registry, abi: sealRegistryAbi, eventName: "Unsealed", args: { key }, fromBlock: BigInt(fromBlock) })
    .catch(() => []);
  return logs.length > 0;
}

async function chainList(settings: ListSettings, known: Set<Hex32>): Promise<SealedList | null> {
  const { registryAddress, chainId } = settings;
  if (!registryAddress || chainId === null || !(settings.transport || settings.rpcUrl)) return null;
  const read = await readChain(settings, registryAddress, chainId).catch((error: Error) => {
    settings.warn(`chain unavailable: ${error.message.split("\n")[0]}`);
    return null;
  });
  if (!read) return null;
  const dropped = [...known].filter((key) => !read.sealed.has(key));
  const explained = await Promise.all(dropped.map((key) => hasUnsealEvent(read, registryAddress, key, settings.registryStartBlock ?? 0)));
  const unexplained = dropped.filter((_, index) => !explained[index]);
  if (unexplained.length) {
    settings.warn(
      `chain list rejected: it drops ${unexplained.length} previously sealed version(s) with no matching Unsealed event (${unexplained.join(", ")}), so the guard uses the signed snapshot and keeps them blocked`,
    );
    return null;
  }
  return { source: "chain", keys: read.sealed, snapshotAgeSeconds: null };
}

async function snapshotProblem(signed: SignedSnapshot, settings: ListSettings): Promise<string | null> {
  const { snapshot } = signed;
  if (!settings.snapshotSigner || settings.snapshotMaxAgeSeconds === null) return "snapshot signer or max age not configured";
  if (signed.signer.toLowerCase() !== settings.snapshotSigner.toLowerCase()) return "snapshot signer is not GUARD_SNAPSHOT_SIGNER";
  const digest = snapshotDigestOf(snapshot);
  const valid = await verifyMessage({ address: settings.snapshotSigner, message: { raw: digest }, signature: signed.signature as Hex32 });
  if (!valid) return "snapshot signature does not verify";
  if (snapshot.chainId !== settings.chainId) return `snapshot chainId ${snapshot.chainId} does not match CHAIN_ID`;
  if (snapshot.registry.toLowerCase() !== settings.registryAddress?.toLowerCase()) return "snapshot registry does not match REGISTRY_ADDRESS";
  const generatedAt = Date.parse(snapshot.generatedAt);
  if (generatedAt > settings.now().getTime() + clockSkewSeconds * 1000) return "snapshot generatedAt is in the future";
  if (snapshotAgeOf(signed, settings) > settings.snapshotMaxAgeSeconds) return "snapshot is older than GUARD_SNAPSHOT_MAX_AGE_SECONDS";
  return null;
}

function snapshotAgeOf(signed: SignedSnapshot, settings: ListSettings): number {
  return Math.max(0, Math.floor((settings.now().getTime() - Date.parse(signed.snapshot.generatedAt)) / 1000));
}

async function acceptSnapshot(raw: unknown, origin: string, settings: ListSettings): Promise<SignedSnapshot | null> {
  const parsed = signedSnapshotSchema.safeParse(raw);
  if (!parsed.success) {
    settings.warn(`${origin} snapshot rejected: malformed`);
    return null;
  }
  const problem = await snapshotProblem(parsed.data, settings).catch(() => "snapshot signature is malformed");
  if (problem) settings.warn(`${origin} snapshot rejected: ${problem}`);
  return problem ? null : parsed.data;
}

async function loadSnapshot(settings: ListSettings): Promise<SignedSnapshot | null> {
  const cache = settings.cacheDir ? join(settings.cacheDir, cacheFileName) : null;
  if (settings.snapshotUrl) {
    const fetched = await settings
      .fetchFn(settings.snapshotUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`snapshot request answered ${response.status}`);
        return response.json() as Promise<unknown>;
      })
      .catch((error: Error) => {
        settings.warn(`snapshot fetch failed: ${error.message}`);
        return null;
      });
    const accepted = fetched === null ? null : await acceptSnapshot(fetched, "fetched", settings);
    if (accepted && cache) {
      mkdirSync(dirname(cache), { recursive: true });
      writeFileSync(cache, JSON.stringify(accepted));
    }
    if (accepted) return accepted;
  }
  if (!cache || !existsSync(cache)) return null;
  return acceptSnapshot(readJson(cache), "cached", settings);
}

function knownPath(settings: ListSettings): string | null {
  return settings.cacheDir ? join(settings.cacheDir, knownFileName) : null;
}

function readKnown(settings: ListSettings): Set<Hex32> {
  const path = knownPath(settings);
  const stored = path ? (readJson(path) as { chainId?: number; registry?: string; keys?: Hex32[] } | null) : null;
  const sameRegistry = stored?.chainId === settings.chainId && stored?.registry?.toLowerCase() === settings.registryAddress?.toLowerCase();
  return new Set(sameRegistry ? (stored?.keys ?? []) : []);
}

function writeKnown(settings: ListSettings, keys: Set<Hex32>): void {
  const path = knownPath(settings);
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ chainId: settings.chainId, registry: settings.registryAddress, keys: [...keys] }));
}

async function snapshotList(settings: ListSettings, known: Set<Hex32>): Promise<SealedList> {
  const signed = await loadSnapshot(settings);
  const entries = signed?.snapshot.entries ?? [];
  const keys = new Set(entries.filter((entry) => entry.status === "Sealed").map((entry) => entry.key as Hex32));
  const unsealed = new Set(entries.filter((entry) => entry.status === "Unsealed").map((entry) => entry.key as Hex32));
  const kept = [...known].filter((key) => !keys.has(key) && !unsealed.has(key));
  if (kept.length) settings.warn(`${kept.length} previously sealed version(s) missing from the available list stay blocked: ${kept.join(", ")}`);
  kept.forEach((key) => keys.add(key));
  if (!signed) return { source: "none", keys, snapshotAgeSeconds: null };
  return { source: "snapshot", keys, snapshotAgeSeconds: snapshotAgeOf(signed, settings) };
}

export async function loadSealedList(settings: ListSettings): Promise<SealedList> {
  const known = readKnown(settings);
  const list = (await chainList(settings, known)) ?? (await snapshotList(settings, known));
  writeKnown(settings, list.keys);
  return list;
}
