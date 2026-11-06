# Code tour

One page for the pieces judges will ask about: the contract that seals a version, the guard check that blocks it, and the two sponsor integrations, Arkiv evidence and the Chainlink CRE workflow.

## SealRegistry in plain language

SealRegistry is a public list of npm versions that must not run. Each entry is keyed by `keccak256(abi.encode("npm", name, version))`, so a seal covers one exact version and nothing else.

1. At deploy, the constructor names the detector addresses, one guardian address, the quorum, the dispute window and the daily seal limit. Nobody gets the admin role, and `renounceRole` always reverts, so these roles never change.
2. A detector calls `submitVerdict` with the name, version and the hash of its evidence file. The contract records the time of each detector's vote on each key and emits VerdictSubmitted with the number of live votes. A vote stays live for the vote lifetime set at deploy; after that it stops counting and the detector may vote again.
3. The vote that reaches the quorum seals the key, unless the limit of seals for that UTC day is already used up; then that vote reverts and nothing changes.
4. After the dispute window, the guardian can unseal a key with a reason hash. Detectors can never vote on an unsealed key again; only the guardian can reseal it.
5. `sealedKeys(offset, limit)` pages through every key ever sealed with its current status. This is what the guard and the watcher read.

## The guard check in plain language

`cordon check` answers one question before npm runs: does this lockfile contain anything we should not install?

1. Read the lockfile. Only package-lock.json or npm-shrinkwrap.json with lockfileVersion 2 or 3, up to 64 MB; anything else is "unavailable" (exit 2), never "allowed".
2. Load the Sealed list: from the chain first, rejected if it drops a version this guard saw sealed before without a matching Unsealed event; if that fails, from the signed snapshot, fetched from the watcher or else from the local cache, accepted only if signer, chain, registry and age all check out; if both fail, no list, and the age fallback blocks every version younger than N days (3 by team decision; when GUARD_FALLBACK_MIN_AGE_DAYS is unset the guard warns each time).
3. Hash every lockfile entry, transitive ones included, into its seal key, taking the name and version from the `resolved` tarball path when there is one (`tarballIdentityOf` in lockfile.ts), and look it up in the list locally. No package name leaves the machine for this step.
4. Also block Suspect versions (live votes below quorum) unless named with `--allow-suspect name@version`, versions younger than the minimum age if one is set, and any entry that comes from git, GitHub, a tarball URL or a file instead of the registry.
5. Outcome: blocked (exit 1) if anything matched, else allowed (exit 0). For each blocked version propose the highest earlier version that is not Sealed. If a blocked version is already in node_modules, advise removing persistence and editor or agent hooks first, then rotating credentials.
6. `cordon install` runs the same check and only on "allowed" runs `npm ci --ignore-scripts`, adding `--allow-git=none` on npm 11.10.0 or later.

## Read these five files first

| File | What it does | What could go wrong |
| --- | --- | --- |
| [contracts/src/SealRegistry.sol](../contracts/src/SealRegistry.sol) | Votes, quorum, seal, unseal, reseal, paging | Votes expire after the lifetime, but a compromised detector key can keep voting until a new deployment. On a day that hit the seal limit the deciding vote reverts and is retried every 60 seconds until the next UTC day. Reseal skips the dispute window and the daily limit. The key is an exact string match, so a different spelling of the same version is a different key. One guardian key and frozen roles mean a lost or stolen key needs a new deployment. |
| [packages/guard/src/check.ts](../packages/guard/src/check.ts) | Builds the report and the outcome; runs npm only when allowed | When no list loads, the age fallback also blocks legitimate fresh releases. "Already installed" only looks at node_modules next to the lockfile; copies elsewhere need `cordon audit`. On npm older than 11.10.0 the git guard relies on the non registry block alone. A configured report URL receives the blocked names. |
| [packages/guard/src/sealedList.ts](../packages/guard/src/sealedList.ts) | Chain read, snapshot checks, cache | The chain read trusts the RPC except for the monotonic check: a list that drops a version this guard already saw sealed is rejected, but on a first read with no record an RPC that hides seals is not detected. Snapshot trust is only as good as GUARD_SNAPSHOT_SIGNER and the max age; a clock off by more than 60 seconds can reject a fresh snapshot. |
| [packages/guard/src/lockfile.ts](../packages/guard/src/lockfile.ts) | Reads entries and classifies their source | Linked workspace entries and entries without a version are skipped. pnpm, yarn and bun lockfiles are not read at all, so those projects get "unavailable", not protection. The guard trusts the lockfile, not what is on disk. |
| [services/detectors/src/server.ts](../services/detectors/src/server.ts) | Scans a tarball with three detectors and submits verdicts | staticScripts matches keywords, so an install script that avoids them passes it. sandboxCanary only runs on demo registry tarballs. advisoryFeed reads MAL ids only. In the demo all three keys sit on one machine, so the quorum is not independent. The scan now refuses a tarball whose package.json names a different package or version than the request. |

[packages/shared/src/hashing.ts](../packages/shared/src/hashing.ts) holds `sealKeyOf`, which must produce the same key as the contract's `keyOf`; tests/fitness checks that on a local chain.

## Arkiv evidence in plain language

Every detector verdict has an evidence file whose hash goes on chain with the vote. Arkiv gives that file a public copy, so the evidence outlives our server. Status: the code and tests exist, but the writer wallet is unfunded, so no entity has been written yet.

1. After a scan writes its evidence files, [services/detectors/src/server.ts](../services/detectors/src/server.ts) calls `publishEvidence` in [services/detectors/src/arkiv.ts](../services/detectors/src/arkiv.ts) for each one, in the background. It creates an entity on schema `cordon.evidence` with the evidence hash, detector, name, version and verdict as indexed fields and the file text as the body, and saves the returned entity key next to the file as `{hash}.arkiv.json`. Votes never wait for it; a failed publish is logged once. Publishing runs only when ARKIV_PRIVATE_KEY is set.
2. `GET /evidence/:hash` serves the file from disk, and if it is gone, reads it from Arkiv with `readEvidence`. `GET /evidence/:hash/arkiv` returns the saved entity reference.
3. In the dashboard, [apps/dashboard/components/evidenceList.tsx](../apps/dashboard/components/evidenceList.tsx) asks the detectors service first. When that fails it calls `readArkivEvidence` in [apps/dashboard/lib/arkiv.ts](../apps/dashboard/lib/arkiv.ts) from the browser and shows a Stored on Arkiv label with the entity key.
4. Both readers query by schema and evidence hash, then recompute the hash of each body and keep only a match, because anyone can write an entity with the same schema name and hash field.
5. [arkiv/](../arkiv/) holds five short files written for the Arkiv judging criteria: why Arkiv, how Cordon uses it, the schema, reach and friction.

| File | What could go wrong |
| --- | --- |
| [services/detectors/src/arkiv.ts](../services/detectors/src/arkiv.ts) | The reader looks at the first 20 matches only, so 20 junk entities with the right hash field can hide the real one. The writer key is one more secret on the detectors machine. Entities expire after about 182 days (ExpirationTime.max()). |
| [apps/dashboard/lib/arkiv.ts](../apps/dashboard/lib/arkiv.ts) | It checks the hash but not the owner, so a valid copy written by someone else is shown with the same label. |

## Chainlink CRE in plain language

The advisoryFeed check (is there an OSV advisory with a MAL id for this exact npm version) is the one detector that depends only on a public API, so it is the one moved into a CRE workflow. Status: simulation only. `cre workflow simulate` runs it locally as a dry run with CRE CLI v1.39.0; deploy access is pending, and no receiver or registry is deployed, so `receiver` in config.staging.json is still the zero address.

1. [cre/cordonAdvisory/main.ts](../cre/cordonAdvisory/main.ts): an HTTP trigger takes `{name, version}`, posts the query to OSV through the CRE HTTP client with identical consensus, and stops if no MAL id comes back. Otherwise it builds a report and calls `writeReport` to the receiver on chain selector ethereum-testnet-sepolia-base-1.
2. [cre/cordonAdvisory/advisory.ts](../cre/cordonAdvisory/advisory.ts): the pure parts, with tests in advisory.test.ts against a recorded OSV response. The report is `abi.encode(name, version, evidenceHash)`, where the evidence hash is keccak256 of a canonical JSON object anyone can rebuild from OSV.
3. [contracts/src/CordonCreReceiver.sol](../contracts/src/CordonCreReceiver.sol): accepts `onReport` only from the forwarder fixed at deploy, optionally checks the workflow owner in the metadata, decodes the report and calls `submitVerdict`. Everything is immutable. On chain it is one detector address, so a CRE verdict is one vote of three.
4. [contracts/script/DeployCre.s.sol](../contracts/script/DeployCre.s.sol): roles in SealRegistry are frozen at deploy, so this script predicts the registry address, deploys the receiver pointing at it, then deploys a fresh registry with the receiver as the third detector, and writes contracts/deployments/{chainId}.cre.json.
5. [docs/cre_design.md](cre_design.md) has the design, the forwarder addresses and the difference between simulation and deployment.

| File | What could go wrong |
| --- | --- |
| [contracts/src/CordonCreReceiver.sol](../contracts/src/CordonCreReceiver.sol) | With the owner check off (the simulation setup, owner set to zero), anyone who can call the forwarder votes as this receiver. A wrong forwarder address at deploy means a redeploy of both contracts. |
| [cre/cordonAdvisory/main.ts](../cre/cordonAdvisory/main.ts) | It reads MAL ids only, like advisoryFeed, so a GHSA only incident gets no vote. A repeated report while the first vote is live reverts with DuplicateVote. |
