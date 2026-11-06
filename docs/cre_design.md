# Chainlink CRE design

Built on the cre branch and merged into main on 6 Nov 2026. Facts about CRE come from the docs.chain.link pages linked below, read on 6 Nov 2026. The workflow runs in the CRE simulator only (`bash ops/creDemo.sh`); it is not deployed.

## What moves into CRE

The advisoryFeed detector: given an npm name and version, POST https://api.osv.dev/v1/query with {"package":{"ecosystem":"npm","name":name},"version":version} and call the version malicious when any returned id starts with MAL. Today services/detectors runs this check and signs the vote with its own key. On the cre branch the same check runs as a CRE workflow and the vote reaches SealRegistry through a receiver contract. staticScripts and sandboxCanary stay in services/detectors unchanged.

It is the right detector to move because it is the only one that is a pure function of a public API: no tarball download, no Docker, no local state. Every CRE node can run it and agree on the answer.

## The workflow

TypeScript SDK, one workflow named cordonAdvisory, in cre/ on the branch.

1. Trigger: an HTTP trigger whose payload is {name, version}. In simulation we pass it with `--http-payload`. In a deployment the watcher would call the CRE gateway with a JWT signed by an authorized key listed in the trigger config ([HTTP trigger](https://docs.chain.link/cre/guides/workflow/using-triggers/http-trigger/triggering-deployed-workflows.md)).
2. Fetch: HTTPClient POST to OSV with consensusIdenticalAggregation, so the nodes must return the same list of MAL ids ([HTTP client](https://docs.chain.link/cre/guides/workflow/using-http-client/post-request-ts.md)).
3. Decide: malicious when any id starts with MAL. A clean result writes nothing, the same as today where clean verdicts stay off chain.
4. Evidence: the evidence hash is keccak256 of a canonical JSON object {name, version, detector: "advisoryFeed", malIds, osvModified}, so anyone can recompute it from OSV.
5. Write: runtime.report over abi.encode(name, version, evidenceHash), then evmClient.writeReport to the receiver on Base Sepolia, chain selector name ethereum-testnet-sepolia-base-1 ([onchain write](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/writing-data-onchain.md)).

## The receiver contract and caller identity

contracts/src/CordonCreReceiver.sol implements IReceiver (onReport(bytes metadata, bytes report) and supportsInterface) ([consumer contracts](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts.md)).

1. onReport accepts calls only from the forwarder address fixed in the constructor.
2. In a deployed setup it also checks the workflow owner from the metadata (abi.encodePacked of bytes32 workflowId, bytes10 workflowName, address workflowOwner) against an expected owner fixed in the constructor, so another CRE user cannot write to our receiver through the same forwarder. The docs say the mock forwarder used in simulation does not supply that metadata, so the simulation receiver is built with the owner check off.
3. It decodes (name, version, evidenceHash) and calls SealRegistry.submitVerdict("npm", name, version, evidenceHash).
4. No owner, no setters: everything is immutable, in line with the registry's frozen roles. The docs' ReceiverTemplate has onlyOwner setters; we do not use them.

SealRegistry counts distinct msg.sender addresses. The receiver is one detector address. Inside CRE many nodes agree on the report and the forwarder verifies their signatures, but on chain that agreement is still one vote. Quorum stays 2 of 3: the receiver plus staticScripts or sandboxCanary. A duplicate report reverts with DuplicateVote while the first vote is live, which the workflow sees as a failed receiver execution and which changes nothing.

## A fresh registry deploy is needed

Roles are granted only in the SealRegistry constructor and can never change, so the receiver must be a detector from the start. The deploy script on the branch predicts the registry address from the deployer nonce (vm.computeCreateAddress), deploys the receiver pointing at that address, then deploys the registry with detectors [staticScripts, sandboxCanary, receiver] and checks the prediction matched.

The forwarder is fixed in the receiver, so simulation and deployment need different deploys:

| Setup | Forwarder on Base Sepolia | Owner check |
| --- | --- | --- |
| Simulation with --broadcast | MockKeystoneForwarder 0x82300bd7c3958625581cc2f77bc6464dcecdf3e5 | off |
| CRE deployment | KeystoneForwarder 0xF8344CFd5c43616a4366C34E3EEE75af79a74482 | on |

Addresses from the [forwarder directory](https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory-ts.md). The simulation deploy is a demo registry only: with the owner check off, anything that can call the mock forwarder can submit a vote as this receiver.

## Simulation versus deployment

Simulation: `cre workflow simulate cordonAdvisory --target staging-settings --http-payload @payload.json`. The CLI compiles the workflow to WASM and runs it on one local process. The OSV call and chain reads are real; there is no node consensus. Without --broadcast the write is a dry run with a zero transaction hash and needs no funds. With --broadcast it sends a real transaction through the mock forwarder, paid by CRE_ETH_PRIVATE_KEY, which must hold Base Sepolia ETH ([simulating](https://docs.chain.link/cre/guides/operations/simulating-workflows.md)).

Deployment: `cre workflow deploy cordonAdvisory --target production-settings`. It needs deploy access granted by Chainlink after a request through `cre account access`; until `cre whoami` shows deploy access enabled, deployment is impossible. With the private registry no wallet or gas is needed for registration. Linking a key to the onchain Workflow Registry happens on Ethereum mainnet and costs mainnet gas, so we skip it. A deployed workflow runs on Chainlink's DON; Chainlink chooses and operates those nodes, not us ([private registry](https://docs.chain.link/cre/guides/operations/deploying-to-private-registry-ts.md), [account commands](https://docs.chain.link/cre/reference/cli/account.md)).

## What this does and does not change in the claims

Until a simulation with --broadcast lands a vote on Base Sepolia, the README says only that the workflow exists and how to simulate it. If deploy access is never granted, the honest claim is "simulated", never "running on CRE". When it runs, the README will say Chainlink chooses the operators, and that a CRE vote is still one of three detector votes.

## Time box

Two hours from approval, on the cre branch only. If simulation with --broadcast is not working by then, the branch stays as is and main is submitted.
