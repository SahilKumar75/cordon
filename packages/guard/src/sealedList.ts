import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readJson } from "./lockfile.ts";
import { dirname, join } from "node:path";
import { createPublicClient, http, verifyMessage, type Address, type Transport } from "viem";
import { sealRegistryAbi, signedSnapshotSchema, snapshotDigestOf, type Hex32, type ListSource, type SignedSnapshot } from "@bulkhead/shared";

export type ListSettings = {
  chainId: number | null;
  rpcUrl: string | null;
  registryAddress: Address | null;
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
const pageSize = 500n;
const cacheFileName = "sealedSnapshot.json";

async function loadFromChain(settings: ListSettings, registry: Address, chainId: number): Promise<Set<Hex32>> {
  const transport = settings.transport ?? http(settings.rpcUrl ?? undefined, { retryCount: 0, timeout: 10_000 });
  const client = createPublicClient({ transport });
  const remoteChainId = await client.getChainId();
  if (remoteChainId !== chainId) throw new Error(`RPC reports chain ${remoteChainId}, expected ${chainId}`);
  const total = await client.readContract({ address: registry, abi: sealRegistryAbi, functionName: "sealedKeyCount" });
  const keys = new Set<Hex32>();
  for (let offset = 0n; offset < total; offset += pageSize) {
    const [page, statuses] = await client.readContract({
      address: registry,
      abi: sealRegistryAbi,
      functionName: "sealedKeys",
      args: [offset, pageSize],
    });
    page.forEach((key, index) => statuses[index] === sealedStatus && keys.add(key.toLowerCase() as Hex32));
  }
  return keys;
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
  if (snapshotAgeOf(signed, settings) > settings.snapshotMaxAgeSeconds) return "snapshot is older than GUARD_SNAPSHOT_MAX_AGE_SECONDS";
  return null;
}

function snapshotAgeOf(signed: SignedSnapshot, settings: ListSettings): number {
  return Math.floor((settings.now().getTime() - Date.parse(signed.snapshot.generatedAt)) / 1000);
}

async function fetchSnapshot(settings: ListSettings): Promise<unknown> {
  const response = await settings.fetchFn(settings.snapshotUrl ?? "");
  if (!response.ok) throw new Error(`snapshot request answered ${response.status}`);
  return response.json();
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

function cachePath(settings: ListSettings): string | null {
  return settings.cacheDir ? join(settings.cacheDir, cacheFileName) : null;
}

async function loadSnapshot(settings: ListSettings): Promise<SignedSnapshot | null> {
  const cache = cachePath(settings);
  if (settings.snapshotUrl) {
    const fetched = await fetchSnapshot(settings).catch((error: Error) => {
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

function snapshotKeys(signed: SignedSnapshot): Set<Hex32> {
  return new Set(signed.snapshot.entries.filter((entry) => entry.status === "Sealed").map((entry) => entry.key as Hex32));
}

export async function loadSealedList(settings: ListSettings): Promise<SealedList> {
  const { registryAddress, chainId } = settings;
  if (registryAddress && chainId !== null && (settings.transport || settings.rpcUrl)) {
    const keys = await loadFromChain(settings, registryAddress, chainId).catch((error: Error) => {
      settings.warn(`chain unavailable: ${error.message.split("\n")[0]}`);
      return null;
    });
    if (keys) return { source: "chain", keys, snapshotAgeSeconds: null };
  }
  const signed = await loadSnapshot(settings);
  if (signed) return { source: "snapshot", keys: snapshotKeys(signed), snapshotAgeSeconds: snapshotAgeOf(signed, settings) };
  return { source: "none", keys: new Set(), snapshotAgeSeconds: null };
}
