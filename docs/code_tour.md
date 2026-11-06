# Code tour

One page for the two pieces judges will ask about: the contract that seals a version, and the guard check that blocks it.

## SealRegistry in plain language

SealRegistry is a public list of npm versions that must not run. Each entry is keyed by `keccak256(abi.encode("npm", name, version))`, so a seal covers one exact version and nothing else.

1. At deploy, the constructor names the detector addresses, one guardian address, the quorum, the dispute window and the daily seal limit. Nobody gets the admin role, and `renounceRole` always reverts, so these roles never change.
2. A detector calls `submitVerdict` with the name, version and the hash of its evidence file. The contract records one vote per detector per key and emits VerdictSubmitted.
3. The vote that reaches the quorum seals the key, unless the limit of seals for that UTC day is already used up; then that vote reverts and nothing changes.
4. After the dispute window, the guardian can unseal a key with a reason hash. Detectors can never vote on an unsealed key again; only the guardian can reseal it.
5. `sealedKeys(offset, limit)` pages through every key ever sealed with its current status. This is what the guard and the watcher read.

## The guard check in plain language

`cordon check` answers one question before npm runs: does this lockfile contain anything we should not install?

1. Read the lockfile. Only package-lock.json or npm-shrinkwrap.json with lockfileVersion 2 or 3, up to 64 MB; anything else is "unavailable" (exit 2), never "allowed".
2. Load the Sealed list: from the chain first; if that fails, from the signed snapshot, fetched from the watcher or else from the local cache, accepted only if signer, chain, registry and age all check out; if both fail, no list, and the age fallback blocks every version younger than N days (placeholder 3, with a warning each time).
3. Hash every lockfile entry, transitive ones included, into its seal key and look it up in the list locally. No package name leaves the machine for this step.
4. Also block versions younger than the minimum age if one is set, and any entry that comes from git, GitHub, a tarball URL or a file instead of the registry.
5. Outcome: blocked (exit 1) if anything matched, else allowed (exit 0). For each blocked version propose the highest earlier version that is not Sealed. If a blocked version is already in node_modules, advise removing persistence and editor or agent hooks first, then rotating credentials.
6. `cordon install` runs the same check and only on "allowed" runs `npm ci --ignore-scripts`, adding `--allow-git=none` on npm 11.10.0 or later.

## Read these five files first

| File | What it does | What could go wrong |
| --- | --- | --- |
| [contracts/src/SealRegistry.sol](../contracts/src/SealRegistry.sol) | Votes, quorum, seal, unseal, reseal, paging | Votes never expire, so an old vote plus one new vote can seal. On a day that hit the seal limit the deciding vote reverts and is retried every 60 seconds until the next UTC day. Reseal skips the dispute window and the daily limit. The key is an exact string match, so a different spelling of the same version is a different key. One guardian key and frozen roles mean a lost or stolen key needs a new deployment. |
| [packages/guard/src/check.ts](../packages/guard/src/check.ts) | Builds the report and the outcome; runs npm only when allowed | When no list loads, the age fallback also blocks legitimate fresh releases. "Already installed" only looks at node_modules next to the lockfile; copies elsewhere need `cordon audit`. On npm older than 11.10.0 the git guard relies on the non registry block alone. A configured report URL receives the blocked names. |
| [packages/guard/src/sealedList.ts](../packages/guard/src/sealedList.ts) | Chain read, snapshot checks, cache | The chain read trusts the RPC: one that reports the right chain id but returns an empty list would let everything through. Snapshot trust is only as good as GUARD_SNAPSHOT_SIGNER and the max age; a clock off by more than 60 seconds can reject a fresh snapshot. |
| [packages/guard/src/lockfile.ts](../packages/guard/src/lockfile.ts) | Reads entries and classifies their source | Linked workspace entries and entries without a version are skipped. pnpm, yarn and bun lockfiles are not read at all, so those projects get "unavailable", not protection. The guard trusts the lockfile, not what is on disk. |
| [services/detectors/src/server.ts](../services/detectors/src/server.ts) | Scans a tarball with three detectors and submits verdicts | staticScripts matches keywords, so an install script that avoids them passes it. sandboxCanary only runs on demo registry tarballs. advisoryFeed reads MAL ids only. In the demo all three keys sit on one machine, so the quorum is not independent. The scan now refuses a tarball whose package.json names a different package or version than the request. |

[packages/shared/src/hashing.ts](../packages/shared/src/hashing.ts) holds `sealKeyOf`, which must produce the same key as the contract's `keyOf`; tests/fitness checks that on a local chain.
