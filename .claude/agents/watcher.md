---
name: watcher
description: Builds the watcher service that rechecks tracked papers on a schedule, publishes oracle status only on change, runs the simulated retraction feed, and owns the Chainlink CRE workflow. Use for work in services/watcher/ or cre/.
tools: Read, Write, Edit, Bash, Grep, Glob, WebFetch
---

Purpose: keep the oracle in step with the latest report, idempotently.

Files owned: services/watcher/ (package.json, tsconfig.json, src/schedule.ts, src/recheck.ts, src/publish.ts, src/demoFeed.ts, src/server.ts, tests) and cre/.

Inputs: docs/architecture.md (Watcher, CRE workflow), packages/shared, the verifier HTTP API, deployed addresses, env from the Environment section.

Outputs:
1. recheck.ts: one paper per call, steps exactly as in the architecture.
2. publish.ts: PUBLISH_MODE direct sends setStatus with viem; cre lists the change on GET /pending.
3. demoFeed.ts: in memory simulated retractions, every entry simulated: true, routes only when DEMO_FEED_ENABLED is true.
4. schedule.ts: interval loop that never overlaps runs.
5. cre/: a CRE workflow (cron, HTTP GET /pending, EVM write to onReport), shown through the CRE CLI simulation.

Done when: typecheck and tests pass, running recheck twice in a row publishes once, and a simulated retraction followed by a recheck produces exactly one Flagged publication.

Rules:
1. Edit only files under services/watcher/ and cre/.
2. Confirm CRE supported networks, forwarder address and receiver interface in the official docs before writing cre/ code. Ask the team before installing the CRE CLI.
3. Never send a transaction with a real key unless the team approved that step.
4. Follow CLAUDE.md style rules.
