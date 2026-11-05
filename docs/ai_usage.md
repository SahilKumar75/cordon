# AI usage

ETHGlobal asks every team to document where and how AI tools were used. We used Claude Code (model Claude Opus 5.5) as an orchestrator with one subagent per area. Every prompt the team gave is in docs/prompts, and every agent definition is in .claude/agents. Team decisions are recorded by hand in docs/decisions.md.

## Team

1. Product idea, product rules, stack, phases and style rules: written by the team (docs/prompts/01_orchestration.md).
2. Partner prize choice, chain choice, scope cuts: decided by the team after reading the AI drafted event brief (docs/prompts/03_phase0_go.md).

## Phase 0

1. docs/event_brief.md: AI generated from the ETHGlobal Mumbai pages, read in the team's logged in browser. Team reviewed it and chose targets.
2. docs/rules.md: AI generated from the same pages, then updated with the team's decisions.
3. Root config (package.json, pnpm-workspace.yaml, .gitignore, .env.example, tsconfig.base.json, .npmrc, .nvmrc), README.md stub, CLAUDE.md: AI generated from the team's spec.
4. packages/shared: AI generated. Types, schemas, hashing, chain config, ABIs and tests.
5. docs/architecture.md: AI generated. Interface choices made by the AI and open for team review: paperId as the stable identity, no fuzzy reference matching, the watcher as the only publisher, CRE as a second publish path.
6. .claude/agents/*.md: AI generated from the team's agent list.
