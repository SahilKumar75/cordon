import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const repoDir = join(import.meta.dirname, "..");
const envPath = join(repoDir, ".env");
const demoEnvPath = join(repoDir, "demo", "demo.env");
const sandboxImage = "node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914";

function readEnv(path: string): Map<string, string> {
  if (!existsSync(path)) return new Map();
  return new Map(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((line) => line.includes("=") && !line.startsWith("#"))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)] as [string, string]),
  );
}

function writeEnv(path: string, env: Map<string, string>): void {
  writeFileSync(path, [...env].map(([key, value]) => `${key}=${value}`).join("\n") + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
}

const env = readEnv(envPath);
const deployment = JSON.parse(readFileSync(join(repoDir, "contracts", "deployments", `${env.get("CHAIN_ID")}.json`), "utf8"));
const registry: string = deployment.sealRegistry;
const startBlock = String(deployment.blockNumber);

const fresh = { REGISTRY_ADDRESS: registry, REGISTRY_START_BLOCK: startBlock, NEXT_PUBLIC_REGISTRY_ADDRESS: registry };
const defaults = {
  NEXT_PUBLIC_CHAIN_ID: env.get("CHAIN_ID"),
  NEXT_PUBLIC_RPC_URL: env.get("RPC_URL"),
  NEXT_PUBLIC_EXPLORER_URL: env.get("EXPLORER_URL"),
  NEXT_PUBLIC_NATIVE_SYMBOL: env.get("NATIVE_SYMBOL"),
  NEXT_PUBLIC_SNAPSHOT_SIGNER: env.get("GUARD_SNAPSHOT_SIGNER"),
  NEXT_PUBLIC_WATCHER_URL: "http://127.0.0.1:4302",
  NEXT_PUBLIC_DETECTORS_URL: "http://127.0.0.1:4301",
  NEXT_PUBLIC_DEMO: "true",
  NEXT_PUBLIC_MOCK_REGISTRY_URL: "http://127.0.0.1:4873",
  DETECTORS_PORT: "4301",
  DETECTORS_URL: "http://127.0.0.1:4301",
  EVIDENCE_DIR: "evidence",
  SANDBOX_IMAGE: sandboxImage,
  OSV_API_URL: "https://api.osv.dev",
  MOCK_REGISTRY_URL: "http://127.0.0.1:4873",
  NPM_REGISTRY_URL: "http://127.0.0.1:4873",
  CANARY_SINK_URL: "http://127.0.0.1:4880",
  WATCHER_PORT: "4302",
  DATABASE_PATH: "data/watcher.sqlite",
  SNAPSHOT_PATH: "snapshots/snapshot.json",
  DASHBOARD_ORIGIN: "http://localhost:3000",
  GUARD_SNAPSHOT_URL: "http://127.0.0.1:4302/snapshot",
  GUARD_REPORT_URL: "http://127.0.0.1:4302/reports",
  GUARD_CACHE_DIR: "data/guardCache",
};

for (const [key, value] of Object.entries(defaults)) if (!env.get(key) && value) env.set(key, value);
for (const [key, value] of Object.entries(fresh)) env.set(key, value);
writeEnv(envPath, env);

const demoEnv = readEnv(join(repoDir, "demo", "demo.env.example"));
for (const [key, value] of readEnv(demoEnvPath)) if (value) demoEnv.set(key, value);
for (const key of ["CHAIN_ID", "RPC_URL", "REGISTRY_START_BLOCK", "EXPLORER_URL", "NATIVE_SYMBOL", "GUARD_SNAPSHOT_URL", "GUARD_SNAPSHOT_SIGNER", "GUARD_SNAPSHOT_MAX_AGE_SECONDS", "GUARD_CACHE_DIR", "GUARD_REPORT_URL", "GUARD_REPORTER_PRIVATE_KEY"]) {
  demoEnv.set(key, env.get(key) ?? "");
}
demoEnv.set("REGISTRY_ADDRESS", registry);
writeEnv(demoEnvPath, demoEnv);

process.stdout.write(`REGISTRY_ADDRESS=${registry}\nREGISTRY_START_BLOCK=${startBlock}\nwrote .env and demo/demo.env\n`);
