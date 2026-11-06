import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createPublicClient, http, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { sealKeyOf, sealRegistryAbi, type ScanResponse } from "@bulkhead/shared";
import { buildContracts, freePort, repoRoot, startChain, type LocalChain } from "../support/chain.ts";
import { deadUrl, detectorsServer, makeTempDir, serve, startService, type Running, type Service } from "../support/services.ts";

const name = "@bulkheaddemo/colorkit";
const version = "1.4.1";
const demoFolder = join(repoRoot, "demo", "poisonedPackage");
const tarballPath = join(demoFolder, "dist", "bulkheaddemo-colorkit-1.4.1.tgz");

let chain: LocalChain;
let registry: Address;
let detectors: Service;
let tarballs: Running;
let staticScriptsKey: Hex;
const evidenceDir = makeTempDir();

function demoTarball(): Buffer {
  if (!existsSync(tarballPath)) {
    const packed = spawnSync("sh", [join(demoFolder, "pack.sh")], { stdio: "ignore" });
    if (packed.status !== 0) throw new Error(`pack.sh exited with ${packed.status}`);
  }
  return readFileSync(tarballPath);
}

before(async () => {
  await buildContracts();
  chain = await startChain();
  staticScriptsKey = await chain.funded();
  const keys = [staticScriptsKey, await chain.funded(), await chain.funded()];
  registry = await chain.deployRegistry({ detectors: keys, guardian: generatePrivateKey(), quorum: 2, disputeWindow: 3600, maxSealsPerDay: 10 });
  tarballs = await serve({ "/colorkit.tgz": demoTarball() });
  const port = await freePort();
  detectors = await startService(
    detectorsServer,
    {
      CHAIN_ID: String(chain.chainId),
      RPC_URL: chain.rpcUrl,
      EXPLORER_URL: "http://127.0.0.1/explorer",
      NATIVE_SYMBOL: "ETH",
      REGISTRY_ADDRESS: registry,
      STATIC_SCRIPTS_PRIVATE_KEY: keys[0] as Hex,
      SANDBOX_CANARY_PRIVATE_KEY: keys[1] as Hex,
      ADVISORY_FEED_PRIVATE_KEY: keys[2] as Hex,
      DETECTORS_PORT: String(port),
      EVIDENCE_DIR: evidenceDir,
      SANDBOX_IMAGE: `node@sha256:${"0".repeat(64)}`,
      OSV_API_URL: await deadUrl(),
    },
    port,
  );
});

after(async () => {
  await detectors?.stop();
  await tarballs?.stop();
  chain?.stop();
  rmSync(evidenceDir, { recursive: true, force: true });
});

async function scan(): Promise<ScanResponse> {
  const integrity = `sha512-${createHash("sha512").update(demoTarball()).digest("base64")}`;
  const body = { name, version, tarballUrl: `${tarballs.url}/colorkit.tgz`, integrity, publishedAt: new Date().toISOString() };
  const response = await fetch(`${detectors.url}/scan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal(response.status, 200, await response.clone().text());
  return (await response.json()) as ScanResponse;
}

test("with OSV unreachable the scan lists advisoryFeed as failed and staticScripts still votes", async () => {
  const result = await scan();
  assert.deepEqual(result.failures.map(({ detector }) => detector), ["advisoryFeed"]);
  assert.deepEqual(result.verdicts.map(({ detector }) => detector), ["staticScripts"]);
  const [verdict] = result.verdicts;
  assert.equal(verdict?.malicious, true);
  assert.match(verdict?.txHash ?? "", /^0x[0-9a-f]{64}$/);
  assert.ok(existsSync(join(evidenceDir, `${verdict?.evidenceHash}.json`)));
  const client = createPublicClient({ chain: foundry, transport: http(chain.rpcUrl) });
  const read = { address: registry, abi: sealRegistryAbi } as const;
  const key = sealKeyOf(name, version);
  assert.equal(await client.readContract({ ...read, functionName: "hasVoted", args: [key, privateKeyToAccount(staticScriptsKey).address] }), true);
  assert.equal(await client.readContract({ ...read, functionName: "isSealed", args: [key] }), false);
});
