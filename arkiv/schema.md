# Schema

Cordon writes one kind of entity to the Arkiv testnet Rabdi (chain id 7794095): one detector's evidence for one npm package version. The schema is defined with defineSchema in [services/detectors/src/arkiv.ts](../services/detectors/src/arkiv.ts).

## cordon.evidence

| Attribute | Type | Indexed | Content |
| --- | --- | --- | --- |
| arkiv.schema | str | yes | `cordon.evidence`, added by the SDK for a named schema |
| evidenceHash | str | yes | keccak256 of the canonical evidence JSON, lowercase hex. The same value the detector puts in its SealRegistry vote |
| detector | str | yes | staticScripts, sandboxCanary or advisoryFeed |
| name | str | yes, optional | npm package name. Left out when longer than 128 bytes (the str limit); npm allows 214 characters. The body always has it |
| version | str | yes | exact version |
| malicious | bool | no | the detector's verdict |
| body | bytes | no | the evidence file, byte for byte as the detectors service writes it to disk |

## Queried fields

1. arkiv.schema and evidenceHash: the only lookup Cordon runs. A verdict onchain carries an evidenceHash; the reader asks for entities with that hash and keeps only one whose body hashes back to it.
2. detector, name and version are indexed so anyone can list the evidence for one package version or one detector without knowing a hash. Cordon itself does not run those queries yet.

## Owner

Entities are created by the writer wallet 0xDe760446b5a7fFf40f17625f77d4165BaA013Fc9. That wallet is the owner, and only the owner can change or delete an entity. The detectors service publishes with it when ARKIV_PRIVATE_KEY is set.

## Expiry

Every entity is created with ExpirationTime.max(): 7,884,000 blocks at 2 seconds, about 182 days. Evidence matters while a seal can be disputed and while people still investigate an incident. Our suggested dispute window is one hour on testnet and at most six hours for real use (docs/open_decisions.md), and votes expire after one day, so 182 days is far past both. A longer life is not possible without extending the entity, which we do not do yet.
