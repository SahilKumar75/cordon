import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import Fastify, { type FastifyError } from "fastify";
import { http, type Hex } from "viem";
import { z, ZodError } from "zod";
import {
  addressSchema,
  defineAppChain,
  detectorIds,
  evidenceHashOf,
  hex32Schema,
  replayRequestSchema,
  scanRequestSchema,
  sealKeyOf,
  type DetectorId,
  type Evidence,
  type ScanResponse,
  type Verdict,
} from "@cordon/shared";
import { replayAdvisory, scanAdvisories } from "./advisoryFeed.ts";
import { isSandboxEligible, runDocker, scanSandbox, type DockerRunner } from "./sandboxCanary.ts";
import { createSigner } from "./signer.ts";
import { downloadTarball, scanStatic, type FetchLike } from "./staticScripts.ts";

export type DetectorsDeps = {
  evidenceDir: string;
  mockRegistryUrl: string | undefined;
  osvApiUrl: string;
  sandboxImage: string;
  fetchImpl: FetchLike;
  docker: DockerRunner;
  signer: ReturnType<typeof createSigner>;
  offChainDetectors?: DetectorId[];
};

const evidenceParamsSchema = z.object({ evidenceHash: hex32Schema });
const retryIntervalMs = 60_000;

export const maxSandboxScans = 2;

export function buildServer(deps: DetectorsDeps) {
  const app = Fastify({ logger: false });
  let sandboxesRunning = 0;
  const sandboxQueue: (() => void)[] = [];
  const inSandboxSlot = async <T>(run: () => Promise<T>): Promise<T> => {
    if (sandboxesRunning >= maxSandboxScans) await new Promise<void>((resolve) => sandboxQueue.push(resolve));
    sandboxesRunning += 1;
    try {
      return await run();
    } finally {
      sandboxesRunning -= 1;
      sandboxQueue.shift()?.();
    }
  };

  app.setErrorHandler((error: FastifyError | ZodError, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: error.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ") });
    }
    return reply.code(error.statusCode ?? 500).send({ error: error.message });
  });

  app.post("/scan", async (request): Promise<ScanResponse> => {
    const scan = scanRequestSchema.parse(request.body);
    const tarball = downloadTarball(scan, deps.fetchImpl);
    const sandbox = isSandboxEligible(scan.tarballUrl, deps.mockRegistryUrl);
    const runs: [DetectorId, Promise<Evidence>][] = [
      ["staticScripts", tarball.then((bytes) => scanStatic(scan, bytes))],
      ...(sandbox ? [["sandboxCanary", tarball.then((bytes) => inSandboxSlot(() => scanSandbox(scan, bytes, deps.sandboxImage, deps.docker)))] as [DetectorId, Promise<Evidence>]] : []),
      ["advisoryFeed", scanAdvisories(scan, deps.osvApiUrl, deps.fetchImpl)],
    ];
    const settled = await Promise.allSettled(runs.map(([, run]) => run));
    const evidences = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    const failures = settled.flatMap((result, index) =>
      result.status === "rejected" ? [{ detector: runs[index]?.[0] as DetectorId, error: result.reason instanceof Error ? result.reason.message : String(result.reason) }] : [],
    );
    await mkdir(deps.evidenceDir, { recursive: true });
    await Promise.all(evidences.map((evidence) => writeFile(join(deps.evidenceDir, `${evidenceHashOf(evidence)}.json`), JSON.stringify(evidence, null, 2))));
    const verdicts: Verdict[] = [];
    const onChain = evidences.filter((evidence) => !deps.offChainDetectors?.includes(evidence.detector));
    for (const evidence of onChain) verdicts.push(await deps.signer.submit(evidence));
    return { name: scan.name, version: scan.version, key: sealKeyOf(scan.name, scan.version), verdicts, failures };
  });

  app.post("/replay", async (request) => replayAdvisory(replayRequestSchema.parse(request.body).advisoryId, deps.osvApiUrl, deps.fetchImpl));

  app.get("/evidence/:evidenceHash", async (request, reply) => {
    const { evidenceHash } = evidenceParamsSchema.parse(request.params);
    const file = join(deps.evidenceDir, `${evidenceHash}.json`);
    if (!existsSync(file)) return reply.code(404).send({ error: `no evidence with hash ${evidenceHash}` });
    return JSON.parse(await readFile(file, "utf8"));
  });

  app.get("/detectors", async () => deps.signer.detectors());

  app.get("/health", async () => ({ ok: true }));

  return app;
}

const privateKeySchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((value) => value as Hex);

const envSchema = z.object({
  CHAIN_ID: z.coerce.number().int().positive(),
  RPC_URL: z.string().url(),
  EXPLORER_URL: z.string().url(),
  NATIVE_SYMBOL: z.string().min(1),
  REGISTRY_ADDRESS: addressSchema.transform((value) => value as Hex),
  STATIC_SCRIPTS_PRIVATE_KEY: privateKeySchema,
  SANDBOX_CANARY_PRIVATE_KEY: privateKeySchema,
  ADVISORY_FEED_PRIVATE_KEY: privateKeySchema,
  DETECTORS_PORT: z.coerce.number().int().positive(),
  EVIDENCE_DIR: z.string().min(1),
  SANDBOX_IMAGE: z.string().regex(/@sha256:[0-9a-f]{64}$/, "must be pinned by digest"),
  OSV_API_URL: z.string().url(),
  MOCK_REGISTRY_URL: z.string().url().optional(),
  OFF_CHAIN_DETECTORS: z.string().optional(),
});

async function main() {
  const env = envSchema.parse(Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== "")));
  const chain = defineAppChain({ id: env.CHAIN_ID, rpcUrl: env.RPC_URL, explorerUrl: env.EXPLORER_URL, nativeSymbol: env.NATIVE_SYMBOL });
  const signer = createSigner({
    chain,
    transport: http(env.RPC_URL),
    registry: env.REGISTRY_ADDRESS,
    keys: { staticScripts: env.STATIC_SCRIPTS_PRIVATE_KEY, sandboxCanary: env.SANDBOX_CANARY_PRIVATE_KEY, advisoryFeed: env.ADVISORY_FEED_PRIVATE_KEY },
    pendingDir: join(env.EVIDENCE_DIR, "pending"),
  });
  const app = buildServer({
    evidenceDir: env.EVIDENCE_DIR,
    mockRegistryUrl: env.MOCK_REGISTRY_URL,
    osvApiUrl: env.OSV_API_URL.replace(/\/$/, ""),
    sandboxImage: env.SANDBOX_IMAGE,
    fetchImpl: fetch,
    docker: runDocker,
    signer,
    offChainDetectors: (env.OFF_CHAIN_DETECTORS ?? "").split(",").filter((id): id is DetectorId => (detectorIds as readonly string[]).includes(id)),
  });
  setInterval(() => signer.retryPending().catch((error) => console.error(`pending retry failed: ${String(error)}`)), retryIntervalMs);
  await app.listen({ port: env.DETECTORS_PORT, host: "127.0.0.1" });
  console.log(`detectors listening on 127.0.0.1:${env.DETECTORS_PORT}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
