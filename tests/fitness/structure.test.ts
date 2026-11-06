import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createPublicClient, http } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { foundry } from "viem/chains";
import { sealKeyOf, sealRegistryAbi } from "@cordon/shared";
import { installArgs, sinkArgs } from "../../services/detectors/src/sandboxCanary.ts";
import { buildContracts, repoRoot, startChain, type LocalChain } from "../support/chain.ts";

function sourceFiles(folder: string): { path: string; text: string }[] {
  const directory = join(repoRoot, folder);
  return readdirSync(directory)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => ({ path: join(folder, name), text: readFileSync(join(directory, name), "utf8") }));
}

test("every npm install in the guard disables install scripts", () => {
  const npmLines = sourceFiles("packages/guard/src").flatMap(({ path, text }) =>
    text.split("\n").filter((line) => /["']npm["'].*["'](ci|install|i|add|rebuild)["']/.test(line)).map((line) => ({ path, line })),
  );
  assert.ok(npmLines.length > 0, "the guard is expected to run npm ci somewhere");
  for (const { path, line } of npmLines) assert.match(line, /--ignore-scripts/, `${path} runs npm without --ignore-scripts`);
});

test("the guard never runs a shell command", () => {
  for (const { path, text } of sourceFiles("packages/guard/src")) {
    assert.doesNotMatch(text, /import\s*\{[^}]*\bexec(Sync)?\b[^}]*\}\s*from\s*["']node:child_process["']|shell:\s*true/, `${path} runs a shell`);
  }
});

test("the sandbox mounts no host path and publishes no port", () => {
  const forbidden = new Set(["-v", "--volume", "--mount", "-p", "--publish", "--publish-all", "-P", "--network=host"]);
  for (const args of [sinkArgs(), installArgs("image@sha256:abc", "run1", "token1")]) {
    for (const arg of args) assert.ok(!forbidden.has(arg) && !arg.startsWith("--mount=") && !arg.startsWith("--volume="), `docker argument ${arg}`);
    assert.ok(args.includes("--network"), "sandbox containers must name their network");
  }
});

test("shared depends on nothing in the workspace", () => {
  const manifest = JSON.parse(readFileSync(join(repoRoot, "packages", "shared", "package.json"), "utf8"));
  assert.deepEqual(Object.keys(manifest.dependencies).sort(), ["viem", "zod"]);
  const files = readdirSync(join(repoRoot, "packages", "shared", "src"), { recursive: true }) as string[];
  for (const file of files.filter((name) => name.endsWith(".ts"))) {
    const text = readFileSync(join(repoRoot, "packages", "shared", "src", file), "utf8");
    assert.doesNotMatch(text, /from ["'](@cordon\/|\.\.\/\.\.\/)/, `${file} imports outside shared`);
  }
});

let chain: LocalChain;

before(async () => {
  await buildContracts();
  chain = await startChain();
});

after(() => chain.stop());

test("the deployed contract key equals the shared seal key", async () => {
  const registry = await chain.deployRegistry({
    detectors: [generatePrivateKey(), generatePrivateKey(), generatePrivateKey()],
    guardian: generatePrivateKey(),
    quorum: 2,
    disputeWindow: 3600,
    voteLifetime: 86400,
    maxSealsPerDay: 10,
  });
  const client = createPublicClient({ chain: foundry, transport: http(chain.rpcUrl) });
  for (const [name, version] of [["@cordondemo/colorkit", "1.4.1"], ["@tanstack/react-router", "1.169.5"], ["a", "bc"]] as const) {
    const onChain = await client.readContract({ address: registry, abi: sealRegistryAbi, functionName: "keyOf", args: ["npm", name, version] });
    assert.equal(onChain, sealKeyOf(name, version));
  }
});
