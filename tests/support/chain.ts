import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { createPublicClient, createTestClient, createWalletClient, http, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

export const repoRoot = join(import.meta.dirname, "..", "..");
const foundryBin = join(homedir(), ".foundry", "bin");

function freePort(): Promise<number> {
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

export function buildContracts(): Promise<void> {
  return new Promise((resolve, reject) => {
    const forge = spawn(join(foundryBin, "forge"), ["build"], { cwd: join(repoRoot, "contracts"), stdio: "ignore" });
    forge.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`forge build exited with ${code}`))));
  });
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
