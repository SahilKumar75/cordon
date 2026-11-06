# Limits

What Cordon does not do, and why. Research links point to docs/research, where every source carries an access date.

## npm only

Cordon seals npm versions and reads npm lockfiles. SealRegistry rejects any ecosystem other than npm. Other registries such as PyPI and crates.io are not covered.

Typosquatting and dependency confusion are out of scope. Both attacks install a package the developer did not mean to choose. Cordon judges the exact name and version in the lockfile; it has no view of which name the developer intended or which registry should have served it.

## Lockfile formats

The guard reads only npm-shrinkwrap.json and package-lock.json with lockfileVersion 2 or 3. Anything else gives outcome unavailable, never allowed: lockfileVersion 1, lockfileVersion 4 or later, pnpm-lock.yaml, yarn.lock, a missing file, malformed JSON, or a file over the size limit.

Cordon does not claim npm 12 support. npm 12.0.0 adds lockfileVersion 4 and drops npm-shrinkwrap.json, so under npm 12 a stale npm-shrinkwrap.json could be checked while npm ci installs from package-lock.json. See [edge cases, section 5](research/edge_cases.md#5-lockfile-versions-and-npm-shrinkwrapjson-precedence).

## Git dependencies

Any lockfile entry resolved from git or GitHub is treated as high risk and blocks the outcome by default. GUARD_ALLOW_NON_REGISTRY_SOURCES=true turns the block into a warning. The reason is that disabling install scripts does not stop every way a git dependency can run code. The research records two mechanisms ([edge cases, section 9](research/edge_cases.md#9-git-dependency-mechanisms-that-run-code-without-lifecycle-scripts)):

1. pnpm 10.0.0 up to but not including 10.26.0 ran prepare scripts when fetching a git dependency. Verified. GHSA-379q-355j-w6rj affects pnpm 10.0.0 up to but not including 10.26.0. The fetch phase never consults the onlyBuiltDependencies allowlist; only ignoreScripts stops it there.
2. A git dependency can ship an npmrc that replaces the git binary, so npm runs an attacker script when it prepares a nested git dependency, even with --ignore-scripts. Reported, not reproduced by us, and not verified against a primary source.

The TanStack payload arrived the same way, through an optionalDependencies entry pointing at a github: commit whose prepare script ran on install ([incidents](research/incidents.md#tanstack-npm-compromise-11-may-2026)). Source reading also shows npm 10 and 11 may run prepare for git dependencies despite --ignore-scripts; that was checked in source only, not by running an install ([edge cases, section 4](research/edge_cases.md#4-install-scripts-disabled-does-not-cover-git-dependency-prepare-on-npm-10-and-11)).

npm has a setting, allow-git, that stops git dependencies from being fetched. Cordon passes it from npm 11.10.0, the first version the GitHub changelog lists; the npm CLI changelog says 11.9.0, but the npm docs do not confirm either, so we use the stricter one. npm 10, which Node 22 bundles, does not have it, so on npm 10 the guard's block is the only protection Cordon offers on this path.

## advisoryFeed reads MAL ids only

advisoryFeed asks OSV for malicious package advisories with MAL ids. An incident published only as a GHSA advisory is missed by that detector. ua-parser-js in October 2021 is one: OSV holds GHSA-pjwm-rvh2-c87w for it and no MAL id ([incidents](research/incidents.md#ua-parser-js-account-takeover-22-oct-2021)). The other detectors may still catch such a version, but advisoryFeed will not vote on it.

## Theft inside the publisher's CI

In the TanStack compromise the attacker read a short lived OIDC token from the memory of the GitHub Actions runner and published with it. That happens before any version reaches the registry. Cordon acts on published versions, so it cannot prevent this theft; it can only seal the versions that result. Hardening the publisher's CI is out of scope. See [edge cases, section 10](research/edge_cases.md#10-out-of-scope-theft-of-short-lived-ci-tokens-from-runner-memory).

## Theft that already happened

A runtime stop cannot undo install time theft. If a Sealed version was installed before the seal, its install script may already have sent credentials out and left persistence behind. Registry removal does not clean that up either ([edge cases, section 8](research/edge_cases.md#8-what-a-registry-takedown-or-deprecation-does-and-does-not-remove)).

When cordon audit or the guard finds an installed Sealed version, it advises, in this order: remove persistence daemons and editor or coding agent hooks such as .claude/settings.json and .vscode/tasks.json, then rotate credentials. The order matters because the TanStack wave left hooks in the project tree that survive deleting node_modules ([edge cases, section 3](research/edge_cases.md#3-ide-and-coding-agent-hooks-used-for-persistence)). Cordon does not remove anything itself. These runtime stop limits and the order of the advice are design choices, not research backed; the order follows the team's instruction recorded in [incidents](research/incidents.md#tanstack-npm-compromise-11-may-2026).

Audit scans lockfiles, npm caches and saved Docker images. It does not reach built browser bundles or internal registry mirrors, which can keep a bad version after the public registry drops it.

## False seals

A seal stays in force until the guardian unseals it, and unseal is only possible after the dispute window ends. Until then every install, CI run and service that depends on that version is blocked. A false seal is an outage we caused.

These reduce the chance of a false seal and limit how many can happen; none of them removes it. The abuse protection (quorum, evidence hash, seal rate limit, dispute window and guardian) and the dispute window length are design choices, not research backed. The suggested values are in docs/open_decisions.md.

1. A quorum of distinct detector keys must vote before a version is Sealed.
2. Every verdict carries an evidence hash.
3. MAX_SEALS_PER_DAY caps how many versions can be Sealed per UTC day.
4. Prebuilt binaries, wasm and shell files that no install script runs are recorded as findings only, because many legitimate packages ship them.

Published precision figures for detection methods come from curated benchmarks, so they do not justify a quorum of one ([papers](research/papers.md#what-this-means-for-cordon)).

## Single guardian key

The demo deployment uses one guardian key, not a Safe multisig. There is no multisig flow in the dashboard or the deploy script. One key is a single point of failure for unseal and reseal: if it is lost, a false seal cannot be lifted, and if it is stolen, an attacker can unseal a malicious version once its dispute window has passed. A real deployment should hand the guardian role to a multisig.

## Roles freeze at deploy

SealRegistry grants the detector and guardian roles in its constructor and nobody holds the admin role, so no role can be granted, revoked or renounced afterwards. A stolen detector key keeps its vote until the registry is replaced, and adding a detector, removing one or moving the guardian to a multisig all mean deploying a new SealRegistry and pointing every guard, watcher and dashboard at its address.

## The chain read trusts the RPC

The guard asks one RPC provider for the Sealed list and checks only that it reports the right chain id. Its one defence against a provider that lies is monotonic: every version the guard has seen sealed is recorded in GUARD_CACHE_DIR for that chain and registry, and a later list that drops one is rejected unless the chain marks that key Unsealed and an Unsealed event for it is found. The guard then uses the signed snapshot and keeps every recorded version blocked, and says so on stderr. This cannot catch a provider that hides a seal the guard never saw: a first read, a new cache directory, or a version sealed and hidden before this guard ever read it. It also cannot catch a provider that invents seals; that only causes a block, never an install.

## Vote lifetime

A vote counts toward quorum for VOTE_LIFETIME_SECONDS after it is cast, fixed at deploy (86400 seconds in our config). A stale vote from an old scan no longer combines with a new one to seal. A detector can vote again on the same version once its earlier vote expired. Expiry does not limit a compromised detector key, which can keep voting until the registry is replaced, because roles freeze at deploy.

## Age fallback when the Sealed list is unavailable

When the chain is unreachable and no fresh signed snapshot passes every check, the guard has no Sealed list. It then blocks every version younger than N days and allows older ones. A version whose publish time cannot be read is blocked. A Sealed version older than N days is allowed in this mode, because the list was not checked.

N is GUARD_FALLBACK_MIN_AGE_DAYS and is set by the team in docs/decisions.md. Until it is set, the guard uses a placeholder of 3 days and prints a warning every time it does.

## What the npm registry learns

The Sealed list check is local: the guard downloads the whole list and reveals nothing about what it looks for. Three features do reveal package names. Minimum age, the age fallback and rollback read package metadata from NPM_REGISTRY_URL, which tells that registry which packages the project uses. Leave GUARD_MIN_AGE_DAYS unset and skip rollback to avoid this outside a chain outage.

## Demo detectors

The three demo detectors, staticScripts, sandboxCanary and advisoryFeed, are run by the team and are labelled simulated. They are not independent operators. The demo quorum of 2 of 3 shows the mechanism; it does not show independence, since one team holds every key.

sandboxCanary executes only tarballs from the demo registry. Real public packages are never run in the sandbox.
