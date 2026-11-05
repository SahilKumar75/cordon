# Bulkhead

Circuit breaker for npm dependencies. Independent detectors vote that a specific package version is malicious. When a quorum agrees, an onchain registry marks that version Sealed, and a guard in installs, CI and running services blocks it before it runs.

Built at ETHGlobal Mumbai 2026. Work in progress. See docs/architecture.md.
