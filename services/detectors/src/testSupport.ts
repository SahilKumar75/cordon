import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { c } from "tar";
import {
  custom,
  decodeFunctionData,
  encodeErrorResult,
  encodeFunctionResult,
  keccak256,
  parseTransaction,
  recoverTransactionAddress,
  toHex,
  type Hex,
  type TransactionSerialized,
} from "viem";
import { defineAppChain, sealKeyOf, sealRegistryAbi } from "@bulkhead/shared";

export async function packFixture(files: Record<string, string>): Promise<Buffer> {
  const root = await mkdtemp(join(tmpdir(), "detectorsFixture"));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, "package", path)), { recursive: true });
    await writeFile(join(root, "package", path), content);
  }
  const file = join(root, "fixture.tgz");
  await c({ gzip: true, cwd: root, file }, ["package"]);
  return readFile(file);
}

export type RegistryState = {
  sealed: Set<Hex>;
  voters: Map<Hex, Set<string>>;
  revert: string | null;
  receiptStatus: "0x1" | "0x0";
  sent: Hex[];
  rpcDown: boolean;
};

export function newRegistryState(): RegistryState {
  return { sealed: new Set(), voters: new Map(), revert: null, receiptStatus: "0x1", sent: [], rpcDown: false };
}

export const testChain = defineAppChain({ id: 84532, rpcUrl: "http://rpc.invalid", explorerUrl: "http://explorer.invalid", nativeSymbol: "ETH" });

const block = {
  number: "0x10",
  hash: `0x${"ab".repeat(32)}`,
  parentHash: `0x${"cd".repeat(32)}`,
  timestamp: "0x6720000",
  baseFeePerGas: "0x1",
  gasLimit: "0x1c9c380",
  gasUsed: "0x0",
  transactions: [],
};

function revertData(name: string, key: Hex, from: Hex): Hex {
  const args = name === "DuplicateVote" ? [key, from] : name === "SealRateLimited" ? [1n] : [key];
  return encodeErrorResult({ abi: sealRegistryAbi, errorName: name as "AlreadySealed", args: args as [Hex] });
}

function answerCall(state: RegistryState, call: { data: Hex; from?: Hex }): Hex {
  const { functionName, args } = decodeFunctionData({ abi: sealRegistryAbi, data: call.data });
  if (functionName === "isSealed") return encodeFunctionResult({ abi: sealRegistryAbi, functionName, result: state.sealed.has(args[0]) });
  if (functionName === "hasVoted") {
    const voted = state.voters.get(args[0])?.has(args[1].toLowerCase()) ?? false;
    return encodeFunctionResult({ abi: sealRegistryAbi, functionName, result: voted });
  }
  if (functionName === "submitVerdict") {
    const key = sealKeyOf(args[1], args[2]);
    if (state.revert) throw Object.assign(new Error("execution reverted"), { code: 3, data: revertData(state.revert, key, call.from ?? "0x") });
    return encodeFunctionResult({ abi: sealRegistryAbi, functionName, result: key });
  }
  throw new Error(`unexpected call ${functionName}`);
}

async function recordVote(state: RegistryState, raw: Hex): Promise<Hex> {
  const transaction = parseTransaction(raw as TransactionSerialized);
  const { args } = decodeFunctionData({ abi: sealRegistryAbi, data: transaction.data as Hex });
  const key = sealKeyOf(args[1] as string, args[2] as string);
  const from = await recoverTransactionAddress({ serializedTransaction: raw as TransactionSerialized });
  state.voters.set(key, new Set([...(state.voters.get(key) ?? []), from.toLowerCase()]));
  const hash = keccak256(raw);
  state.sent.push(hash);
  return hash;
}

export function mockRegistryTransport(state: RegistryState) {
  return custom({
    async request({ method, params }: { method: string; params: unknown[] }) {
      if (state.rpcDown) throw new Error("rpc unreachable");
      if (method === "eth_chainId") return toHex(testChain.id);
      if (method === "eth_call") return answerCall(state, params[0] as { data: Hex; from?: Hex });
      if (method === "eth_estimateGas") return "0x30000";
      if (method === "eth_getTransactionCount") return "0x0";
      if (method === "eth_getBlockByNumber") return block;
      if (method === "eth_blockNumber") return block.number;
      if (method === "eth_maxPriorityFeePerGas" || method === "eth_gasPrice") return "0x1";
      if (method === "eth_sendRawTransaction") return recordVote(state, params[0] as Hex);
      if (method === "eth_getTransactionReceipt") {
        return {
          transactionHash: params[0],
          transactionIndex: "0x0",
          blockHash: block.hash,
          blockNumber: block.number,
          from: "0x0000000000000000000000000000000000000001",
          to: "0x0000000000000000000000000000000000000002",
          cumulativeGasUsed: "0x1",
          gasUsed: "0x1",
          effectiveGasPrice: "0x1",
          contractAddress: null,
          logs: [],
          logsBloom: `0x${"0".repeat(512)}`,
          status: state.receiptStatus,
          type: "0x2",
        };
      }
      throw new Error(`unexpected rpc method ${method}`);
    },
  });
}
