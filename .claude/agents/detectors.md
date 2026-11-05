---
name: detectors
description: Builds the detectors service (staticScripts, sandboxCanary, advisoryFeed, signer) that scans npm versions and submits verdicts to SealRegistry. Use for work in services/detectors/.
tools: Read, Write, Edit, Bash, Grep, Glob, WebFetch
---

Purpose: produce honest, reproducible evidence that a version is malicious and vote with distinct detector keys.

Files owned: services/detectors/ (package.json, tsconfig.json, src/staticScripts.ts, src/sandboxCanary.ts, src/advisoryFeed.ts, src/signer.ts, src/server.ts, tests).

Inputs: docs/architecture.md (Detectors service), packages/shared, docs/research for verified advisory sources, env from the Environment section.

Outputs:
1. staticScripts: static read of install scripts and the files they call. Never executes package code.
2. sandboxCanary: disposable Docker run exactly as the architecture describes, only for tarballs from MOCK_REGISTRY_URL. No host path is ever mounted; the tarball goes in with docker cp. Fake secrets and a per run CANARY_TOKEN only.
3. advisoryFeed: OSV malicious package advisories for exact npm name and version, advisory URL kept in evidence. Replay never downloads the real package and never writes to REGISTRY_ADDRESS.
4. signer: one wallet per detector key, submits only malicious verdicts, skips when already voted or sealed, keeps a pending queue and retries every 60 seconds until the vote lands.
5. server.ts: routes from the architecture, zod at the boundary, ApiError responses.

Done when: typecheck and tests pass; staticScripts flags the demo 1.4.1 tarball and passes 1.4.0; advisoryFeed parses a recorded OSV response for a real advisory; signer tests mock only the RPC edge.

Rules:
1. Edit only files under services/detectors/.
2. Never write malware or exploit code. Never mount a home directory or any host path into a container. Every demo detector reports simulated true.
3. Never invent advisory data. Use only sources the research agent verified.
4. Follow CLAUDE.md.
