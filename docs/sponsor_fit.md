# Sponsor fit

Every sponsor prize at ETHGlobal Mumbai 2026 checked against Cordon as it stood on 6 Nov 2026, with the EF, Chainlink and Arkiv entries and the shortlist updated on 7 Nov 2026. Source: the prizes page text read from the team's browser on 6 Nov 2026. Quotes are copied from that text and shortened only with an ellipsis. Cordon is on the Classic (From Scratch) track, so prizes marked Continuity only are out of reach. Up to 3 partner prizes per project; several tracks from one partner count as one (docs/event_brief.md).

Verdicts: yes means Cordon meets the requirement today, partly means it can with the work named, no means it cannot in the time left or the prize is closed to our track.

Prize plan on 7 Nov 2026: Ethereum Foundation Best CROPS App is the primary target; Chainlink Best workflow with CRE is entered as a simulation only; Arkiv is planned and not entered, because the writer wallet was never funded. SealRegistry was deployed on Base Sepolia on 7 Nov 2026 (docs/testnet_proof.md).

## World ($12,500)

1. World ID Agent Pass, Continuity only, $2,500. Requirement: "Integrate with the official World ID Agent Pass." Verdict: no. Continuity only.
2. World ID Agent Pass, $5,000. Requirement: "Integrate with the official World ID Agent Pass. Demonstrate the complete journey: identity or verification request, user completion, validated result, and the protected application or agent action. Demonstrate a denied, expired, cancelled, or otherwise unsuccessful path where the protected action does not occur. Validate identity results in a secure backend ... Include a short integration debrief/feedback ..." Verdict: partly. A fresh human verification could gate guardian unseal on /guardian, but that needs a new Agent Pass integration, a backend check, a denied path and a debrief, and it competes with the single guardian key that already guards unseal.
3. Best Use of IDKit, $2,500. Requirement: "Integrate IDKit in a functioning application, mini app, or onchain flow. Use at least one supported World ID credential and verify the result on the server or onchain as appropriate. Clearly explain the specific product event requiring trust and why the chosen credential is the minimum sufficient assurance. Demonstrate a successful verification and one meaningful alternative path ..." Verdict: partly. Same idea as above with Proof of Human on unseal; weak because the trust moment in Cordon is a guardian key, not a unique human.
4. [Cont] Best Use of IDKit, Continuity only, $2,500. Requirement: "Integrate IDKit in a functioning application, mini app, or onchain flow." Verdict: no. Continuity only.

## 1inch ($7,000)

1. Build an Aqua App, $5,000. Requirement: "Official Aqua/SwapVM contracts must be used (redeployments of a modified SwapVM contract is allowed) Onchain execution of token transfers should be presented during the final demo (local forks are ok) Proper Git commit history (no single-commit entries on the final day)" Verdict: no. Cordon has no DeFi position or token transfers.
2. Build an Aqua App - Continuity Track, Continuity only, $2,000. Requirement: "Official Aqua/SwapVM contracts must be used ..." Verdict: no. Continuity only.

## 0G ($15,000)

1. Build with 0G Private Computer, $5,000. Requirement: "Inference on 0G Private Computer in your main user flow, with request IDs A working app a judge can try, with a clear reason someone comes back tomorrow One sentence on what breaks if 0G is removed" Verdict: no. Cordon has no model call in its main flow, and 0G lists "Apps where the AI call could be removed without anyone noticing" as not wanted.
2. Physical AI: Agents with a Body, $5,000. Requirement: "A 0G call inside the decision loop: vision, voice or decision model An episode log on 0G Storage with a request id per decision A replayable simulation, or a live hardware demo at the 0G booth A safe-stop fallback if 0G is unreachable." Verdict: no. No robot or device.
3. Keep Building on 0G, Continuity only, $3,000. Requirement: "A link to prior state: a dated commit hash or the previous submission page marking where you started" Verdict: no. Continuity only.
4. Agents That Pay for Themselves, $2,000. Requirement: "The full loop: money in, credit landing in the agent's 0G compute account, and inference paid from that balance, with tx hashes and request IDs" Verdict: no. No earning agent.

## Uniswap Foundation ($15,000)

1. Build with Uniswap, $10,000. Requirement: "A public GitHub repository with open-source code, a FEEDBACK.md file, and a completed submission to the Uniswap Developer Feedback Form ... Make sure your README clearly points to the relevant contracts and lines of code so we can verify your integration." Verdict: no. Cordon integrates no part of the Uniswap stack.
2. Build with Uniswap, Continuity only, $5,000. Requirement: same text as above. Verdict: no. Continuity only.

## Arc ($15,000)

Every Arc prize shares these requirements: "Built in Arc Studio. Include a shareable Arc Studio project URL that judges can open, and show Studio in your demo. Functional MVP and diagram: Projects must demonstrate a working frontend and backend plus an architecture diagram. Video demonstration + presentation ... Link to GitHub/Replit repo". Cordon was built locally with Foundry, and docs/rules.md keeps Arc pending a mentor answer on whether locally built contracts qualify.

1. Best DeFi / Onchain Finance App Built End to End in Arc Studio, $3,000. Verdict: no. Not built in Arc Studio and no USDC or EURC settlement.
2. Best Mobile Web Consumer Agent Using the Marketplace Discovery API, $3,000. Verdict: no. No consumer agent, no Discovery API, no Nanopayments.
3. Best Smart Contracts with Advanced Stablecoin Logic, In Arc Studio, $3,000. Verdict: no. The dispute window looks like "Conditional escrow with onchain dispute", but SealRegistry moves no USDC or EURC and was not built in Arc Studio.
4. Best Use of Bridge Kit for Non-USDC Assets, Built in Arc Studio, $3,000. Verdict: no. No assets move across chains.
5. Arc Studio Continuity Track: Bring Your Project to Arc, Continuity only, $3,000. Verdict: no. Continuity only.

Chain note, not verified today: docs/event_brief.md (read 5 Nov 2026) records that Arc Studio can deploy to Base Sepolia among other networks.

## Hedera ($15,000)

1. AI Agents That Pay: x402 on Hedera, $6,500. Requirement: "At least one x402-protected endpoint that settles on Hedera testnet or mainnet through anyfacilitator listed in the Hedera docs (Official x402, Ax402, or Blocky402), or through a facilitator you run yourself. An agent or client that finds the endpoint and completes at least one paid request end to end, with no human approving. A public GitHub repo with a README that covers setup, architecture, and the payment flow, including the Hedera transaction ID of at least one settled payment. A demo video of 5 minutes or less ..." Verdict: partly. The watcher could sell evidence or snapshot reads per call through x402 on Hedera testnet with an agent client paying, but that is a new payment feature on a second chain, not core to Cordon.
2. Tokenize Anything with Hedera Studios, $5,000. Requirement: "Use ATS or Stablecoin Studio (SDK, contracts, web app, or a combination) to issue or manage a tokenized asset or stablecoin. Deploy and demo on Hedera testnet." Verdict: no. No tokenized asset.
3. "No Solidity Allowed": Build with Hedera SDKs, $2,000. Requirement: "Use the Hedera JavaScript/TypeScript SDK or Python SDK, with no Solidity smart contracts. Use at least two native Hedera services (for example, HTS and HCS)." Verdict: no. SealRegistry is Solidity and is never cut.
4. Built on Hedera (Continuity Track), Continuity only, $1,500. Requirement: "The project was built for a previous hackathon or already exists on Hedera." Verdict: no. Continuity only.

Chain check: Hedera's x402 facilitators page lists Blocky402 with a testnet base URL (api.testnet.blocky402.com, network hedera:testnet) and says the official x402 facilitator advertises hedera:testnet. Source: [docs.hedera.com/solutions/ai/x402/facilitators](https://docs.hedera.com/solutions/ai/x402/facilitators), accessed 6 Nov 2026 through search results only; the page itself was not opened, so not verified.

## Arkiv ($15,000)

Each team can win one Arkiv track prize, plus the Swarm bonus. Status on 7 Nov 2026: planned, not entered. Evidence publishing is built (services/detectors/src/arkiv.ts, the GET /evidence fallback in services/detectors/src/server.ts, apps/dashboard/lib/arkiv.ts, and the five files in arkiv/), but the writer wallet is unfunded, so no entity has been written and there is no writer address or runnable query to put in the README. Cordon enters an Arkiv track only if a real write is shown.

1. Mirror something Ethereum depends on, $4,000. Requirement: "Built from scratch at ETHGlobal Mumbai ... The data's license allows republishing. Link it in your README. Not Sourcify data, from any chain. Your import script is in the repo, and we can re-run it. Your project writes to Arkiv's current testnet (see the docs) with @arkiv-network/sdk or the JSON-RPC API, and a feature or query people use reads the data from Arkiv. In your README: the wallet address(es) that wrote your entities, and one query we can run ... One file per criterion in How we judge ... A public repo with an open-source license." Verdict: partly. Mirroring the OSV malicious npm advisories that advisoryFeed reads into Arkiv, with the guard reading them, would fit, but needs an import script, a license check on the OSV data, five /arkiv files and an open source license; the link to "Ethereum depends on" is arguable.
2. Build on Arkiv (from scratch), $4,000. Requirement: "Built from scratch at ETHGlobal Mumbai ... Your app writes to Arkiv's current testnet (see the docs) with @arkiv-network/sdk or the JSON-RPC API, and at least one feature users see reads its data from Arkiv ... Not counted: the SDK installed but never used to read, or Arkiv used only as a log that nothing reads." Verdict: partly, the target if Arkiv goes ahead. The detectors service writes each evidence file as a `cordon.evidence` entity, and the detectors service and the dashboard seal page read it back when the local copy is missing, which is a feature users see. Missing: a funded writer, at least one real entity on the current testnet, and the writer address and a query in the README.
3. Build on Arkiv (existing projects), Continuity only, $4,000. Requirement: "An existing project in ETHGlobal's Continuity batch ..." Verdict: no. Continuity only.
4. Node tooling, $2,000. Requirement: "Built from scratch at ETHGlobal Mumbai: a new repo that runs next to the node." Verdict: no. Not a node tool and needs a separate repo.
5. Arkiv + Swarm bonus (from scratch), $500. Requirement: "Your project uses both Arkiv and Swarm. A project that uses only Swarm does not qualify. /arkiv/swarm.md in your repo ..." Verdict: no for now. Cordon has no Swarm code.
6. Arkiv + Swarm bonus (existing projects), Continuity only, $500. Requirement: "An existing project in ETHGlobal's Continuity batch that uses both Arkiv and Swarm." Verdict: no. Continuity only.

Chain check: the prizes page gives Arkiv chain ID 7794095. The Arkiv docs found by search list a Kaolin testnet with chain ID 60138453025 and SDK v0.6.0, and an older Mendoza testnet. Source: [arkiv.dev.golem.network/docs](https://arkiv.dev.golem.network/docs), accessed 6 Nov 2026 through search results only. Which testnet is "current" is not verified. The code uses the SDK's `rabdi` chain (services/detectors/src/server.ts, apps/dashboard/lib/arkiv.ts); whether that is the current testnet is also not verified.

## Whitechain ($15,000)

All four Whitechain prizes require: "Contracts deployed on Whitechain Sepolia (chain ID 1874) and verified on the Whitechain explorer At least one payment in USDT (0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7) settled on Whitechain in your main flow ..."

1. Operate · Stablecoin Payments for Business, $5,000. Verdict: no. Cordon has no payment flow.
2. Tokenize · Real World Finance on Whitechain, $4,000. Verdict: no. No real world asset.
3. Scale · Payments Nobody Notices, $3,000. Verdict: no. No payer flow.
4. Continuity · Bring Your Product to Whitechain, $3,000. Extra requirement: "Proof of your starting point, for example a dated commit from before the hackathon or the page of your earlier submission". Verdict: no. The page does not mark it Continuity only, but it needs a product that existed before the event, and Cordon has none.

Chain check: Ankr's docs list Whitechain Sepolia as chain ID 1874 settling on Ethereum Sepolia. Source: [ankr.com/docs/rpc-service/chains/chains-api/whitechain](https://www.ankr.com/docs/rpc-service/chains/chains-api/whitechain/), accessed 6 Nov 2026 through search results; Whitechain's own docs were not opened, so not verified.

## Ethereum Foundation ($15,000)

One EF prize per project: "You can submit to anon-rpc, the alt mempool and CROPS, but you will be placed in at most one."

1. Best Use of Anon-RPC, $5,000. Requirement: "Your app routes its RPC reads through Anon-RPC by default. If you're building a worker or the harness, a simple demo app is enough." Verdict: partly. The guard and dashboard read SealRegistry over RPC, and hiding who reads the Sealed list is a real privacy gain, but every read would have to route through Anon-RPC by default, and Base Sepolia support is not verified (below).
2. Best use of the Frame Transaction Alternative Mempool, $5,000. Requirement: "Show real alt mempool usage: a link to your admitted transaction on the devnet explorer, or code that submits one." Verdict: no. Nothing in Cordon needs frame transactions.
3. Best CROPS App: Censorship Resistant, Open Source, Private, Secure, $3,500. Requirement: "Public repo under a free and open-source license (MIT, Apache-2.0, GPL, MPL or similar), with a README that explains how to run it. The README has a section titled CROPS, one or two lines per letter ... A demo video (3 minutes max) that shows the lead property working end to end, including the moment it matters ... No third-party trackers or analytics in the client. If the project handles keys or personal data, they stay on the user's device, or the README says why not." Verdict: partly, and the closest fit. The guard downloads the full Sealed list and checks locally so no server learns which packages a user has (P), it keeps working from a signed snapshot when the chain or watcher is down (C), keys stay local. The MIT LICENSE, the license fields in package.json and the CROPS section in README.md now exist. Still to do: the video must show the moment, for example switching off the RPC and the guard still blocking from the snapshot. No tracker found in apps/dashboard. This is the primary target.
4. Best CROPS Upgrade to an Existing Project, Continuity only, $1,500. Requirement: "The README states what the project looked like before the hackathon and which property is new." Verdict: no. Continuity only.

Chain check for Anon-RPC: the project site says "The anonymizing networks live on mainnet today" and points to an Adopters page for each network; it names no chain, does not mention Base or Base Sepolia, and describes a browser harness, with no clear Node.js support for the guard CLI. Source: [ethereum.github.io/anon-rpc](https://ethereum.github.io/anon-rpc/), accessed 6 Nov 2026. Base Sepolia support and Node.js use: not verified. CROPS needs no specific chain.

## ENS ($10,000)

1. Best Use of ENSv2, $7,000. Requirement: "Project must be built on ENSv2 on Ethereum mainnet or Sepolia. ENSv2 features should be central to the product, not a cosmetic add-on. Your demo must be functional and not just include hard-coded values ..." Verdict: no. Naming detectors with ENS subnames would be cosmetic, and Cordon runs on Base Sepolia.
2. Best Integration of ENSv2 into an Existing Project, Continuity only, $3,000. Requirement: "Integration must use ENSv2 on Ethereum mainnet and integrate it into an existing project." Verdict: no. Continuity only.

Chain check: ENS docs describe ENSv2 Permissioned Registry and a Sepolia deployments section, but search showed a docs pull request with Sepolia addresses marked TBD. Source: [docs.ens.domains/ensv2/overview](https://docs.ens.domains/ensv2/overview), accessed 6 Nov 2026 through search results only. Sepolia deployment not verified.

## Definitive ($5,000)

1. Best Use of Flash Advanced Orders in a Social App, Continuity only, $2,500. Requirement: "A working trading flow powered by Flash API or Flash MCP advanced orders ..." Verdict: no. Continuity only, and no trading.
2. Most Creative Use of Definitive Flash Advanced Orders, Continuity only, $2,500. Requirement: same text. Verdict: no. Continuity only.

## Chainlink ($5,000)

1. Best workflow with CRE, $1,500. Requirement: "Build, simulate, or deploy a CRE Workflow that's used as an orchestration layer within your project ... Integrate at least one blockchain with an external API, system, data source, LLM, or AI agent. Demonstrate a successful simulation (via the CRE CLI) or a live deployment on the CRE network. Be meaningfully used in your project" Verdict: partly, entered as a simulation only. Built: the cordonAdvisory workflow in cre/cordonAdvisory (HTTP trigger, OSV query with identical consensus, a report written to a receiver), contracts/src/CordonCreReceiver.sol, which turns the report into a submitVerdict call, and contracts/script/DeployCre.s.sol, which deploys a fresh SealRegistry with the receiver as a detector. A dry run `cre workflow simulate` works locally with CRE CLI v1.39.0. Not done: a broadcast simulation (needs a deployed receiver and registry and a funded CRE_ETH_PRIVATE_KEY) and a CRE deployment (deploy access pending). The honest claim is "simulated", never "running on CRE". It is first in the cut order.
2. Best use of Chainlink CCIP 2.0, $3,500. Requirement: "Each project must use Chainlink CCIP in some form to make a state change on a blockchain ... Using Chainlink CCIP inside your smart contracts is required ..." Verdict: partly. Sending each Sealed event over CCIP to a mirror registry on a second chain would qualify, but needs CCIP sender and receiver contracts, LINK or native fees and a second testnet deployment; high effort for 24 hours.

Chain check for CRE, accessed 6 Nov 2026:
1. Supported networks: Base Sepolia is listed as a testnet with minimum CLI v1.0.0, Go SDK v1.0.0 and TS SDK v1.0.1; page last updated 2026-10-19. The page says to run `cre workflow supported-chains` to see the chains enabled for your organization. Sources: [supported networks (TS)](https://docs.chain.link/cre/supported-networks-ts.md), [supported networks (Go)](https://docs.chain.link/cre/supported-networks-go.md).
2. Where a simulation can write: the Forwarder Directory (last updated 2026-09-18) lists Base Sepolia (chain name ethereum-testnet-sepolia-base-1) in its simulation testnets table with MockKeystoneForwarder 0x82300bd7c3958625581cc2f77bc6464dcecdf3e5, and says "These `MockKeystoneForwarder` addresses are used when running `cre workflow simulate` with the `--broadcast` flag." The production KeystoneForwarder on Base Sepolia is 0xF8344CFd5c43616a4366C34E3EEE75af79a74482. Source: [forwarder directory (TS)](https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory-ts.md).
3. Simulation behaviour: "By default, the simulator performs a dry run for onchain write operations"; a real write needs --broadcast and a funded wallet. The page lists as a prerequisite "You must have a CRE account and be logged in with the CLI", and EVM RPC URLs come from project.yaml for the chosen target. Page last updated 2026-10-30. Source: [simulating workflows](https://docs.chain.link/cre/guides/operations/simulating-workflows.md).
4. Templates: [smartcontractkit/cre-templates](https://github.com/smartcontractkit/cre-templates) has custom-data-feed (off chain HTTP data pushed onchain) and other starters; the README read did not state default chains.
5. docs.chain.link/cre and docs.chain.link/cre/supported-networks returned 404 to our fetcher; the pages above were reached through their .md and guide paths.
6. Since then the CRE CLI v1.39.0 was installed and a dry run simulation ran locally. Not recorded here: our organization's `cre workflow supported-chains` output.

## Shortlist

Ranked by the 7 Nov 2026 plan. Cordon can enter three partner prizes; both EF items count as one EF placement.

1. Ethereum Foundation, Best CROPS App, $3,500. Primary. Chain: any; it runs on a local chain today and on Base Sepolia once SealRegistry is deployed. License and CROPS section are done; left is the video showing the guard blocking from the signed snapshot with the RPC switched off. Fit is structural, since local matching and the snapshot fallback already exist.
2. Chainlink, Best workflow with CRE, $1,500. Simulation only. Workflow, receiver and deploy script are built and a dry run simulation works locally; a broadcast simulation needs a funded key and deployed contracts, and deployment needs access Chainlink has not granted yet.
3. Arkiv, Build on Arkiv (from scratch), $4,000. Planned and conditional: the code is built, but the writer is unfunded and no entity exists, so Cordon enters only if a real write is shown before submission. Chain ID of the current testnet not verified.
4. Ethereum Foundation, Best Use of Anon-RPC, $5,000. Chain: whichever networks Anon-RPC serves; Base Sepolia not verified and Node.js support unclear. Only as an alternative EF placement to CROPS, never in addition.
5. Hedera, AI Agents That Pay: x402 on Hedera, $6,500. Chain: Hedera testnet. Effort high and off the core story; consider only if items 1 to 3 are done early.

Requirements Cordon cannot meet in time: every Continuity only prize; every Arc prize unless a mentor confirms locally built contracts count as "Built in Arc Studio"; every Whitechain prize (USDT settlement on chain 1874); Hedera "No Solidity Allowed" (SealRegistry is Solidity).
