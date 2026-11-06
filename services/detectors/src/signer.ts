import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient, type Chain, type Hex, type Transport } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  detectorIds,
  ecosystem,
  evidenceHashOf,
  evidenceSchema,
  sealKeyOf,
  sealRegistryAbi,
  type DetectorId,
  type DetectorInfo,
  type Evidence,
  type Verdict,
} from "@bulkhead/shared";

export type SignerConfig = {
  chain: Chain;
  transport: Transport;
  registry: Hex;
  keys: Record<DetectorId, Hex>;
  pendingDir: string;
};

type Attempt = { landed: boolean; txHash: Hex | null };

const settledReverts = new Set(["DuplicateVote", "AlreadySealed", "KeyUnsealed"]);

export function createSigner({ chain, transport, registry, keys, pendingDir }: SignerConfig) {
  const publicClient = createPublicClient({ chain, transport, pollingInterval: 1_000 });
  const accounts = Object.fromEntries(detectorIds.map((id) => [id, privateKeyToAccount(keys[id])])) as Record<DetectorId, ReturnType<typeof privateKeyToAccount>>;
  const walletOf = (id: DetectorId) => createWalletClient({ account: accounts[id], chain, transport });

  async function vote(evidence: Evidence, evidenceHash: Hex): Promise<Attempt> {
    const account = accounts[evidence.detector];
    const key = sealKeyOf(evidence.name, evidence.version);
    const read = { address: registry, abi: sealRegistryAbi } as const;
    const [sealed, voted] = await Promise.all([
      publicClient.readContract({ ...read, functionName: "isSealed", args: [key] }),
      publicClient.readContract({ ...read, functionName: "hasVoted", args: [key, account.address] }),
    ]);
    if (sealed || voted) return { landed: true, txHash: null };
    const { request } = await publicClient.simulateContract({
      ...read,
      account,
      functionName: "submitVerdict",
      args: [ecosystem, evidence.name, evidence.version, evidenceHash],
    });
    const txHash = await walletOf(evidence.detector).writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    return { landed: receipt.status === "success", txHash };
  }

  async function attempt(evidence: Evidence, evidenceHash: Hex): Promise<Attempt> {
    try {
      return await vote(evidence, evidenceHash);
    } catch (error) {
      if (!(error instanceof BaseError)) throw error;
      const reverted = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
      const name = reverted instanceof ContractFunctionRevertedError ? reverted.data?.errorName : undefined;
      if (name && settledReverts.has(name)) return { landed: true, txHash: null };
      console.error(`verdict for ${evidence.name}@${evidence.version} by ${evidence.detector} stays pending: ${name ?? error.shortMessage}`);
      return { landed: false, txHash: null };
    }
  }

  async function landPending(file: string, evidence: Evidence, evidenceHash: Hex): Promise<Attempt> {
    const result = await attempt(evidence, evidenceHash);
    if (result.landed) await rm(file, { force: true });
    return result;
  }

  async function submit(evidence: Evidence): Promise<Verdict> {
    const evidenceHash = evidenceHashOf(evidence);
    const base = {
      key: sealKeyOf(evidence.name, evidence.version),
      detector: evidence.detector,
      detectorAddress: accounts[evidence.detector].address,
      evidenceHash,
      malicious: evidence.malicious,
      simulated: evidence.simulated,
    };
    if (!evidence.malicious) return { ...base, txHash: null, submittedAt: new Date().toISOString() };
    await mkdir(pendingDir, { recursive: true });
    const file = join(pendingDir, `${evidenceHash}.json`);
    await writeFile(file, JSON.stringify(evidence));
    const { txHash } = await landPending(file, evidence, evidenceHash);
    return { ...base, txHash, submittedAt: new Date().toISOString() };
  }

  async function retryPending(): Promise<number> {
    await mkdir(pendingDir, { recursive: true });
    const files = (await readdir(pendingDir)).filter((name) => name.endsWith(".json"));
    let landed = 0;
    for (const name of files) {
      const evidence = evidenceSchema.parse(JSON.parse(await readFile(join(pendingDir, name), "utf8")));
      if ((await landPending(join(pendingDir, name), evidence, evidenceHashOf(evidence))).landed) landed += 1;
    }
    return landed;
  }

  function detectors(): DetectorInfo[] {
    return detectorIds.map((id) => ({ id, address: accounts[id].address, simulated: true }));
  }

  return { submit, retryPending, detectors };
}
