# Cordon

Circuit breaker for npm dependencies. Detectors vote that a specific package version is malicious. When a quorum agrees, an onchain registry marks that version Sealed, and a guard in installs, CI and running services blocks it before it runs.

In the hackathon demo all three detectors are run by our team and are labelled simulated. They are not independent operators.

Built at ETHGlobal Mumbai 2026. Work in progress. See docs/architecture.md.
