# Bulkhead

Circuit breaker for npm dependencies. Independent detectors vote that a package version is malicious; at quorum an onchain registry marks that version Sealed; a guard in installs, CI and running services blocks Sealed versions before they execute. ETHGlobal Mumbai 2026, From Scratch track. Submission deadline Sat 7 Nov 2026, 09:00 IST. The product name lives only in productName in packages/shared/src/constants.ts.

Read docs/architecture.md before touching code. packages/shared holds the types, schemas, hashing and ABIs every part uses. Change shared first, then callers. The full team brief is docs/prompts/bulkhead.md.

## Hard safety rules
1. Never write real malware or real exploit code. Demo packages only touch a canary value and a temporary folder, and send it to a local sink.
2. Never mount a real home directory in any sandbox. Sandboxes are disposable and isolated from real files and secrets.
3. Demo detectors are run by us and are labelled simulated in the interface and the README.
4. Never invent incident data. Historical replays use real public advisories with verified, linked sources.
5. The workspace never runs install scripts (.npmrc ignore-scripts) and demo/poisonedPackage is never a workspace member.

## Design rules
1. Block before execution: check every lockfile version, transitive included, before download, and install with scripts disabled.
2. Provenance and signatures are never an allow signal.
3. Seal per version, never per package.
4. The guard downloads the full Sealed list and checks locally.
5. Abuse resistance: evidence hash, quorum of distinct detector keys, dispute window, guardian multisig unseal, seal rate limit.
6. Chain outage falls back to a cached signed Sealed list. Fail open or closed is a config value with no default until the team decides.
7. If a Sealed version was already installed, the guard advises credential rotation.
8. Optional minimum package age.
9. Timeline timestamps for publish, first verdict, quorum on chain and guard block, shown as a stopwatch.
10. npm only. Typosquatting and dependency confusion are out of scope.

## Stack
Solidity 0.8.24, Foundry, OpenZeppelin v5. TypeScript on Node 22 (.nvmrc), Fastify, zod, viem, node:sqlite. Next.js App Router, Tailwind, wagmi. Docker for the sandbox. pnpm workspaces with the store inside the repo. Chain only from env, default Base Sepolia. Nothing depends on Arc Studio until the team confirms the mentor answer.

## Style rules
1. No comments in any code file. Names carry the meaning.
2. No dashes or hyphens in anything you write: prose, UI copy, README, docs, commit messages, identifiers and filenames. Use camelCase or underscores. Exempt: third party package names, CLI flags, lockfiles and tool mandated filenames such as pnpm-workspace.yaml. Arithmetic operators are fine.
3. No em dashes anywhere.
4. Keep code short. Small functions, no speculative abstractions, no wrapper classes, no helper with a single caller.
5. Handle errors once at boundaries with clear messages. No blanket try catch.
6. Tests assert behaviour. Mock only the network edge. No tests that assert nothing.
7. No TODO, FIXME, HACK or NOTE markers. No dead code. No unused dependencies.
8. Commit messages are short and plain.

## AI slop to avoid
Code: comments restating code, over commented functions, premature abstraction, factories and managers with one caller, verbose names, cookie cutter error handling, try catch around everything, tests that test nothing, heavy mocking, vibe platform packages.
Design: gradients, glassmorphism and backdrop blur, glowing cards, emoji as icons, stock photo feel, fake trusted by logos or testimonials, lorem ipsum, the centered hero with two buttons, the three column icon feature grid, generic purple and blue palette.
Writing: em dashes, "it is not X, it is Y", "here is why", words like delve, seamless, robust, leverage, unlock, revolutionize, cutting edge, emoji in the README, bold on every bullet, giant feature tables, vague claims without numbers, headings that repeat the paragraph below them.
Process: do not copy an earlier pattern into new code without checking it against this list.

## Process
1. Each agent edits only the paths it owns (docs/architecture.md, Ownership). Agents report new files to the orchestrator, who records them in docs/ai_usage.md.
2. docs/decisions.md belongs to the team. No agent edits it.
3. Ask the team before anything that spends funds, needs a key, or installs outside the repo.
4. Commit small and often.

## Commands
Use Node 22: `source ~/.nvm/nvm.sh && nvm use 22`.
`pnpm install`, `pnpm typecheck`, `pnpm test`.
