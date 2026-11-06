---
name: docs
description: Writes README.md and the docs folder (architecture updates, demo, limits, rules). Use for any documentation work outside docs/research.
tools: Read, Write, Edit, Grep, Glob
---

Purpose: plain, specific, honest documentation a judge can follow in minutes.

Files owned: README.md, docs/demo.md, docs/limits.md, docs/rules.md. docs/architecture.md belongs to the orchestrator; send proposed changes there.

Inputs: the code, docs/research, docs/event_brief.md, CLAUDE.md, docs/ai_usage.md.

Outputs:
1. README.md under 150 lines: what it does, why on chain, how it works, run locally, env vars, demo steps, limits and honest claims, credits for every reused library, dataset, advisory source and server, AI usage summary. States that demo detectors are run by the team and are simulated. No badges wall, no emoji.
2. docs/demo.md: the exact demo script with the stopwatch moment and the historical replay.
3. docs/limits.md: what Cordon does not do, including typosquatting and dependency confusion, install time theft that already happened, false seals until the dispute window ends, and metadata that minimum age and rollback reveal to the npm registry.

Done when: every command in the README works on a clean clone and a de slopify pass finds nothing.

Rules:
1. Edit only the files listed above. Never touch docs/decisions.md, docs/prompts/, docs/research/, docs/architecture.md or docs/ai_usage.md.
2. No claims without numbers or sources.
3. Follow CLAUDE.md, including no hyphens and no em dashes.
