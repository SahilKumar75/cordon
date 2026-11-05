SCOPE CHANGE. SLUICE IS RETIRED.
Before anything else, commit the current state and tag it sluice_archived, then remove the Sluice contracts, services and web code from the working tree. Keep docs/event_brief.md, docs/rules.md, docs/ai_usage.md, docs/prompts/ and git history. Do not write in docs/decisions.md, it belongs to me. Log this change in docs/ai_usage.md. If CLAUDE.md is missing, recreate it from the style rules and slop list in docs/prompts/master.md. All of those rules still apply, including no comments in code, no dashes or hyphens in anything you write, and no AI slop. Save this prompt as docs/prompts/bulkhead.md and commit it.

WHAT WE ARE BUILDING
Working name: Bulkhead, kept in one constant so it can be renamed. Bulkhead is a circuit breaker for npm dependencies. Several independent detectors sign a verdict that a package version is malicious. When enough of them agree, an on chain registry marks that version Sealed. A guard that sits in installs, CI and running services reads the registry, blocks Sealed versions before they execute, proposes a rollback to the last safe version, and records a tamper evident timeline from detection to block. Pitch: detection tells you, Bulkhead stops the flow.
Scope is npm only. Typosquatting and dependency confusion are out of scope.

HARD SAFETY RULES
Never write real malware or real exploit code. Demo packages only touch a canary value and a temporary folder, and send it to a local sink. Never mount a real home directory in any sandbox. Detectors in the demo are run by us and are labelled as simulated in the interface and the README.

DESIGN RULES FROM RESEARCH
1. Block before execution. The guard resolves and checks every package version from the lockfile, including transitive ones, before anything is downloaded or run, and runs installs with scripts disabled.
2. Never trust provenance or signatures as an allow signal. A malicious release with valid provenance happened in May 2026.
3. Worms can destroy files if blocked mid run. Any sandbox must be disposable and isolated from real files and secrets.
4. Seal per version, not per package.
5. A registry takedown does not clean existing installs. Provide an audit command that scans lockfiles, caches and Docker layers for Sealed versions.
6. Avoid leaking what people depend on. The guard downloads the full Sealed list and checks locally.
7. Plan for abuse. Require an evidence hash, a quorum of distinct detector keys, a dispute window and a guardian multisig that can unseal. Rate limit seals. A false seal is an outage we caused.
8. Handle chain outage with a cached signed Sealed list. Fail open or closed is my decision, so make it a config value and ask me before choosing a default.
9. A runtime stop cannot undo install time theft. When a Sealed version was already installed, the guard output must advise credential rotation.
10. Offer a minimum package age option as a complement to sealing.
11. Record timestamps for publish, first detector verdict, quorum on chain, and guard block. Show the latency as a stopwatch.

STRUCTURE
bulkhead/ README.md CLAUDE.md .gitignore .env.example package.json pnpm workspace file
.claude/agents/ contracts.md detectors.md watcher.md guard.md dashboard.md research.md reviewer.md docs.md
contracts/ src/SealRegistry.sol, test/, script/Deploy.s.sol
packages/shared/ types, schemas, abis, constants
packages/guard/ install check, lockfile audit, rollback proposal, runtime sidecar
services/detectors/ staticScripts, sandboxCanary, advisoryFeed, signer
services/watcher/ registry poller, scheduler, publisher
apps/dashboard/ live attestations, sealed list, service status, stopwatch, guardian unseal, demo panel
demo/ mockRegistry, poisonedPackage, three mock services, canary sink
docs/ architecture, demo, limits, rules, ai_usage, decisions, research/incidents, research/edge_cases, research/papers

CONTRACT SPEC
SealRegistry with roles. A key is the hash of ecosystem, name and version. Detectors submit a verdict with an evidence hash. When distinct detector votes reach the quorum, status becomes Sealed and an event fires. Guardian can unseal after the dispute window and can reseal. Tests cover quorum, duplicate votes, non detector calls, window timing, unseal and reseal, independent versions, and events.

DETECTORS
staticScripts flags install scripts that touch the network, environment variables or shell. sandboxCanary installs the package in a disposable container with fake secrets and watches for exfiltration to a local sink. advisoryFeed reads real public malicious package advisories for replay of historical incidents, verify the source before use. Never invent incident data.

AGENTS
Create the eight agent files, each with purpose, files owned, outputs, done criteria, and the rule to edit only its own files. The research agent keeps docs/research current with dated, linked sources and marks anything unverified. The reviewer is read only and audits each phase against the style rules and slop list.

PHASES
Phase 0: archive Sluice, scaffold, write the shared package and docs/architecture.md with exact interfaces. Stop and wait for my approval.
Phase 1 in parallel: contracts, detectors, guard, research.
Phase 2 in parallel: watcher, dashboard, demo.
Phase 3: end to end demo on testnet, replay one historical incident, reviewer audit, docs, README.
Cut order if time runs short: Chainlink CRE, minimum age option, runtime sidecar. Never cut the registry, the guard install check, or the stopwatch demo.

ETHGLOBAL RULES
Run git init if needed and commit small and often with short plain messages. Keep docs/ai_usage.md per file. Commit all prompts and agent files. Chain stays in env, default Base Sepolia. Build nothing that depends on Arc Studio until I confirm the mentor answers. Start with Phase 0 only.
