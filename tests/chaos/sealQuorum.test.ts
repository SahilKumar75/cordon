import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { BaseError, ContractFunctionRevertedError, createPublicClient, http, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { sealKeyOf, sealRegistryAbi } from "@bulkhead/shared";
import { buildContracts, startChain, submitVerdict, type LocalChain } from "../support/chain.ts";

const name = "@bulkheaddemo/colorkit";

let chain: LocalChain;
let registry: Address;
let detector: Hex;

before(async () => {
  await buildContracts();
  chain = await startChain();
  detector = await chain.funded();
  registry = await chain.deployRegistry({ detectors: [detector, await chain.funded(), await chain.funded()], guardian: generatePrivateKey(), quorum: 2, disputeWindow: 3600, maxSealsPerDay: 10 });
});

after(() => chain?.stop());

function readRegistry<T>(functionName: "isSealed" | "getSeal" | "hasVoted", args: readonly unknown[]): Promise<T> {
  const client = createPublicClient({ chain: foundry, transport: http(chain.rpcUrl) });
  return client.readContract({ address: registry, abi: sealRegistryAbi, functionName, args } as never) as Promise<T>;
}

function revertName(error: unknown): string | undefined {
  if (!(error instanceof BaseError)) return undefined;
  const reverted = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
  return reverted instanceof ContractFunctionRevertedError ? reverted.data?.errorName : undefined;
}

test("one detector vote with quorum 2 leaves the version unsealed", async () => {
  const key = sealKeyOf(name, "1.4.1");
  await submitVerdict(chain.rpcUrl, registry, detector, name, "1.4.1");
  assert.equal(await readRegistry<boolean>("isSealed", [key]), false);
  assert.equal(await readRegistry<boolean>("hasVoted", [key, privateKeyToAccount(detector).address]), true);
  const seal = await readRegistry<{ status: number; votes: number }>("getSeal", [key]);
  assert.equal(seal.status, 0);
  assert.equal(seal.votes, 1);
});

test("a second vote from the same detector reverts with DuplicateVote and changes nothing", async () => {
  const key = sealKeyOf(name, "1.4.2");
  await submitVerdict(chain.rpcUrl, registry, detector, name, "1.4.2");
  await assert.rejects(submitVerdict(chain.rpcUrl, registry, detector, name, "1.4.2"), (error) => revertName(error) === "DuplicateVote");
  assert.equal(await readRegistry<boolean>("isSealed", [key]), false);
  assert.equal((await readRegistry<{ votes: number }>("getSeal", [key])).votes, 1);
});
