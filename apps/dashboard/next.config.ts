import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

const rootEnv = resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const upstreams = {
  watcher: process.env.NEXT_PUBLIC_WATCHER_URL,
  detectors: process.env.NEXT_PUBLIC_DETECTORS_URL,
  registry: process.env.NEXT_PUBLIC_MOCK_REGISTRY_URL,
};

const config: NextConfig = {
  transpilePackages: ["@bulkhead/shared"],
  async rewrites() {
    return Object.entries(upstreams).flatMap(([name, url]) =>
      url ? [{ source: `/proxy/${name}/:path*`, destination: `${url.replace(/\/$/, "")}/:path*` }] : [],
    );
  },
};

export default config;
