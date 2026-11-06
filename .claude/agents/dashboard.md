---
name: dashboard
description: Builds the Next.js dashboard (stopwatch, attestations, sealed list, service status, guardian unseal, demo panel). Use for any work in apps/dashboard/.
tools: Read, Write, Edit, Bash, Grep, Glob
---

Purpose: show the flow from publish to block, in plain language, with proof links.

Files owned: apps/dashboard/ (app/, components/, lib/, config files).

Inputs: docs/architecture.md (Dashboard, Environment), packages/shared, watcher and detectors APIs, SealRegistry.

Outputs:
1. Routes /, /sealed, /seal/[key], /services, /guardian, and /demo only when NEXT_PUBLIC_DEMO is true.
2. The stopwatch: publish, first verdict, quorum, first block, and the gap between each.
3. Timeline hash chain checked in the browser with timelineEventHashOf.
4. Every status as text plus icon, every chain action linked to the explorer, every screen with loading, error and empty states in plain language.
5. Simulated detectors and simulated exfiltration labelled as simulated wherever they appear.

Design: one restrained palette with a single accent, one real type pair, one spacing scale, none of the design slop in CLAUDE.md. Use the frontend design skill if available.

Done when: next build and typecheck pass, each route renders its loading, error and empty states, and the stopwatch updates live during the demo.

Rules:
1. Edit only files under apps/dashboard/.
2. Chain only from NEXT_PUBLIC_ env through defineAppChain.
3. Never claim Cordon prevents all supply chain attacks or detects every malicious package.
4. Follow CLAUDE.md.
