import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { encodeFunctionResult, toFunctionSelector, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { productName, sealKeyOf, sealRegistryAbi, snapshotDigestOf, type SealedSnapshot } from "@cordon/shared";
import { buildContracts, freePort, startChain, submitVerdict, type LocalChain } from "../support/chain.ts";
import { deadUrl, makeTempDir, runGuard, serve, writeLockfile, type Env, type Running } from "../support/services.ts";

const name = "@cordondemo/colorkit";
const poisoned = sealKeyOf(name, "1.4.1");
const countSelector = toFunctionSelector("sealedKeyCount()");

let chain: LocalChain;
let registry: Address;
let liar: Running;
let snapshot: Running;
let lockfile: string;
const signerKey = generatePrivateKey();
const temps: string[] = [];

function temp(): string {
  const path = makeTempDir();
  temps.push(path);
  return path;
}

async function startLyingRpc(upstream: string): Promise<Running> {
  const port = await freePort();
  const emptyCount = encodeFunctionResult({ abi: sealRegistryAbi, functionName: "sealedKeyCount", result: 0n });
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const body = JSON.parse(Buffer.concat(chunks).toString()) as { id: number; method: string; params?: [{ data?: Hex }] };
    if (body.method === "eth_call" && body.params?.[0]?.data?.startsWith(countSelector)) {
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result: emptyCount }));
      return;
    }
    const forwarded = await fetch(upstream, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    response.writeHead(forwarded.status, { "content-type": "application/json" }).end(await forwarded.text());
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { url: `http://127.0.0.1:${port}`, stop: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

before(async () => {
  await buildContracts();
  chain = await startChain();
  const detectors = [await chain.funded(), await chain.funded(), await chain.funded()];
  registry = await chain.deployRegistry({ detectors, guardian: generatePrivateKey(), quorum: 2, disputeWindow: 3600, voteLifetime: 86400, maxSealsPerDay: 10 });
  await submitVerdict(chain.rpcUrl, registry, detectors[0] as Hex, name, "1.4.1");
  await submitVerdict(chain.rpcUrl, registry, detectors[1] as Hex, name, "1.4.1");
  liar = await startLyingRpc(chain.rpcUrl);
  const signed: SealedSnapshot = {
    product: productName,
    chainId: chain.chainId,
    registry,
    blockNumber: 1,
    generatedAt: new Date().toISOString(),
    entries: [{ key: poisoned, name, version: "1.4.1", status: "Sealed", sealedAt: new Date().toISOString() }],
    timelineHeads: [],
  };
  const account = privateKeyToAccount(signerKey);
  const signature = await account.signMessage({ message: { raw: snapshotDigestOf(signed) } });
  snapshot = await serve({ "/snapshot": JSON.stringify({ snapshot: signed, signer: account.address, signature }) });
  lockfile = writeLockfile(temp(), [{ path: "node_modules/@cordondemo/colorkit", name, version: "1.4.1" }]);
});

after(async () => {
  await liar?.stop();
  await snapshot?.stop();
  chain?.stop();
  for (const path of temps) rmSync(path, { recursive: true, force: true });
});

async function guardEnv(rpcUrl: string, cacheDir: string, snapshotUrl: string): Promise<Env> {
  return {
    CHAIN_ID: String(chain.chainId),
    RPC_URL: rpcUrl,
    REGISTRY_ADDRESS: registry,
    NPM_REGISTRY_URL: "http://127.0.0.1",
    GUARD_SNAPSHOT_URL: snapshotUrl,
    GUARD_SNAPSHOT_SIGNER: privateKeyToAccount(signerKey).address,
    GUARD_SNAPSHOT_MAX_AGE_SECONDS: "600",
    GUARD_CACHE_DIR: cacheDir,
  };
}

test("an RPC that hides every seal after the guard saw one is rejected and the signed snapshot still blocks", async () => {
  const cacheDir = temp();
  const honest = await runGuard(["check", "--lockfile", lockfile], await guardEnv(chain.rpcUrl, cacheDir, `${snapshot.url}/snapshot`));
  assert.equal(honest.report.listSource, "chain");
  assert.deepEqual(honest.report.blocked.map(({ key }) => key), [poisoned]);
  assert.deepEqual(honest.report.nonRegistrySources, []);
  assert.equal(honest.code, 1);
  const lied = await runGuard(["check", "--lockfile", lockfile], await guardEnv(liar.url, cacheDir, `${snapshot.url}/snapshot`));
  assert.match(lied.stderr, /chain list rejected: it drops 1 previously sealed version/);
  assert.equal(lied.report.listSource, "snapshot");
  assert.deepEqual(lied.report.blocked.map(({ key }) => key), [poisoned]);
  assert.equal(lied.code, 1);
});

test("with the RPC lying and the watcher gone, the version the guard saw sealed stays blocked", async () => {
  const cacheDir = temp();
  await runGuard(["check", "--lockfile", lockfile], await guardEnv(chain.rpcUrl, cacheDir, `${await deadUrl()}/snapshot`));
  const lied = await runGuard(["check", "--lockfile", lockfile], await guardEnv(liar.url, cacheDir, `${await deadUrl()}/snapshot`));
  assert.match(lied.stderr, /chain list rejected/);
  assert.deepEqual(lied.report.blocked.map(({ key }) => key), [poisoned]);
  assert.equal(lied.code, 1);
});

test("limit: a guard with no record of earlier seals cannot detect a lying RPC on its first read", async () => {
  const lied = await runGuard(["check", "--lockfile", lockfile], await guardEnv(liar.url, temp(), `${snapshot.url}/snapshot`));
  assert.equal(lied.report.listSource, "chain");
  assert.deepEqual(lied.report.blocked, []);
  assert.equal(lied.code, 0);
});
