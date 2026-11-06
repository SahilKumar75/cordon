import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createPublicClient,
  custom,
  encodeAbiParameters,
  encodeEventTopics,
  keccak256,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { guardReportDigestOf, productName, sealKeyOf, sealRegistryAbi, type GuardReport, type SignedGuardReport } from "@cordon/shared";

export const registryAddress: Address = "0x00000000000000000000000000000000000000aa";
export const detectorAddress: Address = "0x00000000000000000000000000000000000000d1";
export const guardianAddress: Address = "0x00000000000000000000000000000000000000c1";
export const demoName = "@cordondemo/colorkit";
export const demoVersion = "1.4.1";
export const demoKey = sealKeyOf(demoName, demoVersion);

export function tempDatabasePath(): string {
  return join(mkdtempSync(join(tmpdir(), "watcherTest")), "watcher.db");
}

export type ChainLog = { blockNumber: number; logIndex: number; txHash: Hex; topics: Hex[]; data: Hex };

type EventInput = { name: string; type: string; indexed?: boolean };

function chainLog(eventName: string, args: Record<string, unknown>, blockNumber: number, logIndex: number): ChainLog {
  const event = sealRegistryAbi.find((item) => item.type === "event" && item.name === eventName) as { inputs: readonly EventInput[] };
  const plain = event.inputs.filter((input) => !input.indexed);
  return {
    blockNumber,
    logIndex,
    txHash: keccak256(toHex(`${eventName}:${blockNumber}:${logIndex}`)),
    topics: encodeEventTopics({ abi: sealRegistryAbi, eventName: eventName as "Sealed", args: args as { key: Hex } }) as Hex[],
    data: encodeAbiParameters(plain, plain.map((input) => args[input.name])),
  };
}

export function verdictLog(blockNumber: number, logIndex = 0, detector: Address = detectorAddress): ChainLog {
  return chainLog("VerdictSubmitted", { key: demoKey, detector, evidenceHash: keccak256(toHex(detector)), votes: 1, at: 0n }, blockNumber, logIndex);
}

export function sealedLog(blockNumber: number, logIndex = 0): ChainLog {
  return chainLog("Sealed", { key: demoKey, ecosystem: "npm", name: demoName, version: demoVersion, votes: 2, at: 0n }, blockNumber, logIndex);
}

export function guardianLog(eventName: "Unsealed" | "Resealed", blockNumber: number): ChainLog {
  return chainLog(eventName, { key: demoKey, guardian: guardianAddress, reasonHash: keccak256(toHex(eventName)), at: 0n }, blockNumber, 0);
}

export const blockTimeOf = (blockNumber: number) => 1_793_000_000 + blockNumber * 2;

export function fakeChain(logs: ChainLog[], latest: () => number): { client: PublicClient; calls: string[] } {
  const calls: string[] = [];
  const request = async ({ method, params }: { method: string; params: unknown[] }) => {
    calls.push(method);
    if (method === "eth_chainId") return toHex(31337);
    if (method === "eth_blockNumber") return toHex(latest());
    if (method === "eth_getBlockByNumber") {
      const number = Number(params[0]);
      return { number: toHex(number), timestamp: toHex(blockTimeOf(number)), hash: keccak256(toHex(number)), transactions: [] };
    }
    if (method === "eth_getLogs") {
      const filter = params[0] as { fromBlock: Hex; toBlock: Hex };
      return logs
        .filter((log) => log.blockNumber >= Number(filter.fromBlock) && log.blockNumber <= Number(filter.toBlock))
        .map((log) => ({
          address: registryAddress,
          topics: log.topics,
          data: log.data,
          blockNumber: toHex(log.blockNumber),
          blockHash: keccak256(toHex(log.blockNumber)),
          transactionHash: log.txHash,
          transactionIndex: "0x0",
          logIndex: toHex(log.logIndex),
          removed: false,
        }));
    }
    throw new Error(`unexpected rpc method ${method}`);
  };
  return { client: createPublicClient({ transport: custom({ request }) }), calls };
}

export function guardReport(overrides: Partial<GuardReport> = {}): GuardReport {
  return {
    product: productName,
    service: "checkout",
    lockfile: "package-lock.json",
    checkedAt: "2026-11-06T10:00:00.000Z",
    listSource: "chain",
    fallback: null,
    packagesChecked: 12,
    blocked: [{ name: demoName, version: demoVersion, key: demoKey, lockfilePath: "node_modules/@cordondemo/colorkit", alreadyInstalled: false }],
    snapshotAgeSeconds: null,
    gitDependencies: [],
    hookFiles: [],
    tooYoung: [],
    rollback: [{ name: demoName, from: demoVersion, to: "1.4.0" }],
    advice: [],
    outcome: "blocked",
    ...overrides,
  };
}

export const reporterKey = generatePrivateKey();

export async function signedReport(report: GuardReport, privateKey = reporterKey): Promise<SignedGuardReport> {
  const account = privateKeyToAccount(privateKey);
  return { report, signer: account.address, signature: await account.signMessage({ message: { raw: guardReportDigestOf(report) } }) };
}
