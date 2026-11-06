import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createPublicClient, type WalletArkivClient } from "@arkiv-network/sdk";
import type { Hex } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { evidenceHashOf, evidenceSchema, replayTimelineSchema, scanResponseSchema, type Evidence } from "@cordon/shared";
import type { EvidenceReader, EvidenceWriter } from "./arkiv.ts";
import type { DockerRunner } from "./sandboxCanary.ts";
import { buildServer } from "./server.ts";
import { createSigner } from "./signer.ts";
import type { FetchLike } from "./staticScripts.ts";
import { arkivQueryTransport, mockRegistryTransport, newRegistryState, packFixture, testChain, type ArkivRow } from "./testSupport.ts";

const mockRegistryUrl = "http://localhost:4873";
const tarballUrl = `${mockRegistryUrl}/@cordondemo/colorkit/-/colorkit-1.4.1.tgz`;
const tarball = await packFixture({
  "package.json": JSON.stringify({ name: "@cordondemo/colorkit", version: "1.4.1", scripts: { postinstall: "node postinstall.js" } }),
  "postinstall.js": "await fetch(process.env.CANARY_SINK_URL);",
});
const scanBody = {
  name: "@cordondemo/colorkit",
  version: "1.4.1",
  tarballUrl,
  integrity: `sha512-${createHash("sha512").update(tarball).digest("base64")}`,
  publishedAt: "2026-11-06T10:00:00.000Z",
};

async function recorded(file: string) {
  return JSON.parse(await readFile(new URL(`./fixtures/${file}`, import.meta.url), "utf8")) as { queryUrl: string; response: unknown };
}

const osvVuln = await recorded("osvVulnMal20263465.json");
const npmTimes = await recorded("npmTimesTanstackReactRouter.json");

const networkEdge: FetchLike = async (input) => {
  const url = String(input);
  if (url === tarballUrl) return new Response(new Uint8Array(tarball));
  if (url === "https://api.osv.dev/v1/query") return Response.json({});
  const match = [osvVuln, npmTimes].find((item) => item.queryUrl === url);
  return match ? Response.json(match.response) : new Response("not found", { status: 404 });
};

const sinkReceivesEverything: DockerRunner = async (args) => ({
  code: 0,
  stdout: args[0] === "exec" ? JSON.stringify({ received: true, at: "2026-11-06T10:00:02.000Z" }) : args[0] === "network" ? "true" : "",
  stderr: "",
});

type ArkivEdge = { writer?: EvidenceWriter; reader?: EvidenceReader };

async function setup(fetchImpl: FetchLike = networkEdge, docker: DockerRunner = sinkReceivesEverything, arkiv: ArkivEdge = {}) {
  const evidenceDir = await mkdtemp(join(tmpdir(), "detectorsServer"));
  const state = newRegistryState();
  const keys = { staticScripts: generatePrivateKey(), sandboxCanary: generatePrivateKey(), advisoryFeed: generatePrivateKey() };
  const signer = createSigner({ chain: testChain, transport: mockRegistryTransport(state), registry: "0x00000000000000000000000000000000000000aa", keys, pendingDir: join(evidenceDir, "pending") });
  const app = buildServer({
    evidenceDir,
    mockRegistryUrl,
    osvApiUrl: "https://api.osv.dev",
    sandboxImage: "node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914",
    fetchImpl,
    docker,
    signer,
    arkivWriter: arkiv.writer,
    arkivReader: arkiv.reader,
  });
  return { app, state, evidenceDir };
}

test("scan stores evidence, votes for malicious results and serves the evidence back", async () => {
  const { app, state } = await setup();
  const response = await app.inject({ method: "POST", url: "/scan", payload: scanBody });
  assert.equal(response.statusCode, 200);
  const scan = scanResponseSchema.parse(response.json());
  const byDetector = Object.fromEntries(scan.verdicts.map((verdict) => [verdict.detector, verdict]));
  assert.equal(byDetector.staticScripts?.malicious, true);
  assert.equal(byDetector.sandboxCanary?.malicious, true);
  assert.equal(byDetector.advisoryFeed?.malicious, false);
  assert.deepEqual(scan.failures, []);
  assert.equal(state.sent.length, 2);
  const stored = await app.inject({ method: "GET", url: `/evidence/${byDetector.sandboxCanary?.evidenceHash}` });
  assert.equal(evidenceSchema.parse(stored.json()).detector, "sandboxCanary");
  assert.equal(stored.json().simulated, true);
});

test("tarballs outside the mock registry get no sandbox verdict", async () => {
  const outside = { ...scanBody, tarballUrl: "https://registry.npmjs.org/x.tgz" };
  const edge: FetchLike = async (input, init) => (String(input) === outside.tarballUrl ? new Response(new Uint8Array(tarball)) : networkEdge(input, init));
  const { app } = await setup(edge, async () => assert.fail("sandbox must not run"));
  const response = await app.inject({ method: "POST", url: "/scan", payload: outside });
  assert.deepEqual(scanResponseSchema.parse(response.json()).verdicts.map(({ detector }) => detector), ["staticScripts", "advisoryFeed"]);
});

test("an unreachable OSV is listed as a failure while staticScripts still reports and votes", async () => {
  const osvDown: FetchLike = async (input, init) => (String(input).startsWith("https://api.osv.dev") ? Promise.reject(new TypeError("fetch failed")) : networkEdge(input, init));
  const { app, state } = await setup(osvDown);
  const response = await app.inject({ method: "POST", url: "/scan", payload: scanBody });
  assert.equal(response.statusCode, 200);
  const scan = scanResponseSchema.parse(response.json());
  assert.deepEqual(scan.failures, [{ detector: "advisoryFeed", error: "fetch failed" }]);
  assert.deepEqual(scan.verdicts.map(({ detector, malicious }) => `${detector}:${malicious}`), ["staticScripts:true", "sandboxCanary:true"]);
  assert.equal(state.sent.length, 2);
});

test("a tarball fetch error fails only the detectors that need the tarball", async () => {
  const tarballGone: FetchLike = async (input, init) => (String(input) === tarballUrl ? new Response("gone", { status: 404 }) : networkEdge(input, init));
  const { app } = await setup(tarballGone);
  const response = await app.inject({ method: "POST", url: "/scan", payload: scanBody });
  assert.equal(response.statusCode, 200);
  const scan = scanResponseSchema.parse(response.json());
  assert.deepEqual(scan.failures.map(({ detector }) => detector), ["staticScripts", "sandboxCanary"]);
  assert.match(scan.failures[0]?.error ?? "", /status 404/);
  assert.deepEqual(scan.verdicts.map(({ detector }) => detector), ["advisoryFeed"]);
});

test("invalid bodies and unknown evidence answer with ApiError", async () => {
  const { app } = await setup();
  const bad = await app.inject({ method: "POST", url: "/scan", payload: { name: "x" } });
  assert.equal(bad.statusCode, 400);
  assert.match(bad.json().error, /version/);
  const missing = await app.inject({ method: "GET", url: `/evidence/0x${"1".repeat(64)}` });
  assert.equal(missing.statusCode, 404);
  assert.equal((await app.inject({ method: "GET", url: "/evidence/nothex" })).statusCode, 400);
});

test("replay returns a labelled timeline and never touches the chain", async () => {
  const { app, state } = await setup();
  const response = await app.inject({ method: "POST", url: "/replay", payload: { advisoryId: "MAL-2026-3465" } });
  const timeline = replayTimelineSchema.parse(response.json());
  assert.equal(timeline.replay, true);
  assert.equal(timeline.advisoryUrl, "https://osv.dev/vulnerability/MAL-2026-3465");
  assert.equal(state.sent.length, 0);
});

test("detectors and health", async () => {
  const { app } = await setup();
  const detectors = (await app.inject({ method: "GET", url: "/detectors" })).json();
  assert.equal(detectors.length, 3);
  assert.ok(detectors.every((detector: { simulated: boolean }) => detector.simulated));
  assert.deepEqual((await app.inject({ method: "GET", url: "/health" })).json(), { ok: true });
});

test("at most two sandbox scans run at once when many scans arrive together", async () => {
  let running = 0;
  let peak = 0;
  const slowSandbox: DockerRunner = async (args) => {
    if (args[0] !== "start") return sinkReceivesEverything(args, 0);
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 20));
    running -= 1;
    return sinkReceivesEverything(args, 0);
  };
  const { app } = await setup(networkEdge, slowSandbox);
  const responses = await Promise.all(Array.from({ length: 5 }, () => app.inject({ method: "POST", url: "/scan", payload: scanBody })));
  assert.deepEqual(responses.map((response) => response.statusCode), [200, 200, 200, 200, 200]);
  assert.equal(peak, 2);
});

const arkivOwner: Hex = "0xDe760446b5a7fFf40f17625f77d4165BaA013Fc9";
const arkivKey: Hex = `0x${"e1".repeat(32)}`;
const arkivTx: Hex = `0x${"7a".repeat(32)}`;

function arkivWriter(createEntity: (...args: unknown[]) => Promise<unknown>): EvidenceWriter {
  return { account: { address: arkivOwner }, createEntity: createEntity as WalletArkivClient["createEntity"] };
}

const arkivReader = (rows: ArkivRow[]) => createPublicClient({ transport: arkivQueryTransport(rows) });

async function waitForFile(file: string) {
  for (let attempt = 0; attempt < 100 && !existsSync(file); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  return JSON.parse(await readFile(file, "utf8"));
}

test("each evidence is published to Arkiv in the background and its reference is served", async () => {
  const published: Evidence[] = [];
  const writer = arkivWriter(async (_schema, values) => {
    published.push(evidenceSchema.parse(JSON.parse(new TextDecoder().decode((values as { body: Uint8Array }).body))));
    return { entityKey: arkivKey, txHash: arkivTx, expiresAt: 1n };
  });
  const { app, evidenceDir } = await setup(networkEdge, sinkReceivesEverything, { writer });
  const scan = scanResponseSchema.parse((await app.inject({ method: "POST", url: "/scan", payload: scanBody })).json());
  const hash = scan.verdicts[0]?.evidenceHash ?? "";
  assert.deepEqual(await waitForFile(join(evidenceDir, `${hash}.arkiv.json`)), { entityKey: arkivKey, txHash: arkivTx, owner: arkivOwner });
  assert.equal(published.length, 3);
  assert.deepEqual((await app.inject({ method: "GET", url: `/evidence/${hash}/arkiv` })).json(), { entityKey: arkivKey, txHash: arkivTx, owner: arkivOwner });
});

test("a failing Arkiv publish neither fails the scan nor stops the votes, and is logged once per evidence", async (t) => {
  const logged = t.mock.method(console, "error", () => undefined);
  const writer = arkivWriter(async () => Promise.reject(new Error("insufficient funds for gas")));
  const { app, state } = await setup(networkEdge, sinkReceivesEverything, { writer });
  const response = await app.inject({ method: "POST", url: "/scan", payload: scanBody });
  assert.equal(response.statusCode, 200);
  assert.equal(scanResponseSchema.parse(response.json()).verdicts.length, 3);
  assert.equal(state.sent.length, 2);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(logged.mock.callCount(), 3);
  assert.match(String(logged.mock.calls[0]?.arguments[0]), /arkiv publish failed .*insufficient funds for gas/);
});

test("an Arkiv publish that never answers does not delay the votes", async () => {
  const writer = arkivWriter(() => new Promise(() => undefined));
  const { app, state } = await setup(networkEdge, sinkReceivesEverything, { writer });
  const response = await app.inject({ method: "POST", url: "/scan", payload: scanBody });
  assert.equal(response.statusCode, 200);
  assert.equal(state.sent.length, 2);
});

test("evidence missing on disk is read from Arkiv, and unknown evidence is still 404", async () => {
  const evidence: Evidence = {
    name: "@cordondemo/colorkit",
    version: "1.4.1",
    detector: "advisoryFeed",
    integrity: scanBody.integrity,
    malicious: false,
    simulated: true,
    findings: [],
    advisoryUrl: null,
    observedAt: "2026-11-06T10:00:01.000Z",
  };
  const hash = evidenceHashOf(evidence);
  const { app } = await setup(networkEdge, sinkReceivesEverything, { reader: arkivReader([{ key: arkivKey, owner: arkivOwner, body: JSON.stringify(evidence, null, 2) }]) });
  const served = await app.inject({ method: "GET", url: `/evidence/${hash}` });
  assert.equal(served.statusCode, 200);
  assert.deepEqual(served.json(), evidence);
  assert.deepEqual((await app.inject({ method: "GET", url: `/evidence/${hash}/arkiv` })).json(), { entityKey: arkivKey, txHash: null, owner: arkivOwner });
  assert.equal((await app.inject({ method: "GET", url: `/evidence/0x${"1".repeat(64)}` })).statusCode, 404);
  assert.equal((await app.inject({ method: "GET", url: `/evidence/0x${"1".repeat(64)}/arkiv` })).statusCode, 404);
});

test("a detector listed as off chain keeps its evidence but sends no vote", async () => {
  const evidenceDir = await mkdtemp(join(tmpdir(), "detectorsOffChain"));
  const state = newRegistryState();
  const keys = { staticScripts: generatePrivateKey(), sandboxCanary: generatePrivateKey(), advisoryFeed: generatePrivateKey() };
  const signer = createSigner({ chain: testChain, transport: mockRegistryTransport(state), registry: "0x00000000000000000000000000000000000000aa", keys, pendingDir: join(evidenceDir, "pending") });
  const osvMalicious: FetchLike = async (input, init) =>
    String(input) === "https://api.osv.dev/v1/query" ? Response.json({ vulns: [{ id: "MAL-2026-3465", published: "2026-05-11T23:44:35Z", modified: "2026-05-12T07:09:29Z" }] }) : networkEdge(input, init);
  const app = buildServer({
    evidenceDir,
    mockRegistryUrl,
    osvApiUrl: "https://api.osv.dev",
    sandboxImage: "node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914",
    fetchImpl: osvMalicious,
    docker: sinkReceivesEverything,
    signer,
    arkivWriter: undefined,
    arkivReader: undefined,
    offChainDetectors: ["advisoryFeed"],
  });
  const scan = scanResponseSchema.parse((await app.inject({ method: "POST", url: "/scan", payload: scanBody })).json());
  assert.deepEqual(scan.verdicts.map(({ detector }) => detector).sort(), ["sandboxCanary", "staticScripts"]);
  assert.equal(state.sent.length, 2);
  assert.deepEqual(scan.failures, []);
  const stored = await readdir(evidenceDir);
  assert.equal(stored.filter((name) => name.endsWith(".json")).length, 3);
});
