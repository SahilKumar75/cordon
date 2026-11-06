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

Requires Node 22, pnpm, Docker and Foundry.

```sh
source ~/.nvm/nvm.sh && nvm use 22
pnpm install
pnpm typecheck
pnpm test
git submodule update --init
(cd contracts && forge build && forge test)
```

Demo stack (mock registry, canary sink, three demo services with guard sidecars):

```sh
sh demo/setup.sh    # packs demo tarballs, builds the canary sink image, installs services with scripts disabled
sh demo/start.sh    # starts everything on 127.0.0.1, logs in demo/logs
sh demo/stop.sh
sh demo/reset.sh    # clears demo registry storage, sink data, logs, watcher database and snapshot
```

Detectors, watcher and dashboard:

```sh
pnpm --filter @cordon/detectors start
pnpm --filter @cordon/watcher start
pnpm --filter @cordon/dashboard dev
```

Guard CLI (exit codes: allowed 0, blocked 1, unavailable 2):

```sh
node packages/guard/bin/cordon.js check --lockfile path/to/package-lock.json
node packages/guard/bin/cordon.js install --lockfile path/to/package-lock.json
```

## Environment

Every variable is listed with an empty value in [.env.example](.env.example); demo defaults are in demo/demo.env.example. What each variable does and which part reads it is in the Environment section of [docs/architecture.md](docs/architecture.md#environment). The chain comes only from env; the default is Base Sepolia (chain id 84532).

## Demo

1. Run demo/setup.sh and demo/start.sh, then the detectors, watcher and dashboard.
2. On the dashboard /demo page, publish @cordondemo/colorkit 1.4.1. Its postinstall sends a fake canary token to the local sink and nothing else.
3. The detectors vote, SealRegistry seals 1.4.1 at quorum 2 of 3, and the stopwatch fills in.
4. ordersApi and notifyWorker (on 1.4.1) go unhealthy; searchApi (on 1.4.0) keeps serving.
5. Show the TanStack replay: a timeline only, built from OSV and npm registry times, labelled as a replay, never written to the chain.

The full script will be in docs/demo.md.

## Deployment

The testnet deployment is pending. Contract addresses and explorer links will be added here.

## CROPS

Lead property: censorship resistant. The guard keeps blocking sealed versions when our watcher and the chain RPC are both unreachable, from the last signed snapshot it cached, and the demo shows that moment with the RPC switched off.

C: we run the watcher (signed snapshots, timeline) and, in the demo, all three detectors; users also depend on an RPC provider and Base Sepolia. If the watcher goes away the guard reads SealRegistry directly; if the RPC goes away it uses the cached signed snapshot until GUARD_SNAPSHOT_MAX_AGE_SECONDS; after that the age fallback blocks versions younger than N days.

O: MIT license (LICENSE). Everything builds and runs from this repo with Node 22, pnpm, Foundry and Docker, using the commands above; no hosted service of ours is required.

P: the guard downloads every sealed key and matches the lockfile locally, so the RPC provider and the watcher never learn which packages a project uses. Guard reports go nowhere unless GUARD_REPORT_URL and a reporter key are set. The minimum age check, the age fallback and rollback ask the npm registry about named packages, as listed in docs/limits.md. The dashboard has no trackers or analytics, and its fonts are bundled at build time.

S: every private key stays in the local .env, which git ignores and the fitness tests check. Trust assumptions: a seal needs a quorum of distinct detector keys; the snapshot is only trusted when its signer, chain, registry and age all check out; the demo uses a single guardian key for unseal and reseal, a single point of failure described in docs/limits.md.

## Limits and honest claims

What Cordon does not do is in [docs/limits.md](docs/limits.md). In short:

1. npm only. Typosquatting and dependency confusion are out of scope.
2. Only npm-shrinkwrap.json and package-lock.json with lockfileVersion 2 or 3. No claim of npm 12 support.
3. Git and other non registry sources block by default.
4. A runtime stop cannot undo install time theft that already happened.
5. A false seal is an outage until the guardian unseals after the dispute window. The demo uses a single guardian key.
6. The abuse protection (quorum, evidence hash, seal rate limit, dispute window, guardian), the runtime stop limits and the dispute window length are design choices, not research backed.
7. Provenance and npm signatures are never an allow signal: the May 2026 TanStack releases carried valid provenance ([docs/research/incidents.md](docs/research/incidents.md#tanstack-npm-compromise-11-may-2026)).

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
7. IBM Plex Sans and IBM Plex Mono, loaded through next/font from Google Fonts.

Data, advisory sources and servers:
1. OSV (api.osv.dev) for MAL advisories and replay timestamps.
2. The public npm registry (registry.npmjs.org) for publish times in replays.
3. The official node:22-alpine Docker image, pinned by digest, for the sandbox and canary sink.
4. Base Sepolia as the default testnet.
5. Incident and paper sources are listed with access dates in [docs/research](docs/research).

## AI usage

We built Cordon with Claude Code as an orchestrator with one subagent per area. The team wrote the product, safety and design rules and made every decision recorded in docs/decisions.md; AI generated most code and docs, and an AI reviewer audited each phase. Every prompt, agent file and generated file is listed in [docs/ai_usage.md](docs/ai_usage.md).
