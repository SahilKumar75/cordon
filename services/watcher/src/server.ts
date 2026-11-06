import type { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import Fastify, { type FastifyError } from "fastify";
import { createPublicClient, http, type Address, type Hex, type LocalAccount } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  addressSchema,
  sealRegistryAbi,
  defineAppChain,
  hex32Schema,
  signedGuardReportSchema,
  type SignedSnapshot,
} from "@cordon/shared";
import { pollChain, type ChainPollSettings } from "./chainPoller.ts";
import { publishSnapshot, type SnapshotSettings } from "./publisher.ts";
import { pollRegistry } from "./registryPoller.ts";
import { acceptReport, ReportRefused, serviceStatuses } from "./reports.ts";
import { attestations, rescanSuspects, runScheduler } from "./scheduler.ts";
import { openDatabase, stopwatches, stopwatchOf, verifiedTimelineOf } from "./timeline.ts";

export type WatcherDeps = {
  db: DatabaseSync;
  demoRegistry: boolean;
  reporters: Set<string>;
  dashboardOrigin: string;
  latestSnapshot: () => SignedSnapshot | null;
  now: () => Date;
};

function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

function keyParam(params: unknown): string {
  const parsed = hex32Schema.safeParse((params as { key?: unknown }).key);
  if (!parsed.success) throw httpError(400, "key must be a lowercase 32 byte hex seal key");
  return parsed.data;
}

function signedReportOf(body: unknown) {
  const parsed = signedGuardReportSchema.safeParse(body);
  if (parsed.success) return parsed.data;
  const malformedReport = parsed.error.issues.some((issue) => issue.path[0] === "report");
  if (malformedReport) throw httpError(400, parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  throw httpError(401, "report must carry a signer address and signature");
}

export function buildServer(deps: WatcherDeps) {
  const app = Fastify({ logger: false });

  app.addHook("onRequest", async (request, reply) => {
    if (request.headers.origin !== deps.dashboardOrigin) return;
    reply.header("access-control-allow-origin", deps.dashboardOrigin).header("vary", "origin");
    if (request.method === "OPTIONS") {
      return reply.header("access-control-allow-methods", "GET, POST").header("access-control-allow-headers", "content-type").code(204).send();
    }
  });

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const statusCode = error instanceof ReportRefused ? 401 : (error.statusCode ?? 500);
    return reply.code(statusCode).send({ error: error.message });
  });

  app.get("/snapshot", async (_request, reply) => deps.latestSnapshot() ?? reply.code(503).send({ error: "no snapshot has been signed yet" }));
  app.get("/attestations", async () => attestations(deps.db, deps.demoRegistry));
  app.get("/timeline/:key", async (request) => verifiedTimelineOf(deps.db, keyParam(request.params)));
  app.get("/stopwatch", async () => stopwatches(deps.db, deps.demoRegistry));
  app.get("/stopwatch/:key", async (request, reply) => {
    const key = keyParam(request.params);
    return stopwatchOf(deps.db, key, deps.demoRegistry) ?? reply.code(404).send({ error: `no publish recorded for ${key}` });
  });
  app.post("/reports", async (request) => acceptReport(deps.db, signedReportOf(request.body), deps.reporters, deps.now()));
  app.get("/services", async () => serviceStatuses(deps.db));
  app.get("/health", async () => ({ ok: true }));

  return app;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

function originOf(url: string | undefined): string | null {
  return url ? new URL(url).origin : null;
}

type Step = [string, () => Promise<unknown>];

function scheduleTicks(steps: Step[], intervalMs: number): void {
  const tick = async () => {
    for (const [name, step] of steps) {
      await step().catch((error: unknown) => console.error(`${name} failed: ${error instanceof Error ? error.message : String(error)}`));
    }
    setTimeout(tick, intervalMs);
  };
  void tick();
}

async function main() {
  const registry = addressSchema.parse(required("REGISTRY_ADDRESS")) as Address;
  const chainId = Number(required("CHAIN_ID"));
  const rpcUrl = required("RPC_URL");
  const registryUrl = required("NPM_REGISTRY_URL").replace(/\/$/, "");
  const detectorsUrl = required("DETECTORS_URL").replace(/\/$/, "");
  const snapshotPath = required("SNAPSHOT_PATH");
  const account: LocalAccount = privateKeyToAccount(required("SNAPSHOT_SIGNER_PRIVATE_KEY") as Hex);
  const chain = defineAppChain({ id: chainId, rpcUrl, explorerUrl: required("EXPLORER_URL"), nativeSymbol: required("NATIVE_SYMBOL") });
  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  const db = openDatabase(required("DATABASE_PATH"));
  const startBlock = BigInt(process.env.REGISTRY_START_BLOCK || 0);
  const chainSettings: ChainPollSettings = { registry, startBlock, maxBlockRange: 2000n };
  const voteLifetimeSeconds = Number(await client.readContract({ address: registry, abi: sealRegistryAbi, functionName: "voteLifetime" }));
  const snapshotSettings: SnapshotSettings = { chainId, registry, startBlock, voteLifetimeSeconds };
  const reportScanFailure = (failure: string) => console.error(`scan failure: ${failure}`);
  let latest: SignedSnapshot | null = null;

  scheduleTicks(
    [
      ["registry poller", () => pollRegistry(db, registryUrl, fetch)],
      ["scheduler", () => runScheduler(db, detectorsUrl, fetch, reportScanFailure)],
      ["rescan", () => rescanSuspects(db, detectorsUrl, fetch, { voteLifetimeSeconds, now: new Date() }, reportScanFailure)],
      ["chain poller", () => pollChain(db, client, chainSettings, new Date())],
      ["publisher", async () => (latest = await publishSnapshot(db, snapshotSettings, account, snapshotPath))],
    ],
    Number(required("POLL_INTERVAL_SECONDS")) * 1000,
  );

  const app = buildServer({
    db,
    demoRegistry: originOf(registryUrl) === originOf(process.env.MOCK_REGISTRY_URL),
    reporters: new Set(required("GUARD_REPORTER_ADDRESSES").split(",").map((address) => address.trim().toLowerCase())),
    dashboardOrigin: originOf(required("DASHBOARD_ORIGIN")) as string,
    latestSnapshot: () => latest,
    now: () => new Date(),
  });
  const port = Number(required("WATCHER_PORT"));
  await app.listen({ port, host: "127.0.0.1" });
  console.log(`watcher listening on 127.0.0.1:${port}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
