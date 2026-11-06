# Friction

What slowed us down while adding Arkiv on 6 Nov 2026, with SDK @arkiv-network/sdk 1.0.1.

1. SDK 1.0 moved to a schema based API, so older examples no longer apply. Every create goes through defineSchema with typed columns (str, bool, bytes and others), and queries go through select(...).from(schema).where(...). We read the package source and type definitions in node_modules to confirm each name before using it.
2. The documentation gives no link format for an entity in the explorer. We know the explorer is at rabdi.explorer.arkiv.network but could not confirm a URL for one entity key, so the dashboard shows the entity key as text instead of a link.
3. The indexer or query service URL is not in the documentation. We found that the RPC itself answers arkiv_query, which is what the SDK uses, and confirmed it with a read query against the public RPC.
4. The faucet needs a connected browser wallet. Our writer wallet is a key in a server environment, so it cannot be funded from a script, and no entity exists yet.
5. A str attribute holds at most 128 bytes, while npm package names can reach 214 characters. We leave long names out of the indexed attribute and keep them in the body.
6. Without an access key the SDK prints a warning and uses a rate limited public endpoint. That is fine for a demo, but every dashboard visitor shares that limit.
