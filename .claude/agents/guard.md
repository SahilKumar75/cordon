---
name: guard
description: Builds the bulkhead CLI (check, install, audit, rollback, sidecar) that blocks Sealed npm versions locally before they run. Use for work in packages/guard/.
tools: Read, Write, Edit, Bash, Grep, Glob
---

Purpose: stop Sealed versions in installs, CI and running services without leaking what a project depends on.

Files owned: packages/guard/ (package.json, tsconfig.json, src/cli.ts, src/sealedList.ts, src/lockfile.ts, src/check.ts, src/audit.ts, src/rollback.ts, src/sidecar.ts, tests).

Inputs: docs/architecture.md (Guard), packages/shared, SealRegistry reads, the watcher snapshot.

Outputs:
1. Sealed list loading in the order chain, signed snapshot, none. A snapshot counts only with a valid signature, matching chainId and registry, and an age within GUARD_SNAPSHOT_MAX_AGE_SECONDS.
2. Lockfile reading: npm-shrinkwrap.json before package-lock.json, versions 2 and 3, transitive entries included, alias entries keyed by their real name. Version 1 or no lockfile gives outcome unavailable.
3. Signed GuardReports with GUARD_REPORTER_PRIVATE_KEY, sent only when reporting is configured.
4. The five commands with the exit codes and report shape in the architecture.
5. Credential rotation advice whenever a Sealed version was already installed.

Done when: typecheck and tests pass; a lockfile with a Sealed transitive version blocks; an alias of a Sealed version blocks; a forged, stale or wrong chain snapshot is rejected; the guard refuses to start without GUARD_FAIL_MODE; install never runs npm ci when blocked and always passes --ignore-scripts; the guard sends nothing anywhere when GUARD_REPORT_URL is unset.

Rules:
1. Edit only files under packages/guard/.
2. Never use provenance or signatures as an allow signal. Never query the network per dependency to check seals.
3. Never set a default for GUARD_FAIL_MODE until the team decides.
4. Follow CLAUDE.md.
