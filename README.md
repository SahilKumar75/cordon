# Cordon

Circuit breaker for npm dependencies. Detectors vote that one exact package version is malicious. When a quorum of distinct detector keys agrees, an onchain registry marks that version Sealed, and a guard in installs, CI and running services blocks it before it runs.

Built at ETHGlobal Mumbai 2026, From Scratch track. In the demo all three detectors are run by our team and are labelled simulated. They are not independent operators.

## What it does

1. Seals per version. Sealing @cordondemo/colorkit 1.4.1 leaves 1.4.0 installable.
2. Blocks before execution. `cordon check` reads every lockfile entry, transitive ones included, and matches it against the Sealed list locally. `cordon install` runs npm ci with --ignore-scripts only when the outcome is allowed.
3. Stops running services. A sidecar per service answers 503 on its health check while the service depends on a Sealed version.
4. Finds what is already installed. `cordon audit` scans lockfiles, npm caches and saved Docker images, and lists editor and coding agent hook files to inspect.
5. Proposes a rollback to the highest earlier version that is not Sealed, as an npm overrides snippet. It never edits files.
6. Shows a stopwatch from publish to first verdict to quorum to first block.

Most malicious npm packages act at install time: in one 2026 benchmark, "Among 6,420 malicious packages, 4,636 (72.21%) exploit installation scripts as attack vectors" (Guo, Chen and others, arXiv 2603.27549, see [docs/research/papers.md](docs/research/papers.md#figures-check)). That is why the guard acts before install, not after.

## Why on chain

1. One public list. Every guard reads the same Sealed list, and anyone can check who voted, with which evidence hash, and when.
2. Distinct keys. Each detector signs from its own key, and SealRegistry counts distinct keys, so the quorum is enforced by the contract, not by our server.
3. Public overrides. Unseal and reseal are guardian transactions with a dispute window, visible to everyone who depends on the list.
4. Private lookups. The guard downloads the whole list and matches locally, so it never reveals which packages a project uses.

## How it works

1. Detectors (services/detectors). Three methods that fail in different ways: staticScripts reads install scripts and the files they call without running them; sandboxCanary installs a demo tarball in a disposable Docker container with a fake canary secret and watches whether it leaves; advisoryFeed looks up OSV malicious package advisories (MAL ids). A seal needs agreement from methods that fail differently, so one blind spot or one compromised key cannot seal a version alone. In the demo all three are run by the team and labelled simulated.
2. SealRegistry (contracts/). Solidity 0.8.24 on OpenZeppelin v5 AccessControl. Records votes, seals at quorum, rate limits seals per UTC day, and lets the guardian unseal only after the dispute window.
3. Guard (packages/guard, CLI `cordon`). Reads the Sealed list from the chain first, then from a signed snapshot. If neither is available it falls back to blocking versions younger than N days.
4. Watcher (services/watcher). Follows the registry changes feed, sends new versions to the detectors, reads chain events into a hash chained timeline, and signs snapshots of the Sealed list.
5. Dashboard (apps/dashboard). Stopwatch, attestation feed, Sealed list, evidence per detector, service status, guardian actions, and a historical replay labelled as a replay.

Full design: [docs/architecture.md](docs/architecture.md).

## Run locally

Requirements, on macOS or Linux:
1. Node 22 through nvm (the repo has .nvmrc).
2. pnpm 10, for example through `corepack enable`.
3. Docker, running.
4. Foundry installed with foundryup, so forge, cast and anvil are in ~/.foundry/bin. The tests and scripts call them from there.
5. git, curl and lsof.

Clone, install and test:

```sh
git clone --recursive https://github.com/SahilKumar75/cordon.git
cd cordon
source ~/.nvm/nvm.sh && nvm use 22
pnpm install
(cd contracts && ~/.foundry/bin/forge build && ~/.foundry/bin/forge test)
pnpm typecheck
pnpm test
```

pnpm keeps its store inside the repo and never runs install scripts (.npmrc). The first install downloads about 500 packages and took two minutes on our machine. `pnpm test` runs every package and the fitness and chaos tests, which start their own anvil chains. The Docker sandbox test is skipped unless you ask for it:

```sh
CORDON_DOCKER_TESTS=1 pnpm --filter @cordon/detectors test
```

## Local demo, no testnet and no keys needed

```sh
bash ops/e2eLocal.sh --hold
```

This starts a local anvil chain, generates throwaway keys into ops/keys/local.env (ignored by git), deploys SealRegistry, packs the demo package, builds the canary sink image, and starts the mock registry, canary sink, three demo services with guard sidecars, the detectors, the watcher and the dashboard. When it prints that the stack is up, open http://127.0.0.1:3000/demo and publish @cordondemo/colorkit 1.4.1. To run guard commands against the same stack, open a second terminal in the repo:

```sh
set -a; . demo/demo.env; set +a
node packages/guard/bin/cordon.js check --lockfile demo/services/ordersApi/package-lock.json
```

Exit codes: allowed 0, blocked 1, unavailable 2. Press Ctrl+C in the first terminal to stop everything; it clears the demo state and the generated demo/demo.env. It needs ports 3000, 4101 to 4103, 4201 to 4203, 4301, 4302, 4873, 4880 and 8546 free.

Without `--hold` the same script runs the whole flow on its own, including the RPC off and watcher off checks, and prints pass or fail for each step and the stopwatch.

To run the parts by hand against a deployed chain, load the root .env (`set -a; . ./.env; set +a`) and start each one: `sh demo/setup.sh`, `sh demo/start.sh`, `pnpm --filter @cordon/detectors start`, `pnpm --filter @cordon/watcher start`, `pnpm --filter @cordon/dashboard dev`. docs/demo.md lists the order for a recorded take.

## Evidence on Arkiv

Each detector's evidence is also stored on the Arkiv testnet Rabdi (chain id 7794095) as an entity of schema cordon.evidence, written by the wallet 0xDe760446b5a7fFf40f17625f77d4165BaA013Fc9. The detectors service and the dashboard read it back by evidenceHash, the same hash each SealRegistry vote carries, so a verdict can be checked without our server. Details in [arkiv/](arkiv/schema.md).

Entities appear only after that wallet is funded with tGLM and a scan runs with ARKIV_PRIVATE_KEY set; until then the query below returns an empty list. Replace the hash with an evidenceHash from a vote:

```sh
curl -s https://rpc.rabdi.db-chain.testnet.arkiv.network -H 'content-type: application/json' --data @- <<'JSON'
{"jsonrpc":"2.0","id":1,"method":"arkiv_query","params":["arkiv.schema = str('cordon.evidence') AND evidenceHash = str('0x0000000000000000000000000000000000000000000000000000000000000000')",{"select":{"key":true,"owner":true,"attributes":true},"limit":"0x5"}]}
JSON
```

The body attribute is the evidence JSON as hex. Recompute its hash before trusting it: anyone can write an entity under the same schema name.

## Environment

Every variable is listed with an empty value in [.env.example](.env.example); demo defaults are in demo/demo.env.example. What each variable does and which part reads it is in the Environment section of [docs/architecture.md](docs/architecture.md#environment). The chain comes only from env; the default is Base Sepolia (chain id 84532).

## Demo

1. Start the local demo above, or the testnet stack as in docs/demo.md.
2. On the dashboard /demo page, publish @cordondemo/colorkit 1.4.1. Its postinstall sends a fake canary token to the local sink and nothing else.
3. The detectors vote, SealRegistry seals 1.4.1 at quorum 2 of 3, and the stopwatch fills in.
4. ordersApi and notifyWorker (on 1.4.1) go unhealthy; searchApi (on 1.4.0) keeps serving.
5. Show the TanStack replay: a timeline only, built from OSV and npm registry times, labelled as a replay, never written to the chain.

The full script is in [docs/demo.md](docs/demo.md). Screenshots of every dashboard page in loading, empty, error and normal states are in [docs/screenshots](docs/screenshots).

## Deployment

The testnet deployment is pending. Contract addresses and explorer links will be added here.

One command deploys to the chain in .env once the deployer holds at least 0.012 ETH:

```sh
bash ops/deployTestnet.sh
```

It checks that RPC_URL serves CHAIN_ID, tops up the detector, guardian and snapshot signer accounts to 0.002 ETH each, deploys SealRegistry with the QUORUM, DISPUTE_WINDOW_SECONDS and MAX_SEALS_PER_DAY in .env, writes REGISTRY_ADDRESS, REGISTRY_START_BLOCK and the dashboard values into .env and demo/demo.env, reads the settings and roles back from the chain, and submits the source to Sourcify. It prints addresses and explorer links only, never keys. Run it again for a fresh SealRegistry before each recorded take.

## CROPS

Lead property: censorship resistant. What the demo shows: with the chain RPC switched off, `cordon check` still blocks @cordondemo/colorkit 1.4.1 from the watcher's signed snapshot; with our watcher stopped as well, it still blocks it from the signed snapshot it cached, and exits 1 both times. The P and S lines below describe how the code works; the video does not show them.

C: we run the watcher and, in the demo, all three detectors; users also depend on an RPC provider and Base Sepolia. Without the RPC and the watcher the guard uses its cached signed snapshot until GUARD_SNAPSHOT_MAX_AGE_SECONDS, then blocks versions younger than N days and says so.

O: MIT license (LICENSE). Everything builds and runs from this repo with Node 22, pnpm, Foundry and Docker, using the commands above; the local demo needs no testnet and no hosted service of ours.

P: the guard downloads every sealed key and matches the lockfile locally, so the sealed list lookup sends no package name to the RPC provider or the watcher. Guard reports are sent only when GUARD_REPORT_URL and a reporter key are set, and then they carry the blocked package names and the lockfile path to the watcher. The minimum age check, the age fallback and rollback ask the npm registry about named packages (docs/limits.md). The dashboard has no trackers or analytics.

S: private keys stay in local files that git ignores, which the fitness tests check: .env, demo/demo.env (the guard reporter key) and ops/keys/local.env (throwaway keys for the local demo). A seal needs a quorum of distinct detector keys, and a snapshot is trusted only when its signer, chain, registry and age check out.

Limits that weaken these properties:
1. In the demo all three detectors are run by us, so a quorum of distinct keys is not a quorum of independent operators.
2. The guardian is a single key, a single point of failure for unseal and reseal.
3. Roles freeze at deploy: nobody holds the admin role, so changing a detector or the guardian means deploying a new SealRegistry and pointing every guard at it.

## Try it in your project

Limits first: npm lockfile v2 and v3 only, one operator runs every detector and the guardian key today, and this is a testnet prototype. Do not rely on it to protect production.

```sh
git clone https://github.com/SahilKumar75/cordon && cd cordon
pnpm install
cp .env.example .env
```

Set CHAIN_ID, RPC_URL, REGISTRY_ADDRESS and REGISTRY_START_BLOCK in .env to the values in Deployment below, and GUARD_CACHE_DIR to a folder of your choice. Then, from the cordon folder:

```sh
set -a; . ./.env; set +a
node packages/guard/bin/cordon.js check --lockfile /path/to/your/project
```

Exit code 0 means allowed, 1 blocked, 2 unavailable. `install` runs npm ci with scripts disabled only when the check allows it; `audit --path` scans folders, caches and Docker image exports for Sealed versions; `rollback` proposes the last safe version and edits nothing.

## Related work

Socket Firewall, Aikido SafeChain, Datadog scfw, Dependency Guardian and the ETHGlobal npmguard projects already block malicious npm packages at install time, and OSV with the OpenSSF malicious packages repository supplies the MAL advisories our advisory detector and CRE workflow read. We claim no novelty. Cordon tries a different place for the verdict: a public registry contract that a quorum of distinct detector keys writes to. Details and links in [docs/related_work.md](docs/related_work.md).

## Limits and honest claims

What Cordon does not do is in [docs/limits.md](docs/limits.md). In short:

1. npm only. Typosquatting and dependency confusion are out of scope.
2. Only npm lockfiles are protected: npm-shrinkwrap.json and package-lock.json with lockfileVersion 2 or 3. pnpm, yarn and bun lockfiles, and npm lockfile version 1, return outcome unavailable (exit 2): the guard neither blocks nor allows them. No claim of npm 12 support.
3. Git and other non registry sources block by default.
4. A runtime stop cannot undo install time theft that already happened.
5. A false seal is an outage until the guardian unseals after the dispute window. The demo uses a single guardian key.
6. The abuse protection (quorum, evidence hash, seal rate limit, dispute window, guardian), the runtime stop limits and the dispute window length are design choices, not research backed.
7. The chain read trusts the RPC. The one check against a lying RPC is monotonic: the guard records every version it has seen sealed (in GUARD_CACHE_DIR, per chain and registry) and rejects a list that drops one unless the chain marks it Unsealed and an Unsealed event for it exists; it then uses the signed snapshot and keeps the recorded versions blocked. A guard with no record yet, or no GUARD_CACHE_DIR, cannot detect an RPC that hides seals on its first read.
8. Votes expire after VOTE_LIFETIME_SECONDS (fixed at deploy, 86400 in our config), so a stale vote no longer counts toward quorum. A detector key that is compromised can still vote again inside each lifetime until the registry is replaced, because roles are frozen.
9. The seal key uses the name and version in the lockfile entry's resolved registry tarball URL, because that is what npm ci downloads. A lockfile that renames, recases or adds build metadata to a sealed version is checked as the sealed version. Entries without a resolved URL fall back to the declared name and version.
10. Provenance and npm signatures are never an allow signal: the May 2026 TanStack releases carried valid provenance ([docs/research/incidents.md](docs/research/incidents.md#tanstack-npm-compromise-11-may-2026)).

## Chainlink CRE, simulation only

The advisoryFeed check (an OSV lookup for MAL ids) is also a Chainlink CRE workflow in cre/cordonAdvisory, and contracts/src/CordonCreReceiver.sol turns a CRE report into a vote on SealRegistry. Design and trade offs: docs/cre_design.md.

1. Deployment access is pending: we requested it from Chainlink and it has not been granted. Nothing here is deployed on the CRE network; everything below is simulation only.
2. When a workflow is deployed, Chainlink chooses and runs its node operators. We do not choose them.
3. Simulation runs the workflow in one local process, so the agreement between many nodes applies only to a deployed workflow.
4. On chain, a CRE report is one detector vote, so quorum still needs a second detector. Run the detectors service with OFF_CHAIN_DETECTORS=advisoryFeed so the local advisory check keeps its evidence but no longer votes.
5. Each node parses the OSV answer itself and only the sorted MAL ids and the advisory's modified time go to consensus; the raw OSV answer (44 KB for the TanStack advisory) exceeds the 25 KB observation limit.
6. The CRE CLI v1.39.0 was installed from the official release script after we checked its source repository, smartcontractkit/cre-cli.

What ran on 6 Nov 2026, as a dry run with no transaction and no funds:

```sh
cd cre
cre workflow simulate cordonAdvisory --target staging-settings --non-interactive --trigger-index 0 --http-payload '{"name":"@tanstack/react-router","version":"1.169.5"}'
cre workflow simulate cordonAdvisory --target staging-settings --non-interactive --trigger-index 0 --http-payload '{"name":"ms","version":"2.1.3"}'
```

The first called OSV, found MAL-2026-3465, built and signed the report and ran writeReport as a dry run; the second came back clean and wrote nothing. Simulation needs CRE_ETH_PRIVATE_KEY in cre/.env (ignored by git); a dry run never spends it. A broadcast simulation needs that key funded with Base Sepolia ETH and a receiver deployed with contracts/script/DeployCre.s.sol.

Run both simulations with one command: `bash ops/creDemo.sh` (dry run, no transaction).

Tests without the CLI: `cd cre/cordonAdvisory && bun install --ignore-scripts && bun test`, and `cd contracts && forge test --match-contract CordonCreReceiver`.

## Scale roadmap

Built for the demo: every outbound request in the watcher and guard has a timeout (the guard's is GUARD_HTTP_TIMEOUT_MS, default 5 seconds), the registry and chain pollers run in parallel, SQLite runs in write ahead mode, the watcher serves its last saved snapshot right after a restart, and the detectors run at most two sandbox scans at once. Not built yet:

1. Scans run one publish at a time in the watcher scheduler.
2. Verdicts are submitted one after another and each waits for its receipt; this ordering is deliberate, because simultaneous votes failed gas estimation in rehearsal.
3. The guard pages through sealed keys sequentially.
4. SQLite calls are synchronous on the watcher's event loop.
5. Timeline heads are recomputed from every event on each snapshot.
6. GET /attestations returns every row without a limit.
7. Logs are plain text, not structured.
8. Failed polls retry on the fixed interval with no backoff.

## Roadmap

Replay quorum settings against a public malware benchmark to measure precision and recall trade offs.

## Credits

Libraries and tools:
1. OpenZeppelin Contracts v5.1.0 (AccessControl) and forge std v1.9.4, as git submodules.
2. Foundry (forge, cast, anvil).
3. viem, zod, Fastify, tar (node-tar).
4. Next.js, React, react-dom, wagmi, TanStack Query, Tailwind CSS with @tailwindcss/postcss.
5. TypeScript and @types/node, @types/react, @types/react-dom.
6. pnpm, Node 22 (node:sqlite, node:test), Docker.
7. Doto and Azeret Mono, loaded through next/font from Google Fonts.
8. motion, lenis, three, @react-three/fiber, @react-three/drei and @react-three/postprocessing for the dashboard scenes.
9. @arkiv-network/sdk for evidence entities, and @chainlink/cre-sdk with the CRE CLI for the simulated workflow.

Data, advisory sources and servers:
1. OSV (api.osv.dev) for MAL advisories and replay timestamps.
2. The public npm registry (registry.npmjs.org) for publish times in replays.
3. The official node:22-alpine Docker image, pinned by digest, for the sandbox and canary sink.
4. Base Sepolia as the default testnet.
5. Incident and paper sources are listed with access dates in [docs/research](docs/research).

## Provenance

Hacking began Thu 5 Nov 2026, 21:00 IST. Before that, between 16:51 and 17:02 IST, six commits prepared an earlier idea called Sluice: the event brief and rules, team prompts, a workspace scaffold, and a Sluice shared package, architecture and agent files. At 23:08 IST commit d384d82 deleted the Sluice code, architecture and agent files, and the Sluice work is archived under the tag `sluice_archived`. Every Cordon contract, service, package, interface and architecture file was first committed after 21:00 IST; the only earlier lines still in the tree are workspace configuration and planning text. The full list with timestamps is in [docs/provenance.md](docs/provenance.md). History has not been rewritten or squashed.

## AI usage

We built Cordon with Claude Code as an orchestrator with one subagent per area. The team wrote the product, safety and design rules and made the decisions on chain, target prizes, fail mode, scope and license, which CLAUDE.md, docs/rules.md and docs/ai_usage.md record; docs/decisions.md is the team's own file and is still empty; AI generated most code and docs, and an AI reviewer audited each phase. Every prompt, agent file and generated file is listed in [docs/ai_usage.md](docs/ai_usage.md).
