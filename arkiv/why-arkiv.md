# Why Arkiv

Detectors already commit an evidenceHash onchain in every SealRegistry vote. The evidence behind that hash was only on our detectors server. Arkiv holds the evidence itself.

## What Postgres would lose

1. Anyone can read evidence by hash without our server. A Postgres table is reachable only through an API we run. On Arkiv, the dashboard, a script or another team queries the public RPC directly.
2. The owner wallet proves who wrote it. Every entity carries its owner, the writer wallet 0xDe760446b5a7fFf40f17625f77d4165BaA013Fc9. A row in our database proves nothing about who inserted it.
3. It survives our server going down. If the detectors service is offline or its disk is lost, the dashboard still loads the evidence from Arkiv and still checks it against the hash in the vote.

## What stays off Arkiv, and why

1. Votes stay on SealRegistry. Quorum, the dispute window, the seal rate limit and guardian unseal are enforced by a contract that guards read; they need contract logic, not storage.
2. The watcher timeline stays in the watcher. It is a hash chained log whose head is signed and checked in the browser; it changes every few seconds and is rebuilt from chain events, so a second copy on Arkiv would add writes without adding trust.

Clean verdicts never go to SealRegistry, but their evidence is published to Arkiv like any other, so a clean result can be checked too.
