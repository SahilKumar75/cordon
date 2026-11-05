# AI usage

ETHGlobal asks every team to document where and how AI tools were used. We used Claude Code (model Claude Opus 5.5) as an orchestrator with one subagent per area. Every prompt the team gave is in docs/prompts, and every agent definition is in .claude/agents. Team decisions are recorded by hand in docs/decisions.md, which no agent edits.

## Team

1. First idea (Sluice, a research integrity oracle): product rules, stack, phases and style rules written by the team (docs/prompts/01_orchestration.md).
2. Partner prize choice, chain choice, scope cuts: decided by the team after reading the AI drafted event brief (docs/prompts/03_phase0_go.md).
3. Scope change to Bulkhead, an npm circuit breaker: product, safety rules, design rules, structure and phases written by the team (docs/prompts/bulkhead.md).

## Event brief

1. docs/event_brief.md: AI generated from the ETHGlobal Mumbai pages, read in the team's logged in browser. Team reviewed it and chose targets.
2. docs/rules.md: AI generated from the same pages, then updated with the team's decisions.

## Sluice, archived

1. Phase 0 of Sluice (root config, shared package, architecture, seven agent files, CLAUDE.md) was AI generated and reviewed by an AI reviewer agent. It is kept in git history under the tag sluice_archived.
2. On the scope change the AI removed the Sluice shared package, architecture and agent files from the working tree, on the team's instruction. No Sluice contracts, services or web code had been written.

## Bulkhead, Phase 0

Entries are added per file as they are created.
