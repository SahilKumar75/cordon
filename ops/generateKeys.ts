import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

const envPath = join(import.meta.dirname, "..", ".env");

const roles = [
  { key: "DEPLOYER_PRIVATE_KEY", label: "deployer" },
  { key: "STATIC_SCRIPTS_PRIVATE_KEY", label: "staticScripts detector" },
  { key: "SANDBOX_CANARY_PRIVATE_KEY", label: "sandboxCanary detector" },
  { key: "ADVISORY_FEED_PRIVATE_KEY", label: "advisoryFeed detector" },
  { key: "GUARDIAN_PRIVATE_KEY", label: "guardian" },
  { key: "SNAPSHOT_SIGNER_PRIVATE_KEY", label: "snapshot signer" },
  { key: "GUARD_REPORTER_PRIVATE_KEY", label: "guard reporter (signs off chain, needs no funds)" },
] as const;

function readEnv(): Map<string, string> {
  if (!existsSync(envPath)) return new Map();
  return new Map(
    readFileSync(envPath, "utf8")
      .split("\n")
      .filter((line) => line.includes("="))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)] as [string, string]),
  );
}

const env = readEnv();
const added = roles.filter(({ key }) => !env.get(key));
for (const { key } of added) env.set(key, generatePrivateKey());

const addressOf = (key: string) => privateKeyToAccount(env.get(key) as Hex).address;
env.set("GUARDIAN_ADDRESS", addressOf("GUARDIAN_PRIVATE_KEY"));
env.set(
  "DETECTOR_ADDRESSES",
  ["STATIC_SCRIPTS_PRIVATE_KEY", "SANDBOX_CANARY_PRIVATE_KEY", "ADVISORY_FEED_PRIVATE_KEY"].map(addressOf).join(","),
);
env.set("GUARD_REPORTER_ADDRESSES", addressOf("GUARD_REPORTER_PRIVATE_KEY"));
env.set("GUARD_SNAPSHOT_SIGNER", addressOf("SNAPSHOT_SIGNER_PRIVATE_KEY"));

writeFileSync(envPath, [...env].map(([key, value]) => `${key}=${value}`).join("\n") + "\n", { mode: 0o600 });

for (const { key, label } of roles) {
  process.stdout.write(`${label.padEnd(50)} ${addressOf(key)}${added.some((role) => role.key === key) ? "  (new)" : ""}\n`);
}
