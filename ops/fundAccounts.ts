import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, createWalletClient, formatEther, http, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineAppChain } from "@cordon/shared";

const env = new Map(
  readFileSync(join(import.meta.dirname, "..", ".env"), "utf8")
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)] as [string, string]),
);

function required(name: string): string {
  const value = env.get(name);
  if (!value) throw new Error(`${name} is missing from .env`);
  return value;
}

const chain = defineAppChain({
  id: Number(required("CHAIN_ID")),
  rpcUrl: required("RPC_URL"),
  explorerUrl: required("EXPLORER_URL"),
  nativeSymbol: required("NATIVE_SYMBOL"),
});
const amount = parseEther(process.argv[2] ?? "0.002");
const deployer = privateKeyToAccount(required("DEPLOYER_PRIVATE_KEY") as Hex);
const wallet = createWalletClient({ account: deployer, chain, transport: http() });
const reader = createPublicClient({ chain, transport: http() });
const recipients = [
  "STATIC_SCRIPTS_PRIVATE_KEY",
  "SANDBOX_CANARY_PRIVATE_KEY",
  "ADVISORY_FEED_PRIVATE_KEY",
  "GUARDIAN_PRIVATE_KEY",
  "SNAPSHOT_SIGNER_PRIVATE_KEY",
].map((name) => privateKeyToAccount(required(name) as Hex).address);

for (const to of recipients) {
  const hash = await wallet.sendTransaction({ to, value: amount });
  await reader.waitForTransactionReceipt({ hash });
  process.stdout.write(`${to} +${formatEther(amount)} ${chain.nativeCurrency.symbol} ${chain.blockExplorers.default.url}/tx/${hash}\n`);
}
process.stdout.write(`deployer balance ${formatEther(await reader.getBalance({ address: deployer.address }))}\n`);
