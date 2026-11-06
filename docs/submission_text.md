# Submission text

Paste these into the ETHGlobal project form. Field names below follow the form as we expect it; if a field is named differently, use the entry with the same meaning. Lines marked "team fills" are facts only the team can give.

## Project name

Cordon

## Tagline (short description)

Seal one malicious npm version on chain, and every guard blocks it before it runs.

## Description

Cordon is a circuit breaker for npm dependencies. Independent detectors each vote that one exact package version is malicious, with an evidence hash. When a quorum of distinct detector keys agrees, the SealRegistry contract marks that version Sealed. A guard then blocks it in three places: `cordon install` checks every lockfile entry, transitive ones included, before npm runs and installs with scripts disabled; a sidecar makes running services that depend on it fail their health check; and `cordon audit` finds copies already installed. Seals are per version, so 1.4.0 stays installable when 1.4.1 is sealed, and the guard proposes a rollback without editing files. If the RPC is down, the guard blocks from a signed snapshot; if our watcher is down too, from its cached copy. A false seal is an outage we caused, so the contract has a quorum, a seal rate limit, vote expiry and a dispute window before a guardian can unseal.

This is a testnet prototype. In the demo all three detectors and the guardian key are run by our team, the detectors are labelled simulated, and only npm lockfile v2 and v3 are supported.

## How it is made

Solidity 0.8.24 with Foundry and OpenZeppelin v5 AccessControl for SealRegistry, with frozen roles, quorum, vote lifetime, dispute window and a daily seal limit. TypeScript on Node 22 for the guard CLI, the detectors service and the watcher, using viem, zod, Fastify and node:sqlite. The three detectors are a static reader of install scripts, a Docker sandbox that installs the package with a canary value and no real files, and an OSV lookup that counts only MAL advisories. The watcher polls the registry and the chain in parallel, signs snapshots of the Sealed list, and keeps the stopwatch from publish to first block. The dashboard is Next.js with wagmi and reads SealRegistry directly; it has a read only mode with no backend. A Chainlink CRE workflow runs the OSV check across nodes that agree on the MAL ids and writes the vote through a receiver contract; it runs in the CRE simulator only. Code to store evidence on Arkiv, keyed by the same evidence hash the contract stores, is built but has not written any entity yet. We built it with Claude Code; docs/ai_usage.md lists every AI generated file.

## Links

1. Demonstration link: https://www.npmjs.com/package/npmcordon, the guard published on npm; `npx npmcordon check` reads the live Base Sepolia SealRegistry
2. GitHub: https://github.com/SahilKumar75/cordon
3. Demo video: uploaded to ETHGlobal.com (team fills)
4. Dashboard: not hosted; it runs locally and is shown in the video
5. Contract: SealRegistry on Base Sepolia, https://sepolia.basescan.org/address/0x07DCC100d48fBA912fEf3e14F61d1162596a0E8F

## Category

Developer Tools if the form lists it, otherwise Security.

## Tech tags

Solidity, Foundry, OpenZeppelin, TypeScript, Node.js, viem, wagmi, Next.js, Docker, Base Sepolia, Chainlink CRE.

## Prizes

1. Ethereum Foundation, Best CROPS App. The demo shows censorship resistance: with the RPC off and then our watcher off, the guard still blocks the sealed version from a signed snapshot. Open source under MIT; private keys never leave local ignored files. Limits: one operator, a single guardian key, a centralized RPC on the first read.
2. Chainlink CRE, as simulation only. The cordonAdvisory workflow runs in `cre workflow simulate`; it is not deployed, deployment access is pending, and Chainlink chooses its operators.
Arkiv is not selected: the writer wallet was never funded, so no evidence entity exists on Arkiv.

## Honest limits

npm only, lockfile v2 and v3 only. All detectors, the guardian and the snapshot signer are held by our team today, so the quorum is of keys, not of independent operators. The guardian is one key, not a multisig. Roles are frozen, so replacing a key means a new registry. A guard on its first read cannot detect an RPC that hides seals. A runtime stop cannot undo theft at install time. Related tools that already block malicious packages are credited in docs/related_work.md; we claim no novelty.

## Team

Team fills: names, roles and contact handles.

## AI usage disclosure

Built with Claude Code as an orchestrator with one subagent per area. The team set the product, safety and design rules and made the decisions on chain, target prizes, fail mode, scope and license. AI wrote most of the code and docs, and an AI reviewer audited each phase. Every prompt, agent file and generated file is listed in docs/ai_usage.md. docs/decisions.md holds the team's own answers, transcribed from their dictation.

## Provenance

Hacking began Thu 5 Nov 2026, 21:00 IST. Six commits before that prepared an earlier idea, Sluice; its code was deleted at commit d384d82 and archived under the tag sluice_archived. Every Cordon contract, service, package and interface file was first committed after 21:00 IST. History has not been rewritten or squashed. Details in docs/provenance.md.
