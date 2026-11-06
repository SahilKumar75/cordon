# Status report

Written 6 Nov 2026 around 22:30 IST from commands run on this machine. Nothing was changed, merged, deployed or spent to produce it; this file was committed afterwards at the team's request. Unverified items are marked.

## 1. Repository state

1. Current branch main, latest commit 2fb0946 (6 Nov 22:11, "Merge branch cre: Chainlink CRE advisory workflow, simulation only").
2. Branches: main 2fb0946, arkiv 41f24ab, cre eccbd5e, all pushed and equal to origin. Worktrees: the main checkout, plus scratchpad worktrees for arkiv and cre (outside the repo folder).
3. Uncommitted: none. Untracked: graphify-out/ (a generated code map, not part of the project) and this report.
4. Since 844410b: 12 commits, all made in this session between 20:28 and 22:11 on 6 Nov: edb9819 dashboard cursor and depth, 24bd9e6 e2e summary fix, ec643e8 CRE design, e50e7c6 readiness report, 106cc69 screenshots, 5c928e7 and a5b5777 CRE contract and workflow, 34017ab off chain switch, 68fc6d3 and 41f24ab Arkiv, eccbd5e CRE simulation, 2fb0946 merge. Since edb9819: 11 of those.
5. Not made in this session's own work: commit 29c11cb (6 Nov 17:46, flagged keys and the Cleared and Suspect states across contract, guard and watcher) carried changes written by another session ("Checker disagreement on package safety") that I committed unchanged at your request. All commits show the author Sahil Kumar Singh from git config.
6. Remote: main is 0 ahead and 0 behind origin/main. The repo is still private (gh reports PRIVATE).

## 2. Health on main

| Check | Result |
| --- | --- |
| pnpm install (frozen lockfile) | done |
| pnpm typecheck | 0 errors |
| forge test | 58 passed, 0 failed (SealRegistry 53, CordonCreReceiver 5) |
| pnpm test | 192 passed, 0 failed, 1 skipped (the Docker sandbox test, needs CORDON_DOCKER_TESTS) |
| CRE workflow bun test | 5 passed, 0 failed |
| dashboard next build on a clean copy of main | compiled, exit 0 |
| dashboard next start | / 200, /sealed 200, /services 200, /guardian 200, /demo 404 because demo mode was off in that build, as designed |

Local end to end (ops/e2eLocal.sh), one run, every step passed:
1. anvil up, 6 keys funded, SealRegistry deployed, quorum 2 of 3
2. demo tarballs packed, canary sink image built, services installed with scripts disabled
3. detectors, watcher, mock registry, canary sink, 3 services with sidecars, 1.4.0 scanned clean
4. 1.4.1 published
5. watcher recorded the publish
6. staticScripts and sandboxCanary voted, key Sealed
7. signed snapshot lists the key as Sealed
8. ordersApi and notifyWorker answer 503, searchApi on 1.4.0 answers 200
9. stopwatch complete: first verdict +5.4s, quorum +6.4s, first block +8.3s
10. cordon install exits 1 and runs no npm ci
11. RPC off: blocks from the signed snapshot
12. RPC and watcher off: blocks from the cached snapshot
13. the last check used the cache

## 3. Features

| Feature | Status | Proof |
| --- | --- | --- |
| SealRegistry (quorum, rate limit, dispute window, frozen roles, vote lifetime, flagged and Cleared) | done | contracts/test/SealRegistry.t.sol, 53 tests, for example test_expiredVoteDoesNotCount |
| Detectors | done for the demo, partly for real npm | services/detectors, 51 tests; sandboxCanary runs only on demo registry tarballs, so a public version can get at most two votes (docs/coverage_matrix.md) |
| Watcher | done | services/watcher, 38 tests |
| Guard check, install, audit, rollback, sidecar | done | packages/guard, 70 tests; e2e steps 8, 10 to 13; docs/readiness_report.md runs in a fresh folder |
| Dashboard pages | done | build and start above; docs/screenshots, 24 images |
| Sidecar | done | e2e step 8 |
| Suspect state | done, but conflicts with the team rule | "a Suspect version blocks by default, names the override and proposes a rollback" in packages/guard/src/check.test.ts; the team rule says a hard block happens only at Sealed |
| Hardening against an RPC that drops sealed versions | partly | "an RPC that hides every seal after the guard saw one is rejected and the signed snapshot still blocks" in tests/chaos/lyingRpc.test.ts; not covered: a first read with no record, and an RPC that also forges the Unsealed event (docs/red_team.md item 5e, still open) |
| Fetch timeouts | done | services/watcher/src/timeouts.test.ts, packages/guard/src/timeouts.test.ts |
| Snapshot fallback | done | "the cached snapshot is used when the snapshot URL fails" in packages/guard/src/sealedList.test.ts; e2e steps 11 and 12 |
| Audit and rollback | done | packages/guard/src/audit.test.ts, rollback.test.ts; readiness report runs |
| Lockfile identity check | not done | docs/red_team.md items 3b, 3c, 3e: a forged name, case or build metadata in a lockfile still bypasses the seal key; still open |

## 4. Arkiv and CRE

Both are merged into main.

Arkiv: services/detectors/src/arkiv.ts publishes each evidence file as an entity in the background, only when ARKIV_PRIVATE_KEY is set; reading is always on. GET /evidence/:hash falls back to Arkiv when the local file is missing; the dashboard (apps/dashboard/lib/arkiv.ts, components/evidenceList.tsx) reads Arkiv directly when the detectors service is unreachable and rechecks the hash. The local file stays the first source. Tests: 4 in arkiv.test.ts and 2 in server.test.ts ("evidence missing on disk is read from Arkiv, and unknown evidence is still 404", "an Arkiv publish that never answers does not delay the votes"). Judging files: arkiv/schema.md, friction.md, reach.md, why-arkiv.md, how-you-use-arkiv.md. No entity has been written: the writer wallet 0xDe760446b5a7fFf40f17625f77d4165BaA013Fc9 has 0 balance on the Arkiv testnet (checked with eth_getBalance).

CRE: contracts/src/CordonCreReceiver.sol (5 tests), contracts/script/DeployCre.s.sol (rehearsed on local anvil only), workflow cre/cordonAdvisory (5 unit tests), switch OFF_CHAIN_DETECTORS=advisoryFeed in services/detectors (test "a detector listed as off chain keeps its evidence but sends no vote"). Without the switch the local advisoryFeed keeps voting as before. Two dry run simulations ran with CLI v1.39.0: TanStack 1.169.5 found MAL-2026-3465 and ran writeReport as a dry run; ms 2.1.3 came back clean. No broadcast. Deploy access: not enabled (cre whoami). The watcher does not trigger the workflow automatically; it is run by hand with cre workflow simulate.

Prize requirements, quoted from the ETHGlobal prizes page read on 6 Nov:

EF Best CROPS App: "Public repo under a free and open-source license (MIT, Apache-2.0, GPL, MPL or similar), with a README that explains how to run it." "The README has a section titled CROPS, one or two lines per letter" "A demo video (3 minutes max) that shows the lead property working end to end, including the moment it matters" "No third-party trackers or analytics in the client. If the project handles keys or personal data, they stay on the user's device, or the README says why not."
Today: license, README run steps, CROPS section, no trackers and local keys are met. Not met: the repo is private and no video exists.

Chainlink Best workflow with CRE: "Build, simulate, or deploy a CRE Workflow that's used as an orchestration layer within your project. Note: It is NOT mandatory to deploy it during the hackathon, simulation is enough!" "Integrate at least one blockchain with an external API, system, data source, LLM, or AI agent." "Demonstrate a successful simulation (via the CRE CLI) or a live deployment on the CRE network." "Be meaningfully used in your project"
Today: a successful CLI simulation exists, joining OSV to a Base Sepolia write as a dry run. Weak points: the write was never broadcast, and the workflow is triggered by hand, not by the watcher, so "meaningfully used" is arguable.

Arkiv Build on Arkiv (from scratch): "Built from scratch at ETHGlobal Mumbai, following ETHGlobal's rules." "Your app writes to Arkiv's current testnet (see the docs) with @arkiv-network/sdk or the JSON-RPC API, and at least one feature users see reads its data from Arkiv." "In your README: the wallet address(es) that wrote your entities, and one query we can run." "One file per criterion in How we judge" "A public repo with an open-source license. Say how you used AI, as ETHGlobal's rules require." "Not counted: the SDK installed but never used to read, or Arkiv used only as a log that nothing reads."
Today: code, judging files, README wallet and query, license and AI usage exist. Not met: nothing has been written to Arkiv, so the reading feature reads nothing yet; the repo is private.

For all three: the six commits made before hacking began (docs/provenance.md) need a written organizer answer for the From Scratch track.

## 5. Testnet

The Base Sepolia deployer 0x5074bB98a467cad945794880F6Ed339388bDfE5F has 0 wei and nonce 0. Nothing is deployed: contracts/deployments holds only .gitkeep and REGISTRY_ADDRESS is empty in .env. No version is sealed on any public chain. There is no registry address. The CRE simulation key 0x1560A5e2bf62c1950abc67763A9d60A6319C0A2f also has 0.

## 6. Docs

| Doc | Status |
| --- | --- |
| README CROPS section | present, accurate to the local demo; the testnet scene has not been recorded |
| README limits and honesty | present ("Limits and honest claims"), including lockfile coverage, vote lifetime and RPC trust |
| Related work | missing |
| Provenance | present (README section and docs/provenance.md) |
| Trust model | partly: spread across the CROPS S line, "Why on chain" and docs/limits.md; no single section |
| Quickstart for other projects | missing from README; a draft exists in docs/readiness_report.md section 9 |
| Code tour | present (docs/code_tour.md); does not cover Arkiv or CRE |
| Mentor brief | missing |
| Coverage matrix | present (docs/coverage_matrix.md); written before the RPC hardening, vote lifetime and timeouts, so several rows are stale |
| docs/decisions.md | exists and is empty (0 bytes); yours, not edited |
| docs/ai_usage.md | names 144 of 154 source files; not named: apps/dashboard/app/globals.css, components/demoControls.tsx, providers.tsx, replayPanel.tsx, sealDetail.tsx, serviceCard.tsx, timelineView.tsx, contracts/test/CordonCreReceiver.t.sol, demo/poisonedPackage/v1.4.0/index.js, v1.4.1/index.js (most are covered by section level entries, but not by name) |
| LICENSE | present, MIT |
| Screenshots | 24 retaken at 106cc69 after the redesign; the seal page evidence view gained an Arkiv label later (68fc6d3), not in the screenshots |
| docs/sponsor_fit.md, docs/open_decisions.md | stale on prize targets: they still describe Arkiv as dropped |

## 7. Safety

Secret scan over 868 history blobs, the tracked working tree and 320 build output files, including the real key values from .env and ops/keys/local.env: PASS.

Claims: no README, docs or dashboard text calls Cordon decentralized, trustless, first or production ready; every use of deployed is negated. The CRE section says simulation only and that Chainlink chooses its operators. The dashboard replay note states the red team result as a reconstruction. The README CROPS line says the video shows RPC off and watcher off; that scene has only run locally.

## 8. Submission readiness

| Item | Status | Who acts |
| --- | --- | --- |
| Public repo | blocked: still private; secret scan passes | you |
| Video | blocked: not recorded; the local demo works now, the testnet version needs funding | you |
| ETHGlobal project page | not verified from here | you |
| Track From Scratch selected | not verified; the dashboard showed no track earlier | you |
| Prize selection (EF CROPS, Chainlink CRE, Arkiv) | not verified | you |
| Written organizer answer on the six commits before the start | blocked, not asked as far as this session knows | you |

## 9. Blocked on you, in priority order

1. Ask an ETHGlobal organizer in writing whether the six commits before 21:00 IST on 5 Nov are acceptable for From Scratch.
2. Fund the Base Sepolia deployer with about 0.05 ETH and approve `bash ops/deployTestnet.sh`.
3. Fund the Arkiv writer with tGLM so the first evidence entity is written.
4. Record the video (CROPS asks for 3 minutes or less).
5. Decide whether Suspect versions block by default.
6. Set N in docs/decisions.md.
7. Decide where the signed snapshot is hosted for judges.
8. Make the repo public, then create the project page, select the track and the three prizes.
9. Optional: approve a CRE broadcast simulation (needs a funded simulation key and a receiver deploy).

## 10. Risks and cuts

Biggest risks:
1. No funded deployer means no testnet deploy, no real seal and no recorded RPC off scene on a public chain before 09:00.
2. Prize eligibility: the six commits before the start could cost partner prizes if the organizers object.
3. Arkiv counts for nothing until one real entity is written and read back.

Cut first if time is short: the CRE broadcast, then the judge quickstart extras (config generator, Node 20 support), then Arkiv if the writer is still unfunded two hours before the deadline. Keep SealRegistry, the guard install check, the stopwatch demo and the CROPS scene.
