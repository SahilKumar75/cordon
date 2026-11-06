# Trust model

Every key in Cordon, what it can do, who holds it today, and the worst case if it leaks or its holder turns hostile. Today one operator, the team, holds every key on one machine. That is the main limit of this prototype: the quorum of distinct detector keys only means something once different people run different detectors.

| Key | Power | Held by today | Worst case |
| --- | --- | --- | --- |
| Deployer (DEPLOYER_PRIVATE_KEY) | Deploys SealRegistry and pays gas. Has no role in the contract after deploy. | Team, local .env | Spends its own testnet ETH. Cannot seal, unseal or change roles. |
| Detector staticScripts (DETECTOR_ROLE) | One vote per version through submitVerdict, with an evidence hash. | Team, local .env | One false vote. Alone it only makes a version Suspect, which the guard blocks by default until the guardian clears it or the vote expires after the vote lifetime. |
| Detector sandboxCanary (DETECTOR_ROLE) | Same as above. | Team, local .env | Same as above. |
| Detector advisoryFeed (DETECTOR_ROLE) | Same as above. In the CRE variant this role belongs to the CordonCreReceiver contract instead of a key, and only the Chainlink forwarder can call it. | Team, local .env; CRE receiver in simulation only | Same as above. |
| Any two detectors together | Reach quorum 2 and seal a version. Seals are limited to MAX_SEALS_PER_DAY (10). | Team | A false seal: every guard blocks a clean version. This is an outage we caused. Recovery is guardian unseal after the dispute window (3600 s). |
| Guardian (GUARDIAN_ROLE) | Unseal after the dispute window, reseal, promote a Suspect version to Sealed, clear a Suspect version. | Team, one EOA. The design calls for a multisig; it is not deployed. | Unseals a malicious version so guards allow it again, or promotes a clean Suspect version to Sealed. Roles are frozen, so a leaked guardian key cannot be rotated without a new registry. |
| Snapshot signer (SNAPSHOT_SIGNER_PRIVATE_KEY) | Signs the cached Sealed list that guards use when the chain is unreachable. | Team, local .env | Signs a list that drops sealed versions. A guard that has seen those keys rejects it, because the guard keeps a monotonic known sealed list; a fresh guard on its first read accepts it while the chain is down. |
| Guard reporter (GUARD_REPORTER_PRIVATE_KEY) | Signs guard block reports sent to the watcher for the stopwatch. | Team, local .env | Fake block events on the stopwatch. Cannot change any seal. |
| Arkiv writer (ARKIV_PRIVATE_KEY) | Publishes evidence entities on the Arkiv testnet. | Team, local .env, unfunded | Publishes misleading evidence. The dashboard checks every evidence body against the hash in the on chain verdict and shows a mismatch. |
| CRE simulation key (cre/.env) | Signs simulated CRE transactions. | Team, unfunded throwaway | None today; simulation only, never broadcast. |
| Public RPC (no key) | Answers every guard and dashboard read. | Third party | A lying RPC can hide a seal on the first read. Later reads are checked against the guard's known sealed list. See docs/red_team.md item 5e. |

Values above come from contracts/src/SealRegistry.sol and the team's .env (quorum 2, dispute window 3600 s, vote lifetime 86400 s, max seals per day 10). No private key value appears in this repository.
