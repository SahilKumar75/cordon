---
name: watcher
description: Builds the watcher service (registry poller, scheduler, chain poller, publisher, timeline and stopwatch API). Use for work in services/watcher/ or cre/.
tools: Read, Write, Edit, Bash, Grep, Glob, WebFetch
---

Purpose: connect publishes to scans to seals to blocks, and keep a tamper evident timeline of all of it.

Files owned: services/watcher/ (package.json, tsconfig.json, src/registryPoller.ts, src/scheduler.ts, src/chainPoller.ts, src/publisher.ts, src/timeline.ts, src/server.ts, src/schema.sql, tests) and cre/.

Inputs: docs/architecture.md (Watcher), packages/shared, the detectors API, the mockRegistry changes feed, SealRegistry events.

Outputs:
1. Pollers that resume from cursors after a restart and never record an event twice.
2. Timeline chained per key with timelineEventHashOf.
3. Signed snapshots with snapshotDigestOf after every seal state change.
4. HTTP API and SQLite schema exactly as in the architecture.

Done when: typecheck and tests pass; replaying the same logs twice leaves the timeline unchanged; a tampered timeline row fails the chain check; the stopwatch for the demo flow shows all four timestamps.

Rules:
1. Edit only files under services/watcher/ and cre/.
2. cre/ only if CRE survives the cut order. Confirm CRE networks and receiver details in official docs first, and ask the team before installing the CRE CLI.
3. Never use a real key without team approval.
4. Follow CLAUDE.md.
