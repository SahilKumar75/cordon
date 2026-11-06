import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import type { NextConfig } from "next";

const rootEnv = resolve(process.cwd(), "../../.env");
const publicEntries = existsSync(rootEnv)
  ? Object.entries(parseEnv(readFileSync(rootEnv, "utf8"))).filter(([name]) => name.startsWith("NEXT_PUBLIC_"))
  : [];
for (const [name, value] of publicEntries) process.env[name] ??= value;

const upstreams = {
  watcher: process.env.NEXT_PUBLIC_WATCHER_URL,
  detectors: process.env.NEXT_PUBLIC_DETECTORS_URL,
  registry: process.env.NEXT_PUBLIC_DEMO === "true" ? process.env.NEXT_PUBLIC_MOCK_REGISTRY_URL : undefined,
};

const config: NextConfig = {
  transpilePackages: ["@cordon/shared"],
  async rewrites() {
    return Object.entries(upstreams).flatMap(([name, url]) =>
      url ? [{ source: `/proxy/${name}/:path*`, destination: `${url.replace(/\/$/, "")}/:path*` }] : [],
    );
  },
};

export default config;
