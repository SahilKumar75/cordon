# Open decisions

Each entry: the suggested default, then the trade off. The team copies what it agrees with into docs/decisions.md. Until then the code uses the default shown, and says so where it matters.

## Age N for the fallback (GUARD_FALLBACK_MIN_AGE_DAYS)
Suggested: 3 days (the current placeholder; the guard warns every time it uses it).
Trade off: a larger N blocks more fresh malicious releases while the Sealed list is down, but also blocks more legitimate fresh releases.

## Stale list limit (GUARD_SNAPSHOT_MAX_AGE_SECONDS)
Suggested: 3600 seconds (one hour); the watcher signs every poll, so a healthy snapshot is minutes old.
Trade off: shorter falls back to the age rule sooner during a watcher outage; longer trusts an older list and may miss recent seals.

## Dispute window (DISPUTE_WINDOW_SECONDS)
Suggested: 3600 seconds on testnet for the demo; one to six hours if anyone runs it for real.
Trade off: a false seal stays an outage until the window ends, so shorter limits our damage; longer gives reviewers time before a guardian can unseal.

## Quorum (QUORUM with three detectors)
Suggested: 2 of 3.
Trade off: 1 of 3 seals faster but lets one faulty or compromised detector cause an outage; 3 of 3 is safest against false seals but stops sealing when any detector is down.

## Fail mode when the Sealed list is unavailable
Suggested: the age fallback rather than fail open or fail closed. The team chose it on 6 Nov 2026 and CLAUDE.md design rule 8 records it; N stays for docs/decisions.md.
Trade off: fail open lets every install through during an outage; fail closed stops all installs; the fallback stops only fresh versions and depends on N above.

## Seal rate limit (MAX_SEALS_PER_DAY)
Suggested: 10 per UTC day.
Trade off: a low cap limits the damage of a detector key compromise; a high cap is needed during a large worm wave such as the September 2025 or May 2026 campaigns.

## Non registry sources (GUARD_ALLOW_NON_REGISTRY_SOURCES)
Suggested: unset, so git, GitHub, commit and tarball sources block by default.
Trade off: blocking is safe against the TanStack style git dependency vector; projects that rely on git dependencies must opt out per environment.

## Target prizes
Suggested: Ethereum Foundation Best CROPS App and Chainlink Best workflow with CRE, both on Base Sepolia (details in docs/sponsor_fit.md). Arkiv only if the team reverses its earlier drop.
Trade off: each extra prize adds required files, demo time and sometimes a second chain; the deadline is Sat 7 Nov, 09:00 IST.

## Guardian key
Suggested: a single guardian key for the demo, documented in docs/limits.md; a Safe multisig for any real deployment.
Trade off: one key is quick to demo but is a single point of failure for unseal and reseal.

## Public repo timing
Suggested: make the repo public just before submission, after a final secret scan, so judges can open it from the submission page.
Trade off: earlier gives a public commit history during the event; later lowers the chance of exposing work in progress or a mistake.
