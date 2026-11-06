# How Cordon uses Arkiv

## Writes

After a scan writes its evidence files, the detectors service publishes each one with createEntity on schema cordon.evidence, in the background. Votes are sent at the same time and never wait for Arkiv. The returned entity key, transaction hash and owner are saved next to the evidence as {evidenceHash}.arkiv.json. A failed publish is logged once and the scan goes on.

## Filters used

One query, by the SDK query builder:

```
arkiv.schema = str('cordon.evidence') AND evidenceHash = str('0x…')
```

The reader asks for the entity key, owner and body, up to 20 matches, and keeps the first body whose evidence hash equals the requested hash.

## Who can edit

Only the writer wallet, which owns every entity it creates. Nobody else can change or delete Cordon evidence. Anyone can create another entity with the same schema name and hash, so readers never trust a body without recomputing its hash, and the owner shows who wrote it.

## Expiry

ExpirationTime.max(), about 182 days. That covers the dispute window (one hour suggested on testnet) and the one day vote lifetime with a wide margin for later investigation.

## What each feature changes for a user

1. Publishing: a verdict's evidence becomes readable by anyone with the hash, not just through our server.
2. GET /evidence/:hash falls back to Arkiv: the detectors service can lose its disk and still serve evidence.
3. GET /evidence/:hash/arkiv: the dashboard learns that the evidence is on Arkiv and which entity holds it.
4. Browser fallback in the dashboard: when the detectors service is down or has no copy, the seal page reads the evidence from Arkiv directly, still checks it against the hash in the vote, and shows a Stored on Arkiv label with the entity key.
