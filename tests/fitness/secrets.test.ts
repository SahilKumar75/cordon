import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { repoRoot } from "../support/chain.ts";

const secretPatterns = [
  /(PRIVATE_KEY|SECRET|TOKEN|API_KEY|MNEMONIC)[A-Z_]*["']?\s*[=:]\s*["']?(0x)?[0-9a-fA-F]{64}/,
  /BEGIN [A-Z ]*PRIVATE KEY/,
  /\bnpm_[A-Za-z0-9]{36}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{36}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}/,
  /\bAKIA(?!FAKE)[0-9A-Z]{16}\b/,
];

function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" })
    .split("\n")
    .filter((path) => path && !path.startsWith("contracts/lib/") && path !== "pnpm-lock.yaml");
}

test("no env or key file is tracked by git", () => {
  const leaked = trackedFiles().filter((path) => /(^|\/)\.env($|\.(?!example$))|\.pem$|\.key$|\.keystore$|(^|\/)demo\.env$/.test(path));
  assert.deepEqual(leaked, []);
});

test("no tracked file contains a secret", () => {
  const hits = trackedFiles().flatMap((path) => {
    const text = readFileSync(join(repoRoot, path), "utf8");
    return secretPatterns.filter((pattern) => pattern.test(text)).map((pattern) => `${path} matches ${pattern}`);
  });
  assert.deepEqual(hits, []);
});

test("the env file and key files are ignored by git", () => {
  for (const path of [".env", ".env.local", "demo/demo.env", "keys/deployer.key", "signer.pem"]) {
    assert.doesNotThrow(() => execFileSync("git", ["check-ignore", "--quiet", path], { cwd: repoRoot }), `${path} is not ignored`);
  }
});
