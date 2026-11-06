import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { createPublicClient, createTestClient, createWalletClient, http, keccak256, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { sealRegistryAbi } from "@bulkhead/shared";

export const repoRoot = join(import.meta.dirname, "..", "..");
const foundryBin = join(homedir(), ".foundry", "bin");

export function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

function compiledRegistry(): { abi: unknown; bytecode: Hex } {
  const artifact = JSON.parse(readFileSync(join(repoRoot, "contracts", "out", "SealRegistry.sol", "SealRegistry.json"), "utf8"));
  return { abi: artifact.abi, bytecode: artifact.bytecode.object };
}

const buildLock = join(tmpdir(), "forgeBuildLock");

async function acquireBuildLock(): Promise<void> {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const taken = (() => {
      try {
        mkdirSync(buildLock);
        return true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        return false;
      }
    })();
    if (taken) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`forge build lock ${buildLock} is still held after two minutes`);
}

function forgeBuild(): Promise<void> {
  return new Promise((resolve, reject) => {
    const forge = spawn(join(foundryBin, "forge"), ["build"], { cwd: join(repoRoot, "contracts"), stdio: "ignore" });
    forge.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`forge build exited with ${code}`))));
  });
}

export async function buildContracts(): Promise<void> {
  await acquireBuildLock();
  await forgeBuild().finally(() => rmSync(buildLock, { recursive: true, force: true }));
}

export async function submitVerdict(rpcUrl: string, registry: Address, detectorKey: Hex, name: string, version: string): Promise<void> {
  const wallet = createWalletClient({ account: privateKeyToAccount(detectorKey), chain: foundry, transport: http(rpcUrl) });
  const hash = await wallet.writeContract({
    address: registry,
    abi: sealRegistryAbi,
    functionName: "submitVerdict",
    args: ["npm", name, version, keccak256(toHex(`evidence ${name}@${version}`))],
  });
  const receipt = await createPublicClient({ chain: foundry, transport: http(rpcUrl) }).waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`submitVerdict for ${name}@${version} failed in ${hash}`);
}

export type LocalChain = {
  rpcUrl: string;
  chainId: number;
  stop: () => void;
  funded: () => Promise<Hex>;
  deployRegistry: (options: { detectors: Hex[]; guardian: Hex; quorum: number; disputeWindow: number; maxSealsPerDay: number }) => Promise<Address>;
};

export async function startChain(): Promise<LocalChain> {
  const port = await freePort();
  const rpcUrl = `http://127.0.0.1:${port}`;
  const anvil: ChildProcess = spawn(join(foundryBin, "anvil"), ["--port", String(port), "--silent"], { stdio: "ignore" });
  const publicClient = createPublicClient({ chain: foundry, transport: http(rpcUrl) });
  const testClient = createTestClient({ chain: foundry, mode: "anvil", transport: http(rpcUrl) });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const ready = await publicClient.getChainId().then(() => true, () => false);
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const funded = async () => {
    const key = generatePrivateKey();
    await testClient.setBalance({ address: privateKeyToAccount(key).address, value: 10n ** 20n });
    return key;
  };
  const deployRegistry: LocalChain["deployRegistry"] = async ({ detectors, guardian, quorum, disputeWindow, maxSealsPerDay }) => {
    const wallet = createWalletClient({ account: privateKeyToAccount(await funded()), chain: foundry, transport: http(rpcUrl) });
    const { abi, bytecode } = compiledRegistry();
    const hash = await wallet.deployContract({
      abi,
      bytecode,
      args: [
        privateKeyToAccount(guardian).address,
        detectors.map((key) => privateKeyToAccount(key).address),
        quorum,
        BigInt(disputeWindow),
        maxSealsPerDay,
      ],
    } as never);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt.contractAddress as Address;
  };
  return { rpcUrl, chainId: foundry.id, stop: () => anvil.kill(), funded, deployRegistry };
}
