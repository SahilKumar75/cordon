import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, createWalletClient, http, keccak256, toBytes, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineAppChain, sealRegistryAbi } from "@cordon/shared";

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

const demoSealNote =
  "Cordon testnet demo seal of @cordondemo/colorkit 1.4.1, a demo package that is not on the public npm registry. Two team detector keys voted by hand to show the guard blocking a sealed version.";

const chain = defineAppChain({
  id: Number(required("CHAIN_ID")),
  rpcUrl: required("RPC_URL"),
  explorerUrl: required("EXPLORER_URL"),
  nativeSymbol: required("NATIVE_SYMBOL"),
});
const registry = required("REGISTRY_ADDRESS") as Address;
const reader = createPublicClient({ chain, transport: http() });
const evidenceHash = keccak256(toBytes(demoSealNote));

for (const name of ["STATIC_SCRIPTS_PRIVATE_KEY", "SANDBOX_CANARY_PRIVATE_KEY"]) {
  const wallet = createWalletClient({ account: privateKeyToAccount(required(name) as Hex), chain, transport: http() });
  const hash = await wallet.writeContract({
    address: registry,
    abi: sealRegistryAbi,
    functionName: "submitVerdict",
    args: ["npm", "@cordondemo/colorkit", "1.4.1", evidenceHash],
  });
  const receipt = await reader.waitForTransactionReceipt({ hash });
  process.stdout.write(`${name.replace("_PRIVATE_KEY", "")} vote ${receipt.status} ${chain.blockExplorers.default.url}/tx/${hash}\n`);
}
const key = await reader.readContract({ address: registry, abi: sealRegistryAbi, functionName: "keyOf", args: ["npm", "@cordondemo/colorkit", "1.4.1"] });
const sealed = await reader.readContract({ address: registry, abi: sealRegistryAbi, functionName: "isSealed", args: [key] });
process.stdout.write(`evidence hash ${evidenceHash}\nkey ${key}\nisSealed ${sealed}\n`);
