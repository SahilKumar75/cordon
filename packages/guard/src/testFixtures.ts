import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { custom, decodeFunctionData, encodeFunctionResult, type Address } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";
import { productName, sealKeyOf, sealRegistryAbi, snapshotDigestOf, type Hex32, type SealedSnapshot, type SignedSnapshot } from "@bulkhead/shared";
import type { GuardSettings } from "./check.ts";
import type { Packument } from "./registry.ts";

export const now = new Date("2026-11-06T12:00:00.000Z");
export const chainId = 84532;
export const registryAddress: Address = "0x00000000000000000000000000000000000000aa";
export const sealedName = "@bulkheaddemo/colorkit";
export const sealedVersion = "1.4.1";
export const sealedKey = sealKeyOf(sealedName, sealedVersion);

export function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "guardTest"));
}

export function writeLockfile(dir: string, packages: Record<string, object>, lockfileVersion = 3, fileName = "package-lock.json"): string {
  const path = join(dir, fileName);
  writeFileSync(path, JSON.stringify({ name: "app", lockfileVersion, packages: { "": { name: "app" }, ...packages } }));
  return path;
}

export function writeInstalled(dir: string, path: string, manifest: { name: string; version: string }): void {
  mkdirSync(join(dir, path), { recursive: true });
  writeFileSync(join(dir, path, "package.json"), JSON.stringify(manifest));
}

export type FetchCall = { url: string; init?: RequestInit };

export function stubFetch(routes: Record<string, unknown>, calls: FetchCall[] = []): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (!(url in routes)) return new Response("not found", { status: 404 });
    return Response.json(routes[url]);
  }) as typeof fetch;
}

export function registryRoutes(registryUrl: string, packuments: Record<string, Packument>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(packuments).map(([name, packument]) => [`${registryUrl}/${name.replace("/", "%2f")}`, packument]));
}

export function daysAgo(days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

export function chainTransport(seals: { key: Hex32; status: number }[], options: { remoteChainId?: number; calls?: string[] } = {}) {
  return custom(
    {
      request: async ({ method, params }: { method: string; params?: unknown }) => {
        options.calls?.push(method);
        if (method === "eth_chainId") return `0x${(options.remoteChainId ?? chainId).toString(16)}`;
        if (method !== "eth_call") throw new Error(`unexpected ${method}`);
        const [call] = params as [{ data: `0x${string}` }];
        const decoded = decodeFunctionData({ abi: sealRegistryAbi, data: call.data });
        if (decoded.functionName === "sealedKeyCount") {
          return encodeFunctionResult({ abi: sealRegistryAbi, functionName: "sealedKeyCount", result: BigInt(seals.length) });
        }
        if (decoded.functionName !== "sealedKeys") throw new Error(`unexpected ${decoded.functionName}`);
        const [offset, limit] = decoded.args as readonly [bigint, bigint];
        const page = seals.slice(Number(offset), Number(offset + limit));
        return encodeFunctionResult({
          abi: sealRegistryAbi,
          functionName: "sealedKeys",
          result: [page.map((seal) => seal.key), page.map((seal) => seal.status)],
        });
      },
    },
    { retryCount: 0 },
  );
}

export const failingTransport = custom(
  {
    request: async () => {
      throw new Error("connection refused");
    },
  },
  { retryCount: 0 },
);

export function snapshotOf(overrides: Partial<SealedSnapshot> = {}): SealedSnapshot {
  return {
    product: productName,
    chainId,
    registry: registryAddress,
    blockNumber: 42,
    generatedAt: new Date(now.getTime() - 60_000).toISOString(),
    entries: [{ name: sealedName, version: sealedVersion, key: sealedKey, status: "Sealed", sealedAt: now.toISOString() }],
    timelineHeads: [],
    ...overrides,
  };
}

export async function sign(account: PrivateKeyAccount, snapshot: SealedSnapshot): Promise<SignedSnapshot> {
  const signature = await account.signMessage({ message: { raw: snapshotDigestOf(snapshot) } });
  return { snapshot, signer: account.address, signature };
}

export function settingsFor(lockfile: string, overrides: Partial<GuardSettings> = {}): GuardSettings & { warnings: string[]; fetchCalls: FetchCall[] } {
  const warnings: string[] = [];
  const fetchCalls: FetchCall[] = [];
  return {
    lockfile,
    service: null,
    fallbackMinAgeDays: null,
    minAgeDays: 0,
    registryUrl: null,
    allowGitDependencies: false,
    chainId,
    rpcUrl: null,
    registryAddress,
    snapshotUrl: null,
    snapshotSigner: null,
    snapshotMaxAgeSeconds: 600,
    cacheDir: null,
    reportUrl: null,
    reporterPrivateKey: null,
    assumeInstalled: false,
    fetchFn: stubFetch({}, fetchCalls),
    now: () => now,
    warn: (message) => warnings.push(message),
    warnings,
    fetchCalls,
    ...overrides,
  };
}
