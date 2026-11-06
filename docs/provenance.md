# Provenance

Every fact below comes from this repository's git history. Times are IST (+0530). For every commit in the repository the author date equals the committer date, and no commit has been rewritten or squashed.

Hacking began Thu 5 Nov 2026, 21:00 IST (docs/event_brief.md, docs/rules.md).

## Commits made before 21:00 IST on 5 Nov 2026

Six commits, all for Sluice, an earlier idea for this event: a grant escrow gated by a research integrity oracle. Tag `sluice_archived` points at the last of them, 0431e12.

| Commit | Time | Contents |
| --- | --- | --- |
| 0a83f5b | 5 Nov 16:51:18 | Event brief, event rules, the orchestration and event brief prompts, and an empty docs/decisions.md. |
| c5e646b | 5 Nov 16:51:45 | Workspace scaffold: root package.json, pnpm-workspace.yaml, tsconfig.base.json, .npmrc, .nvmrc, .gitignore, .env.example and a five line Sluice README. |
| deb183f | 5 Nov 16:53:43 | Sluice shared package: types, schemas, hashing and ABIs for a milestone escrow and an integrity oracle, plus its package.json and tsconfig.json. |
| 1861ec0 | 5 Nov 16:57:46 | Sluice architecture (docs/architecture.md). |
| 589a507 | 5 Nov 16:58:30 | Seven Sluice agent files, a Sluice CLAUDE.md and the AI usage log. |
| 0431e12 | 5 Nov 17:02:14 | Reviewer fixes to the Sluice architecture, shared package, agent files and docs. |

## What came after

The next commit is d8a8055 at 23:08:27, which saves the prompt for the scope change. At 23:08:39 commit d384d82 deletes the Sluice architecture, every Sluice shared source file and all seven Sluice agent files. The Cordon work starts at 97ffeb7, 23:09:30, under its earlier name Bulkhead; its architecture is first committed in de9f1d1 at 23:13:22. The contracts, guard, detectors, watcher, dashboard, demo, tests and ops scripts were all first committed after 21:00 IST.

## Does any Cordon code, interface or architecture file predate 21:00 IST

No. Running `git blame` on every tracked file at HEAD, except the OpenZeppelin and forge std submodules, attributes no line of Solidity, TypeScript source, test, interface, ABI or architecture to the six commits above.

Lines from those commits that survive at HEAD are configuration and planning text only:

| File | Lines | What they are |
| --- | --- | --- |
| docs/event_brief.md | 158 | Event research written before the start |
| docs/prompts/01_orchestration.md, 02_event_brief.md, 03_phase0_go.md | 130 | Team prompts, kept as planning artifacts |
| docs/rules.md | 38 | Event rules and team process |
| .gitignore | 22 | Ignore patterns |
| packages/shared/package.json | 20 | Package manifest: module type, exports, scripts, viem, zod and TypeScript versions; the package name line was changed later |
| .env.example | 19 | Variable names for the chain, deployer, guardian, dispute window, watcher port and dashboard chain settings |
| tsconfig.base.json | 16 | TypeScript compiler options |
| CLAUDE.md | 14 | Generic style and process rules and the Node 22 commands |
| package.json | 12 | Root workspace manifest and scripts |
| docs/ai_usage.md | 10 | Log headings and the first entries about the event brief |
| packages/shared/tsconfig.json | 7 | TypeScript project file |
| pnpm-workspace.yaml | 4 | Workspace globs |
| README.md | 2 | Blank lines |
| .npmrc, .nvmrc | 2 | The pnpm store directory and the Node version |
| pnpm-lock.yaml | 104 | Lockfile entries for viem, zod, TypeScript and @types/node |

## Check it yourself

```sh
git log --until='2026-11-05T21:00:00+05:30' --format='%h %ad %s' --date=iso
git show --stat d384d82
git show sluice_archived:docs/architecture.md | head
```
