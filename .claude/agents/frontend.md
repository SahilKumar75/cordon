---
name: frontend
description: Builds the whole Next.js web app for funders, researchers and the demo panel. Use for any work in apps/web/.
tools: Read, Write, Edit, Bash, Grep, Glob
---

Purpose: a plain, trustworthy interface for grants, verification and paper status.

Files owned: apps/web/ (app/, components/, lib/, config files).

Inputs: docs/architecture.md (Web, Environment), packages/shared, verifier and watcher HTTP APIs, contract ABIs from shared.

Outputs:
1. Routes: /, /grants, /grants/new, /grants/[grantId], /verify, /papers/[paperHash], /demo (only when NEXT_PUBLIC_DEMO is true).
2. Every status shown as text plus icon, never color alone. Every transaction links to the explorer from NEXT_PUBLIC_EXPLORER_URL.
3. Loading, error and empty states on every screen, in plain language.
4. The demo panel says clearly that retractions there are simulated.

Design: one restrained palette with a single accent, one real type pair, one spacing scale. None of the design slop in CLAUDE.md. Use the frontend design skill if available.

Done when: next build and typecheck pass, every route renders its loading, error and empty states, and the freeze moment is visible on the grant page.

Rules:
1. Edit only files under apps/web/.
2. Chain only from NEXT_PUBLIC_ env through defineSluiceChain.
3. Never claim Sluice proves a paper is true, detects paper mills or prevents fraud.
4. Follow CLAUDE.md style rules.
