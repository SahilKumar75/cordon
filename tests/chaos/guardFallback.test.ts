import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { after, before, test } from "node:test";
import { type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { productName, sealKeyOf, snapshotDigestOf, type SealedSnapshot, type SignedSnapshot } from "@cordon/shared";
import { buildContracts, startChain, submitVerdict, type LocalChain } from "../support/chain.ts";
import { deadUrl, eventually, makeTempDir, runGuard, serve, startWatcher, writeLockfile, type Env, type Running, type Service } from "../support/services.ts";

const name = "@cordondemo/colorkit";
const poisoned = sealKeyOf(name, "1.4.1");
const dayMs = 86_400_000;

let chain: LocalChain;
let registry: Address;
let watcher: Service;
let packuments: Running;
let lockfile: string;
const signerKey = generatePrivateKey();
const temps: string[] = [];

function temp(): string {
  const path = makeTempDir();
  temps.push(path);
  return path;
}

before(async () => {
  await buildContracts();
  chain = await startChain();
  const detectors = [await chain.funded(), await chain.funded(), await chain.funded()];
  registry = await chain.deployRegistry({ detectors, guardian: generatePrivateKey(), quorum: 2, disputeWindow: 3600, voteLifetime: 86400, maxSealsPerDay: 10 });
  await submitVerdict(chain.rpcUrl, registry, detectors[0] as Hex, name, "1.4.1");
  await submitVerdict(chain.rpcUrl, registry, detectors[1] as Hex, name, "1.4.1");
  watcher = await startWatcher(chain, registry, signerKey, generatePrivateKey(), temp());
  const listsPoisoned = async () => {
    const response = await fetch(`${watcher.url}/snapshot`);
    return response.ok && ((await response.json()) as SignedSnapshot).snapshot.entries.some((entry) => entry.key === poisoned);
  };
  await eventually(listsPoisoned, "the watcher snapshot to list the sealed version");
  const now = Date.now();
  const time = { "1.4.0": new Date(now - 30 * dayMs).toISOString(), "1.4.1": new Date(now - 3_600_000).toISOString() };
  packuments = await serve({ "/@cordondemo%2fcolorkit": JSON.stringify({ versions: { "1.4.0": {}, "1.4.1": {} }, time }) });
  lockfile = writeLockfile(temp(), [
    { path: "node_modules/@cordondemo/colorkit", name, version: "1.4.1" },
    { path: "node_modules/legacy/node_modules/@cordondemo/colorkit", name, version: "1.4.0" },
  ]);
});

after(async () => {
  await watcher?.stop();
  await packuments?.stop();
  chain?.stop();
  for (const path of temps) rmSync(path, { recursive: true, force: true });
});

async function guardEnv(overrides: Env): Promise<Env> {
  return {
    CHAIN_ID: String(chain.chainId),
    RPC_URL: await deadUrl(),
    REGISTRY_ADDRESS: registry,
    NPM_REGISTRY_URL: packuments.url,
    GUARD_SNAPSHOT_SIGNER: privateKeyToAccount(signerKey).address,
    GUARD_SNAPSHOT_MAX_AGE_SECONDS: "600",
    GUARD_CACHE_DIR: temp(),
    ...overrides,
  };
}

async function servedSnapshot(changes: Partial<SealedSnapshot>): Promise<Running> {
  const snapshot: SealedSnapshot = {
    product: productName,
    chainId: chain.chainId,
    registry,
    blockNumber: 1,
    generatedAt: new Date().toISOString(),
    entries: [{ key: poisoned, name, version: "1.4.1", status: "Sealed", sealedAt: new Date().toISOString() }],
    timelineHeads: [],
    ...changes,
  };
  const account = privateKeyToAccount(signerKey);
  const signature = await account.signMessage({ message: { raw: snapshotDigestOf(snapshot) } });
  return serve({ "/snapshot": JSON.stringify({ snapshot, signer: account.address, signature }) });
}

async function checkWithSnapshot(changes: Partial<SealedSnapshot>) {
  const server = await servedSnapshot(changes);
  const run = await runGuard(["check", "--lockfile", lockfile], await guardEnv({ GUARD_SNAPSHOT_URL: `${server.url}/snapshot`, GUARD_FALLBACK_MIN_AGE_DAYS: "7" }));
  await server.stop();
  return run;
}

function assertAgeFallback(run: Awaited<ReturnType<typeof runGuard>>, minAgeDays: number, placeholder: boolean): void {
  assert.equal(run.report.listSource, "none");
  assert.equal(run.report.snapshotAgeSeconds, null);
  assert.deepEqual(run.report.fallback, { minAgeDays, placeholder });
  assert.deepEqual(run.report.blocked, []);
  assert.deepEqual(run.report.tooYoung.map(({ version }) => version), ["1.4.1"]);
  assert.equal(run.report.outcome, "blocked");
  assert.equal(run.code, 1);
  assert.match(run.report.advice[0] ?? "", /Sealed list was not checked/);
}

test("chain unreachable: the guard blocks the sealed version from the watcher's signed snapshot", async () => {
  const cacheDir = temp();
  const run = await runGuard(["check", "--lockfile", lockfile], await guardEnv({ GUARD_SNAPSHOT_URL: `${watcher.url}/snapshot`, GUARD_CACHE_DIR: cacheDir }));
  assert.match(run.stderr, /chain unavailable/);
  assert.equal(run.report.listSource, "snapshot");
  assert.equal(run.report.fallback, null);
  assert.ok(typeof run.report.snapshotAgeSeconds === "number" && run.report.snapshotAgeSeconds <= 600);
  assert.deepEqual(run.report.blocked.map(({ key }) => key), [poisoned]);
  assert.equal(run.code, 1);
  const cached = await runGuard(["check", "--lockfile", lockfile], await guardEnv({ GUARD_SNAPSHOT_URL: `${await deadUrl()}/snapshot`, GUARD_CACHE_DIR: cacheDir }));
  assert.equal(cached.report.listSource, "snapshot");
  assert.deepEqual(cached.report.blocked.map(({ key }) => key), [poisoned]);
});

test("chain unreachable and no snapshot: the age fallback runs with the placeholder N", async () => {
  const run = await runGuard(["check", "--lockfile", lockfile], await guardEnv({}));
  assertAgeFallback(run, 3, true);
  assert.match(run.stderr, /placeholder of 3 days/);
});

test("stale snapshot: a correctly signed snapshot past the age limit is refused", async () => {
  const run = await checkWithSnapshot({ generatedAt: new Date(Date.now() - 3_600_000).toISOString() });
  assert.match(run.stderr, /older than GUARD_SNAPSHOT_MAX_AGE_SECONDS/);
  assertAgeFallback(run, 7, false);
});

test("replayed snapshot: one signed for another chain is refused", async () => {
  const run = await checkWithSnapshot({ chainId: 1 });
  assert.match(run.stderr, /chainId 1 does not match CHAIN_ID/);
  assertAgeFallback(run, 7, false);
});

test("replayed snapshot: one signed for another registry is refused", async () => {
  const run = await checkWithSnapshot({ registry: privateKeyToAccount(generatePrivateKey()).address });
  assert.match(run.stderr, /registry does not match REGISTRY_ADDRESS/);
  assertAgeFallback(run, 7, false);
});
