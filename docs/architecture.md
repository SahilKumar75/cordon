# Architecture

Every part of Bulkhead talks through the types, schemas, hashing and ABI in packages/shared. If a contract, service or page needs a different shape, change packages/shared first, then the callers. The Solidity interface below must match packages/shared/src/abis/sealRegistry.ts exactly; contract code may add entries inherited from OpenZeppelin.

## Flow

1. A version is published to an npm registry (the demo uses demo/mockRegistry).
2. The watcher sees it on the registry changes feed, records a published timeline event, and asks the detectors service to scan it.
3. Each detector writes signed evidence. Each detector that finds the version malicious submits a verdict to SealRegistry from its own key, with the evidence hash.
4. When distinct detector votes reach the quorum, SealRegistry marks that exact version Sealed and emits Sealed.
5. The watcher reads registry events, extends the timeline, and publishes a signed snapshot of the Sealed list.
6. The guard reads the full Sealed list (chain first, signed snapshot second) and checks every lockfile version locally. Installs and CI stop before anything is downloaded. Running services stop serving through the sidecar. The guard proposes a rollback, advises credential rotation when the version was already installed, and reports the block to the watcher.
7. The dashboard shows attestations, the Sealed list, service status, and a stopwatch from publish to first verdict to quorum to first block.
8. A guardian multisig can unseal after the dispute window and can reseal.

## Ownership

1. contracts: contracts/.
2. detectors: services/detectors/.
3. watcher: services/watcher/, and cre/ if the CRE path survives the cut order.
4. guard: packages/guard/.
5. dashboard: apps/dashboard/.
6. demo: demo/ (mockRegistry, poisonedPackage, canarySink, services). Built in Phase 2 by the orchestrator or a demo subagent briefed from this file.
7. research: docs/research/.
8. docs: README.md, docs/ except decisions.md, prompts/ and research/.
9. reviewer: reads everything, edits nothing.
10. orchestrator: packages/shared/, root files, CLAUDE.md, .claude/agents/, docs/ai_usage.md.

docs/decisions.md belongs to the team and no agent edits it.

## Identity and hashing (packages/shared/src/hashing.ts)

1. sealKeyOf(name, version) = keccak256(abi.encode(string "npm", string name, string version)). Same as SealRegistry.keyOf. Name and version are taken exactly as they appear in the lockfile or registry.
2. evidenceHashOf(evidence) = keccak256 of the evidence JSON with keys sorted at every level.
3. timelineEventHashOf(event) = keccak256 of the event JSON without its own hash field. Events for one key form a chain: each event's prevHash is the previous event's hash, the first uses zeroHash.
4. snapshotDigestOf(snapshot) = keccak256 of the snapshot JSON. The watcher signs it with signMessage over the raw digest; the guard checks it with verifyMessage against GUARD_SNAPSHOT_SIGNER.
5. Provenance attestations and npm signatures are never read as an allow signal anywhere.

## SealRegistry (Solidity 0.8.24, OpenZeppelin v5 AccessControl)

```solidity
interface ISealRegistry {
    enum Status { None, Sealed, Unsealed }

    struct Seal {
        Status status;
        uint16 votes;
        uint64 firstVoteAt;
        uint64 sealedAt;
        uint64 unsealedAt;
    }

    event VerdictSubmitted(bytes32 indexed key, address indexed detector, bytes32 evidenceHash, uint16 votes, uint64 at);
    event Sealed(bytes32 indexed key, string ecosystem, string name, string version, uint16 votes, uint64 at);
    event Unsealed(bytes32 indexed key, address indexed guardian, bytes32 reasonHash, uint64 at);
    event Resealed(bytes32 indexed key, address indexed guardian, bytes32 reasonHash, uint64 at);

    error InvalidConfig();
    error EmptyEvidence();
    error DuplicateVote(bytes32 key, address detector);
    error AlreadySealed(bytes32 key);
    error KeyUnsealed(bytes32 key);
    error NotSealed(bytes32 key);
    error NotUnsealed(bytes32 key);
    error DisputeWindowOpen(uint64 opensAt);
    error SealRateLimited(uint64 day);

    function DETECTOR_ROLE() external view returns (bytes32);
    function GUARDIAN_ROLE() external view returns (bytes32);
    function quorum() external view returns (uint16);
    function disputeWindow() external view returns (uint64);
    function maxSealsPerDay() external view returns (uint16);
    function keyOf(string calldata ecosystem, string calldata name, string calldata version) external pure returns (bytes32);
    function submitVerdict(string calldata ecosystem, string calldata name, string calldata version, bytes32 evidenceHash) external returns (bytes32 key);
    function unseal(bytes32 key, bytes32 reasonHash) external;
    function reseal(bytes32 key, bytes32 reasonHash) external;
    function getSeal(bytes32 key) external view returns (Seal memory);
    function isSealed(bytes32 key) external view returns (bool);
    function hasVoted(bytes32 key, address detector) external view returns (bool);
    function sealedKeyCount() external view returns (uint256);
    function sealedKeys(uint256 offset, uint256 limit) external view returns (bytes32[] memory keys, Status[] memory statuses);
}
```

1. Constructor: (address guardian, address[] detectors, uint16 quorum, uint64 disputeWindow, uint16 maxSealsPerDay). The guardian (a multisig) gets DEFAULT_ADMIN_ROLE and GUARDIAN_ROLE. Each detector address gets DETECTOR_ROLE. InvalidConfig when quorum is 0, quorum exceeds the number of detectors, a detector address repeats or is zero, or maxSealsPerDay is 0.
2. submitVerdict, DETECTOR_ROLE only, in this order: evidenceHash zero reverts EmptyEvidence; status Sealed reverts AlreadySealed; status Unsealed reverts KeyUnsealed (only the guardian can reseal); a repeat vote reverts DuplicateVote. Then the vote is recorded, firstVoteAt is set on the first vote, votes goes up by one, and VerdictSubmitted is emitted.
3. When votes reach quorum: if seals already made in the current UTC day (block.timestamp / 1 days) equal maxSealsPerDay, the whole call reverts SealRateLimited and the detector retries later. Otherwise status becomes Sealed, sealedAt is set, the key is appended to the sealed key list once, and Sealed is emitted.
4. unseal, GUARDIAN_ROLE only: status must be Sealed (else NotSealed) and block.timestamp at least sealedAt + disputeWindow (else DisputeWindowOpen with the opening time). Sets Unsealed and unsealedAt, emits Unsealed.
5. reseal, GUARDIAN_ROLE only: status must be Unsealed (else NotUnsealed). Sets Sealed and a new sealedAt, emits Resealed. Not rate limited.
6. Versions are independent: sealing one version of a package never changes another version's key.
7. sealedKeys pages through every key that was ever sealed, with its current status, so the guard can download the whole list without revealing what it looks for.
8. Deploy script reads GUARDIAN_ADDRESS, DETECTOR_ADDRESSES (comma separated), QUORUM, DISPUTE_WINDOW_SECONDS, MAX_SEALS_PER_DAY and DEPLOYER_PRIVATE_KEY, and writes contracts/deployments/{chainId}.json.

## Detectors service (services/detectors, Fastify on DETECTORS_PORT)

1. POST /scan, body ScanRequest, response ScanResponse. Runs staticScripts and sandboxCanary on the tarball, and advisoryFeed on the name and version. Writes each Evidence to EVIDENCE_DIR/{evidenceHash}.json. For each malicious result the signer submits submitVerdict from that detector's key, skipping when hasVoted or isSealed is already true.
2. POST /replay, body { advisoryId }, response ScanResponse. advisoryFeed only, for a real historical advisory. It never downloads or runs the real package.
3. GET /evidence/:evidenceHash, response Evidence.
4. GET /detectors, response [{ id, address, simulated }]. Every demo detector has simulated true.
5. GET /health, response { ok: true }.

staticScripts: reads package.json from the tarball without executing anything. Flags preinstall, install, postinstall and prepare scripts, and the files they call, when they touch the network (http, https, net, dns, fetch, curl, wget), environment variables (process.env, shell variables) or a shell (child_process, exec, spawn, sh).

sandboxCanary: runs npm install of the tarball in a fresh Docker container from SANDBOX_IMAGE (official Node 22 Alpine image pinned by digest). No volume mounts of any host path. Fake secrets in env, including a random canary token per run. Network limited to an internal Docker network holding only the canary sink and the mock registry. All capabilities dropped, the no new privileges option set, memory and process limits, 60 second timeout, container removed afterwards. Malicious when CANARY_SINK_URL reports the run's token as received.

advisoryFeed: queries OSV (OSV_API_URL) for malicious package advisories (MAL ids) matching the exact npm name and version. The evidence keeps the advisory URL. Sources are verified by the research agent before use.

signer: one viem wallet per detector key (STATIC_SCRIPTS_PRIVATE_KEY, SANDBOX_CANARY_PRIVATE_KEY, ADVISORY_FEED_PRIVATE_KEY). Detector keys stay distinct so the quorum means distinct signers.

## Watcher (services/watcher, Fastify on WATCHER_PORT, SQLite at DATABASE_PATH)

1. registry poller: every POLL_INTERVAL_SECONDS reads GET {NPM_REGISTRY_URL}/_changes?since={seq} (RegistryChange[]), stores publishes, and appends a published timeline event.
2. scheduler: sends each new publish to POST {DETECTORS_URL}/scan, one at a time.
3. chain poller: reads VerdictSubmitted, Sealed, Unsealed and Resealed logs from REGISTRY_ADDRESS and appends verdict, sealed, unsealed and resealed events with the tx hash as ref and the block time as at.
4. publisher: after any Sealed, Unsealed or Resealed log, builds a SealedSnapshot, signs it with SNAPSHOT_SIGNER_PRIVATE_KEY, writes SNAPSHOT_PATH and serves it.
5. Guard reports: each blocked entry in a posted GuardReport appends a guardBlocked event with the service name (or "ci") as actor.

HTTP API:
1. GET /snapshot, response SignedSnapshot.
2. GET /attestations, response Attestation[] newest first.
3. GET /timeline/:key, response TimelineEvent[] in chain order.
4. GET /stopwatch, response Stopwatch[]; GET /stopwatch/:key, response Stopwatch.
5. POST /reports, body GuardReport, response { recorded: number }.
6. GET /services, response ServiceStatus[].
7. GET /health, response { ok: true }.

SQLite:

```sql
CREATE TABLE publishes (
  seq INTEGER PRIMARY KEY,
  seal_key TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  published_at TEXT NOT NULL,
  tarball_url TEXT NOT NULL,
  integrity TEXT NOT NULL
);

CREATE TABLE timeline_events (
  seal_key TEXT NOT NULL,
  position INTEGER NOT NULL,
  kind TEXT NOT NULL,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  ref TEXT,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL,
  PRIMARY KEY (seal_key, position)
);

CREATE TABLE service_status (
  service TEXT PRIMARY KEY,
  healthy INTEGER NOT NULL,
  report_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE cursors (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

## Guard (packages/guard, CLI named bulkhead)

Configuration from env, overridable by flags: GUARD_FAIL_MODE (open or closed, required, no default until the team decides; the guard refuses to start without it), GUARD_MIN_AGE_DAYS (0 or unset disables), RPC_URL and REGISTRY_ADDRESS, GUARD_SNAPSHOT_URL and GUARD_SNAPSHOT_SIGNER, GUARD_CACHE_DIR, GUARD_REPORT_URL (unset means nothing is sent anywhere).

Loading the Sealed list, in order:
1. Chain: page through sealedKeys, keep status Sealed, cache to GUARD_CACHE_DIR. listSource chain.
2. Signed snapshot from GUARD_SNAPSHOT_URL, or the cached copy, accepted only if verifyMessage passes for GUARD_SNAPSHOT_SIGNER. listSource snapshot; the report states the snapshot age.
3. Neither: listSource none. failMode closed gives outcome unavailable; failMode open gives outcome allowed with a warning in advice.

Commands (exit codes from guardExitCodes: allowed 0, blocked 1, unavailable 2):
1. bulkhead check [--lockfile path] [--service name]: reads package-lock.json (lockfile versions 2 and 3), takes every entry under packages including transitive ones, computes each seal key and matches locally. With a minimum age, reads publish times from the registry and lists versions younger than the limit under tooYoung, which blocks. Prints the GuardReport and posts it to GUARD_REPORT_URL when set.
2. bulkhead install [--lockfile path]: runs check, then npm ci with --ignore-scripts only when the outcome is allowed.
3. bulkhead audit [--path dir]... [--cache dir] [--docker image]: scans package-lock.json files under each path, the npm cache index, and node_modules package.json files inside the layers of a saved Docker image. Every hit has alreadyInstalled true.
4. bulkhead rollback [--lockfile path]: for each blocked package, reads its registry metadata and proposes the highest earlier version that is neither Sealed nor too young, as an npm overrides snippet. Writes no files.
5. bulkhead sidecar --lockfile path --service name --port n: rechecks every POLL_INTERVAL_SECONDS. GET /health answers 200 when allowed and 503 when blocked or unavailable under failMode closed. GET /status answers ServiceStatus. Reports changes to GUARD_REPORT_URL.

Whenever a blocked version has alreadyInstalled true (audit, sidecar, or a lockfile whose node_modules already holds it), advice includes: rotate every credential that was reachable when that version was installed, including npm tokens, cloud keys, CI secrets and SSH keys.

## Dashboard (apps/dashboard, Next.js App Router)

1. /: stopwatch for the latest seal (publish, first verdict, quorum, first block, with the gap between each) and the live attestation feed. Data: watcher /stopwatch, /attestations.
2. /sealed: every sealed key with status. Data: SealRegistry sealedKeys, watcher /snapshot for names.
3. /seal/[key]: evidence per detector, timeline with hash chain check in the browser, tx links. Data: watcher /timeline, detectors /evidence.
4. /services: guard sidecar status per service. Data: watcher /services.
5. /guardian: unseal and reseal through the connected wallet, with the dispute window countdown. Data: SealRegistry.
6. /demo, only when NEXT_PUBLIC_DEMO is true: publish the poisoned demo version, run a replay, reset. Every detector and every exfiltration on this page is labelled simulated.

Every status shows text plus an icon. Every chain action links to NEXT_PUBLIC_EXPLORER_URL. Chain from defineBulkheadChain with the NEXT_PUBLIC_ chain variables.

## Demo (demo/)

1. mockRegistry (MOCK_REGISTRY_PORT): the npm registry endpoints npm needs for packuments and tarballs, plus GET /_changes?since=seq (RegistryChange[]), POST /_demo/publish { name, version } and POST /_demo/reset. Storage under demo/mockRegistry/storage, ignored by git.
2. poisonedPackage: @bulkheaddemo/colorkit. Version 1.4.0 has no scripts. Version 1.4.1 has a postinstall that reads only the BULKHEAD_CANARY env value, writes it to a file in the OS temp folder, and posts it to CANARY_SINK_URL. Nothing else. Never a workspace member, never installed outside the sandbox or the demo services.
3. canarySink (CANARY_SINK_PORT): POST /collect stores what arrives; GET /received?token= answers { received, at }; GET /received lists everything. Labelled simulated exfiltration.
4. services: ordersApi, searchApi and notifyWorker, each a tiny HTTP service with its own package-lock.json on @bulkheaddemo/colorkit, each behind a guard sidecar and answering 503 with a plain message while its sidecar is unhealthy. searchApi stays on 1.4.0 to show that sealing is per version.

Demo quorum is 2 of 3 detectors.

## Environment

All variables are listed with empty values in .env.example. For Base Sepolia: chain id 84532, explorer sepolia.basescan.org, native symbol ETH. Changing chain means changing env only.

1. CHAIN_ID, RPC_URL, EXPLORER_URL, NATIVE_SYMBOL: contracts, detectors, watcher, guard.
2. DEPLOYER_PRIVATE_KEY, GUARDIAN_ADDRESS, DETECTOR_ADDRESSES, QUORUM, DISPUTE_WINDOW_SECONDS, MAX_SEALS_PER_DAY, ETHERSCAN_API_KEY: contracts.
3. REGISTRY_ADDRESS: detectors, watcher, guard.
4. STATIC_SCRIPTS_PRIVATE_KEY, SANDBOX_CANARY_PRIVATE_KEY, ADVISORY_FEED_PRIVATE_KEY, DETECTORS_PORT, EVIDENCE_DIR, SANDBOX_IMAGE, OSV_API_URL: detectors.
5. CANARY_SINK_URL: detectors, poisonedPackage.
6. DETECTORS_URL, NPM_REGISTRY_URL, WATCHER_PORT, DATABASE_PATH, SNAPSHOT_SIGNER_PRIVATE_KEY, SNAPSHOT_PATH: watcher. NPM_REGISTRY_URL is also read by the guard for minimum age and rollback.
7. POLL_INTERVAL_SECONDS: watcher, guard sidecar.
8. WATCHER_URL: guard defaults for GUARD_SNAPSHOT_URL and GUARD_REPORT_URL in the demo.
9. GUARD_FAIL_MODE, GUARD_MIN_AGE_DAYS, GUARD_SNAPSHOT_URL, GUARD_SNAPSHOT_SIGNER, GUARD_REPORT_URL, GUARD_CACHE_DIR, SIDECAR_PORT: guard.
10. MOCK_REGISTRY_PORT, CANARY_SINK_PORT: demo.
11. NEXT_PUBLIC_*: dashboard.

## Open decisions for the team

1. GUARD_FAIL_MODE default: open or closed. No default is set until the team answers.
2. Dispute window length. A false seal stays an outage until the window ends, so a short window (for example one hour) limits the damage; a long one gives more review time.
3. Historical replay and quorum. Replay must not download real malware, so only advisoryFeed can vote on a real incident. Either the replay runs on a separate registry deployment with quorum 1, or it only shows the timeline it would have produced.
4. The claim in the brief that a malicious release with valid provenance happened in May 2026 is unverified until the research agent links a source.
5. Foundry is not installed (only foundryup is present). The Docker CLI is installed but its daemon is not running. Both are needed in Phase 1.
6. Chainlink CRE is first in the cut order. Its supported networks are still unconfirmed.
