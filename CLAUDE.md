# Sluice

Research integrity oracle that gates grant money. ETHGlobal Mumbai 2026, From Scratch track. Submission deadline Sat 7 Nov 2026, 09:00 IST.

Read docs/architecture.md before touching code. Shared types, schemas, hashing and ABIs live in packages/shared and are the single contract between parts. Change shared first, then callers.

## Product rules
1. Freeze, never slash. A flag pauses payouts. Funds only ever leave the escrow to the researcher.
2. A guardian can release a frozen milestone after the dispute window.
3. Only hard checks change oracle status: the DOI resolves, the Crossref or OpenAlex retraction flag, and the database version used.
4. Model judged checks are labelled advisory and never written on chain.
5. Never claim Sluice proves a paper is true, detects paper mills or prevents fraud.
6. The simulated retraction feed is labelled as a simulation in the interface and the README.
7. Fixture retracted DOIs come from the Crossref API. Never invent papers or data.
8. Credit every reused library, dataset and server in the README.

## Stack
Solidity 0.8.24, Foundry, OpenZeppelin v5. TypeScript on Node 22 (.nvmrc), Fastify, zod, viem, node:sqlite. Next.js App Router, Tailwind, wagmi. pnpm workspaces with the store inside the repo (.npmrc). Chain only from env (CHAIN_ID, RPC_URL, EXPLORER_URL, NATIVE_SYMBOL and NEXT_PUBLIC_ twins). Default Base Sepolia. Partner prize target: Chainlink CRE.

## Style rules
1. No comments in code files. Names carry the meaning.
2. No dashes or hyphens in prose, UI copy, docs, commit messages, identifiers or filenames. Use camelCase or underscores. Exempt: third party package names, CLI flags, lockfiles, tool mandated filenames.
3. No em dashes anywhere.
4. Short code. Small functions, no speculative abstractions, no wrapper classes, no helper with a single caller.
5. Handle errors once at boundaries with clear messages. No blanket try catch.
6. Tests assert behaviour. Mock only the network edge.
7. No TODO, FIXME, HACK or NOTE markers. No dead code. No unused dependencies.
8. Commit messages short and plain. Commit small and often.

## Slop to avoid
Code: comments restating code, premature abstraction, factories or managers with one caller, verbose names, try catch everywhere, tests that test nothing, heavy mocking.
Design: gradients, glassmorphism, backdrop blur, glowing cards, emoji icons, stock photo feel, fake logos or testimonials, lorem ipsum, centered hero with two buttons, three column icon grid, generic purple and blue.
Writing: em dashes, "it is not X, it is Y", "here is why", delve, seamless, robust, leverage, unlock, revolutionize, cutting edge, emoji in the README, bold on every bullet, giant tables, vague claims without numbers, headings that repeat the paragraph.

## Process
1. Each agent edits only the paths it owns (see docs/architecture.md, Ownership).
2. Update docs/ai_usage.md when an agent creates or substantially changes files.
3. docs/decisions.md belongs to the team. Agents never edit it.
4. Ask the team before anything that spends funds, needs a key, or installs outside the repo.

## Commands
Use Node 22: `source ~/.nvm/nvm.sh && nvm use 22`.
`pnpm install`, `pnpm typecheck`, `pnpm test`.
