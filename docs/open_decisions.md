# Open decisions

Each entry: the suggested default, then the trade off. The team copies what it agrees with into docs/decisions.md. Until then the code uses the default shown, and says so where it matters. Entries marked Decided record a team decision or what the code now does; the rest are still open.

## Age N for the fallback (GUARD_FALLBACK_MIN_AGE_DAYS)
Decided: N stays 3 days (team decision, 7 Nov 2026). The guard still warns every time it uses the built in value when the variable is unset.
Trade off: a larger N blocks more fresh malicious releases while the Sealed list is down, but also blocks more legitimate fresh releases.

## Stale list limit (GUARD_SNAPSHOT_MAX_AGE_SECONDS)
Suggested: 3600 seconds (one hour); the watcher signs every poll, so a healthy snapshot is minutes old.
Trade off: shorter falls back to the age rule sooner during a watcher outage; longer trusts an older list and may miss recent seals.

## Dispute window (DISPUTE_WINDOW_SECONDS)
Suggested: 3600 seconds on testnet for the demo; one to six hours if anyone runs it for real.
Trade off: a false seal stays an outage until the window ends, so shorter limits our damage; longer gives reviewers time before a guardian can unseal.

## Vote lifetime (VOTE_LIFETIME_SECONDS)
Decided: implemented as an immutable set at deploy (`voteLifetime` in contracts/src/SealRegistry.sol), 86400 seconds in our config (ops/e2eLocal.sh). A detector may refresh its vote once half the lifetime has passed.
Trade off: shorter makes stale or replayed agreement expire sooner but needs detectors to agree within that time; longer lets a slow second detector still count.

## Quorum (QUORUM with three detectors)
Suggested: 2 of 3.
Trade off: 1 of 3 seals faster but lets one faulty or compromised detector cause an outage; 3 of 3 is safest against false seals but stops sealing when any detector is down.

## Suspect versions
Decided: Suspect versions block by default, with `--allow-suspect name@version` as the per version override (team decision, 7 Nov 2026). Built: a key is Suspect while its status is None and it has a live vote (`isSuspect` in contracts/src/SealRegistry.sol); the guardian can promote it to Sealed or clear it, and a Cleared key takes no more votes. The guard reads Suspect keys from the chain or the signed snapshot (packages/guard/src/sealedList.ts) and blocks them in packages/guard/src/check.ts; the sidecar only warns.
Trade off: one faulty or compromised detector key can hold any version for up to the vote lifetime, so the advice names the override and the guardian clear.

## Fail mode when the Sealed list is unavailable
Decided: the age fallback rather than fail open or fail closed. The team chose it on 6 Nov 2026 and CLAUDE.md design rule 8 records it; N is 3 (above).
Trade off: fail open lets every install through during an outage; fail closed stops all installs; the fallback stops only fresh versions and depends on N above.

## Seal rate limit (MAX_SEALS_PER_DAY)
Suggested: 10 per UTC day.
Trade off: a low cap limits the damage of a detector key compromise; a high cap is needed during a large worm wave such as the September 2025 or May 2026 campaigns.

## Non registry sources (GUARD_ALLOW_NON_REGISTRY_SOURCES)
Suggested: unset, so git, GitHub, commit and tarball sources block by default.
Trade off: blocking is safe against the TanStack style git dependency vector; projects that rely on git dependencies must opt out per environment.

## Target prizes
Current plan: Ethereum Foundation Best CROPS App as the primary target; Chainlink Best workflow with CRE as a simulation only; Arkiv only if a real entity write is shown, which needs a funded writer (details in docs/sponsor_fit.md).
Trade off: each extra prize adds required files, demo time and sometimes a second chain; the deadline is Sat 7 Nov, 09:00 IST.

## Guardian key
Open. Suggested: a single guardian key for the demo, documented in docs/limits.md; a Safe multisig for any real deployment.
Trade off: one key is quick to demo but is a single point of failure for unseal, reseal, promote and clear.

## Snapshot hosting (GUARD_SNAPSHOT_URL)
Open. The watcher serves the signed snapshot today, so a watcher outage leaves guards on their local cache. Options: keep the watcher, or also publish the signed file to static hosting the guard can fetch.
Trade off: a second host keeps fresh lists flowing when the watcher is down, but is one more thing to run, and the signature check is what makes any host safe.

## Independent detector operators
Open. The team runs all three detector keys, so the quorum shows the mechanism, not independence (docs/limits.md). A CRE vote, if deployed, would be one more operator chosen by Chainlink, still one vote.
Trade off: outside operators make a false seal harder to cause, but need recruiting, and roles are frozen, so adding them means a new registry deployment.

## Public repo timing
Suggested: make the repo public just before submission, after a final secret scan, so judges can open it from the submission page.
Trade off: earlier gives a public commit history during the event; later lowers the chance of exposing work in progress or a mistake.
