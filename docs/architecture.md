# Architecture

Every part of Cordon talks through the types, schemas, hashing and ABI in packages/shared. If a contract, service or page needs a different shape, change packages/shared first, then the callers. The Solidity interface below, including the inherited AccessControlUnauthorizedAccount error, must match packages/shared/src/abis/sealRegistry.ts exactly; the compiled contract may add further OpenZeppelin entries.

The product name lives in productName. The only other places it appears are package names (cordon, @cordon/shared and siblings), the CLI name cordon, and the demo scope @cordondemo, because npm and the shell need literal names there.

## Flow

1. A version is published to an npm registry (the demo uses demo/mockRegistry).
2. The watcher sees it on the registry changes feed, records a published timeline event, and asks the detectors service to scan it.
3. Each detector writes evidence. Each detector that finds the version malicious submits a verdict to SealRegistry from its own key, with the evidence hash.
4. When distinct detector votes reach the quorum, SealRegistry marks that exact version Sealed and emits Sealed. A version with at least one live vote below quorum is Suspect: the detectors look for different things, so silence from the others is not a clean result.
5. The watcher reads registry events, extends the timeline, and publishes a signed snapshot of the Sealed list and the timeline heads.
6. The guard reads the full Sealed list (chain first, signed snapshot second) and checks every lockfile version locally. Installs and CI stop before anything is downloaded. Running services stop serving through the sidecar. The guard proposes a rollback, advises credential rotation when the version was already installed, and sends a signed report of the block to the watcher when configured.
7. The dashboard shows attestations, the Sealed list, service status, and a stopwatch from publish to first verdict to quorum to first block.
8. A guardian key (a multisig in a real deployment; one key in the demo, see docs/limits.md) can seal a Suspect version without waiting for quorum (promote), clear it as a false alarm, unseal after the dispute window and reseal.

Suspect lifecycle:
```
None ──1st live vote──▶ Suspect ──quorum reached───▶ Sealed
                          │      ──guardian promote─▶ Sealed
                          │      ──guardian clear───▶ Cleared
                          └──every vote expires─────▶ None
Sealed ──guardian unseal after dispute window──▶ Unsealed
Cleared or Unsealed ──guardian reseal──▶ Sealed
```
Suspect is derived, never stored: status None with at least one live vote. Guards block it by default with a per version override, the sidecar only warns, and the watcher rescans it so the flagging detector can refresh its vote while it still finds the problem.

## Cut order

If time runs short, cut in this order: Chainlink CRE, the minimum age option, the runtime sidecar. Never cut SealRegistry, the guard install check, or the stopwatch demo.

## Ownership

1. contracts: contracts/.
2. detectors: services/detectors/.
3. watcher: services/watcher/, and cre/ if CRE survives the cut order.
4. guard: packages/guard/.
5. dashboard: apps/dashboard/.
6. demo: demo/ (mockRegistry, poisonedPackage, canarySink, services). Built by the orchestrator: poisonedPackage and canarySink in Phase 1, mockRegistry and services in Phase 2.
7. research: docs/research/.
8. docs: README.md, docs/demo.md, docs/limits.md, docs/rules.md, arkiv/.
9. reviewer: reads everything, edits nothing.
10. orchestrator: packages/shared/, tests/, docs/architecture.md, docs/ai_usage.md, CLAUDE.md, .claude/agents/, and root config files (package.json, pnpm-workspace.yaml, .npmrc, .nvmrc, tsconfig.base.json, .gitignore, .env.example).

docs/decisions.md belongs to the team and no agent edits it.

## Identity and hashing (packages/shared/src/hashing.ts)

1. sealKeyOf(name, version) = keccak256(abi.encode(string "npm", string name, string version)). Same as SealRegistry.keyOf. Name is the real package name (for an npm alias, the target name), and version is exactly as in the lockfile or registry.
2. evidenceHashOf(evidence) = keccak256 of the evidence JSON with keys sorted at every level.
3. timelineEventHashOf(event) = keccak256 of the event JSON without its own hash field. Events for one key form a chain: each event's prevHash is the previous event's hash, the first uses zeroHash. The latest hash per key (the head) goes into every signed snapshot, so rewriting history breaks a signature that was already published.
4. snapshotDigestOf(snapshot) and guardReportDigestOf(report) hash the JSON the same way. Signatures are signMessage over the raw digest and are checked with verifyMessage.
5. Provenance attestations and npm signatures are never read as an allow signal anywhere.
6. defineAppChain builds the viem chain from env for detectors, watcher, guard and dashboard.

## SealRegistry (Solidity 0.8.24, OpenZeppelin v5 AccessControl)

```solidity
interface ISealRegistry {
    enum Status { None, Sealed, Unsealed, Cleared }

    struct Seal {
        Status status;
        uint16 votes;
        uint64 firstVoteAt;
        uint64 sealedAt;
        uint64 unsealedAt;
        uint64 clearedAt;
    }

    event VerdictSubmitted(bytes32 indexed key, address indexed detector, bytes32 evidenceHash, uint16 votes, uint64 at);
    event Sealed(bytes32 indexed key, string ecosystem, string name, string version, uint16 votes, uint64 at);
    event Unsealed(bytes32 indexed key, address indexed guardian, bytes32 reasonHash, uint64 at);
    event Resealed(bytes32 indexed key, address indexed guardian, bytes32 reasonHash, uint64 at);
    event Promoted(bytes32 indexed key, address indexed guardian, bytes32 reasonHash, uint64 at);
    event Cleared(bytes32 indexed key, address indexed guardian, bytes32 reasonHash, uint64 at);

    error InvalidConfig();
    error EmptyEvidence();
    error InvalidEcosystem();
    error DuplicateVote(bytes32 key, address detector);
    error AlreadySealed(bytes32 key);
    error KeyUnsealed(bytes32 key);
    error NotSealed(bytes32 key);
    error NotUnsealed(bytes32 key);
    error KeyCleared(bytes32 key);
    error NotSuspect(bytes32 key);
    error DisputeWindowOpen(uint64 opensAt);
    error SealRateLimited(uint64 day);
    error RolesFrozen();
    error AccessControlUnauthorizedAccount(address account, bytes32 neededRole);

    function DETECTOR_ROLE() external view returns (bytes32);
    function GUARDIAN_ROLE() external view returns (bytes32);
    function quorum() external view returns (uint16);
    function disputeWindow() external view returns (uint64);
    function voteLifetime() external view returns (uint64);
    function maxSealsPerDay() external view returns (uint16);
    function keyOf(string calldata ecosystem, string calldata name, string calldata version) external pure returns (bytes32);
    function submitVerdict(string calldata ecosystem, string calldata name, string calldata version, bytes32 evidenceHash) external returns (bytes32 key);
    function promote(bytes32 key, bytes32 reasonHash) external;
    function clear(bytes32 key, bytes32 reasonHash) external;
    function unseal(bytes32 key, bytes32 reasonHash) external;
    function reseal(bytes32 key, bytes32 reasonHash) external;
    function getSeal(bytes32 key) external view returns (Seal memory);
    function isSealed(bytes32 key) external view returns (bool);
    function hasVoted(bytes32 key, address detector) external view returns (bool);
    function canVote(bytes32 key, address detector) external view returns (bool);
    function liveVotes(bytes32 key) external view returns (uint16);
    function isSuspect(bytes32 key) external view returns (bool);
    function flaggedKeyCount() external view returns (uint256);
    function flaggedKeys(uint256 offset, uint256 limit) external view returns (bytes32[] memory keys, Status[] memory statuses, uint16[] memory votes);
    function sealedKeyCount() external view returns (uint256);
    function sealedKeys(uint256 offset, uint256 limit) external view returns (bytes32[] memory keys, Status[] memory statuses);
}
```

1. Constructor: (address guardian, address[] detectors, uint16 quorum, uint64 disputeWindow, uint64 voteLifetime, uint16 maxSealsPerDay). The guardian (a multisig in a real deployment, one key in the demo) gets GUARDIAN_ROLE. Each detector address gets DETECTOR_ROLE. Nobody gets DEFAULT_ADMIN_ROLE, so the detector set and quorum are frozen for the life of the deployment; rotating a detector key means a new deployment. renounceRole always reverts with RolesFrozen, so no detector or guardian can drop out and make the quorum unreachable. InvalidConfig when quorum is 0, quorum exceeds the number of detectors, a detector address repeats or is zero, the guardian is zero, voteLifetime is 0, or maxSealsPerDay is 0.
2. submitVerdict, DETECTOR_ROLE only, in this order: ecosystem other than "npm" reverts InvalidEcosystem; evidenceHash zero reverts EmptyEvidence; status Sealed reverts AlreadySealed; status Unsealed reverts KeyUnsealed and status Cleared reverts KeyCleared (only the guardian can reseal); a repeat vote before half of voteLifetime has passed since the sender's earlier vote on the key reverts DuplicateVote. A vote is live while block.timestamp < votedAt + voteLifetime; from half its lifetime on, the same detector may vote again, which refreshes its time without counting twice. Then the vote is recorded, firstVoteAt is set and the key is appended to the flagged key list on the first vote ever on the key, votes is set to the number of live votes (bounded by the detector count), and VerdictSubmitted is emitted with that number. hasVoted is true only while the detector's vote is live. canVote is true when the status is None and a vote now would not revert DuplicateVote.
3. When live votes reach quorum: if seals already made in the current UTC day (block.timestamp / 1 days) equal maxSealsPerDay, the whole call reverts SealRateLimited and the signer retries later (see Detectors). Otherwise status becomes Sealed, sealedAt is set, the key is appended to the sealed key list once, and Sealed is emitted.
4. unseal, GUARDIAN_ROLE only: status must be Sealed (else NotSealed) and block.timestamp at least sealedAt + disputeWindow (else DisputeWindowOpen with the opening time). Sets Unsealed and unsealedAt, emits Unsealed.
5. reseal, GUARDIAN_ROLE only: status must be Unsealed or Cleared (else NotUnsealed). Sets Sealed and a new sealedAt, appends the key to the sealed key list if it was never sealed, emits Resealed. Not rate limited.
6. promote, GUARDIAN_ROLE only: the key must be Suspect, status None with at least one live vote (else NotSuspect), so the guardian can never seal a version no detector flagged. Sets Sealed and sealedAt, appends to the sealed key list, emits Promoted. The dispute window applies as for any seal. Not rate limited.
7. clear, GUARDIAN_ROLE only: the key must be Suspect (else NotSuspect). Sets Cleared and clearedAt, emits Cleared. Detector votes on a Cleared key revert KeyCleared; only reseal leaves Cleared.
8. isSuspect is true while the status is None and liveVotes is above 0. flaggedKeys pages through every key that ever got a vote, with its status and live vote count, so the guard downloads the Suspect list whole, the same way as the Sealed list.
9. Versions are independent: sealing one version of a package never changes another version's key.
10. sealedKeys pages through every key that was ever sealed, with its current status, so the guard can download the whole list without revealing what it looks for.
11. Deploy script reads GUARDIAN_ADDRESS, DETECTOR_ADDRESSES (comma separated), QUORUM, DISPUTE_WINDOW_SECONDS, VOTE_LIFETIME_SECONDS, MAX_SEALS_PER_DAY and DEPLOYER_PRIVATE_KEY, and writes contracts/deployments/{chainId}.json.

## Detectors service (services/detectors, Fastify on DETECTORS_PORT)

1. POST /scan, body ScanRequest, response ScanResponse. Detectors run independently: one that fails (for example OSV unreachable) is listed under failures and the others still report and vote. Runs staticScripts on the tarball, sandboxCanary only when the tarball comes from the demo registry (below), and advisoryFeed on the name and version. Writes each Evidence to EVIDENCE_DIR/{evidenceHash}.json. Each malicious result goes to the signer.
2. POST /replay, body replayRequestSchema ({ advisoryId }), response ReplayTimeline. Timeline only, for a real historical advisory: every event comes from a machine readable public source (OSV advisory published and modified times, and publish times from the public npm registry, never NPM_REGISTRY_URL) and carries its sourceUrl. Reading registry metadata never downloads a tarball. It never downloads or runs the real package, never submits a verdict, and never writes to REGISTRY_ADDRESS or any other chain. Every replay is labelled as a replay wherever it is shown.
3. GET /evidence/:evidenceHash, response Evidence. Reads EVIDENCE_DIR first; when the file is missing, reads the evidence from Arkiv by evidenceHash (below).
4. GET /detectors, response DetectorInfo[]. Every demo detector has simulated true.
5. GET /health, response { ok: true }.
6. GET /evidence/:evidenceHash/arkiv, response { entityKey, txHash, owner }: the reference saved after publishing, or the entity found on Arkiv (txHash null), or 404.

Evidence on Arkiv (services/detectors/src/arkiv.ts): when ARKIV_PRIVATE_KEY is set, every evidence written by /scan is also published to the Arkiv testnet Rabdi (chain id 7794095) as one entity of schema cordon.evidence: evidenceHash, detector, name and version as indexed strings (a name over 128 bytes is left out and stays in the body), malicious as a bool, and body as the exact bytes of the evidence file. Publishing runs in the background after the files are written, so votes never wait for it. On success the service writes EVIDENCE_DIR/{evidenceHash}.arkiv.json with { entityKey, txHash, owner }; on failure it logs the error once per evidence and goes on. Entities use the longest lifetime the SDK allows (ExpirationTime.max, about 182 days). Reading needs no key: the reader queries by schema and evidenceHash and keeps only a body that hashes back to evidenceHash, so a forged entity under the same hash is ignored. ARKIV_ACCESS_KEY is optional; without it the SDK uses the public, rate limited endpoint. SealRegistry votes and the watcher timeline stay where they are.

staticScripts: downloads the tarball and reads package.json and the files its scripts call, without executing anything. Flags preinstall, install, postinstall and prepare scripts that touch the network (http, https, net, dns, fetch, curl, wget), environment variables (process.env, shell variables) or a shell (child_process, exec, spawn, sh). Also flags scripts and loaders that start another runtime (bun, deno, python, or a downloaded binary), git dependencies and optionalDependencies pointing at git, and payload files that are not JavaScript (native binaries, shell scripts, or files the scripts call that are not plain JavaScript). Only install time rules make the verdict malicious: install scripts (or files they call) that touch the network, environment variables or a shell, start another runtime, or run non JavaScript, and git dependencies. Prebuilt binaries, wasm and shell files that no install script runs are recorded as findings only, because many legitimate packages ship them and a false seal is an outage.

sandboxCanary:
1. Runs only when the tarball URL's origin equals MOCK_REGISTRY_URL. Any other tarball gets no sandbox run and no sandbox verdict, so real public packages are never executed here.
2. A fresh Docker container from SANDBOX_IMAGE (official Node 22 Alpine image pinned by digest; the service refuses an unpinned image) per run, removed afterwards. No volume or bind mount of any host path. The tarball goes in with docker cp and is installed offline from the file, so the sandbox needs no registry.
3. Network: an internal Docker network with no route out, holding only the sandbox, the mockRegistry container and the canarySink container.
4. Fake secrets in env only, including CANARY_TOKEN, a random value per run injected by the sandbox and never set anywhere else.
5. All capabilities dropped, the no new privileges option set, memory and process limits, 60 second timeout. A blocked or killed run destroys only the disposable container.
6. Every process spawned inside the container during the run (polled with docker top) is recorded in the evidence as informational findings, so a payload that starts another runtime shows up even when it sends nothing. Only the canary decides the verdict.
7. Malicious when canarySink reports that run's CANARY_TOKEN as received. The service asks the sink through docker exec, because the internal network is not reachable from the host. The sink container gets the same limits and no published ports. The demo setup script builds the sink image before the first run.

advisoryFeed: queries OSV (OSV_API_URL is the base URL, the service appends the v1 paths) for malicious package advisories (MAL ids) matching the exact npm name and version. Evidence keeps the advisory URL. Sources are verified by the research agent before use.

signer: one viem wallet per detector key (STATIC_SCRIPTS_PRIVATE_KEY, SANDBOX_CANARY_PRIVATE_KEY, ADVISORY_FEED_PRIVATE_KEY), so the quorum means distinct signers. Skips when canVote is false. Every malicious verdict first goes to a pending file under EVIDENCE_DIR/pending and is retried every 60 seconds until it lands, with DuplicateVote, AlreadySealed, KeyUnsealed and KeyCleared counted as done. SealRateLimited and network failures stay pending.

## Watcher (services/watcher, Fastify on WATCHER_PORT, SQLite at DATABASE_PATH)

1. registry poller: every POLL_INTERVAL_SECONDS reads GET {NPM_REGISTRY_URL}/_changes?since={seq} (RegistryChange[]), stores publishes, and appends a published timeline event.
2. scheduler: sends each new publish to POST {DETECTORS_URL}/scan, one at a time, and retries a failed request on the next tick.
3. chain poller: reads VerdictSubmitted, Sealed, Unsealed, Resealed, Promoted and Cleared logs from REGISTRY_ADDRESS and appends verdict, sealed, unsealed, resealed, promoted and cleared events with the tx hash as ref and the block time as at. Promoted and Resealed take the package name from publishes when Sealed never named it.
4. rescan: every POLL_INTERVAL_SECONDS, each Suspect version whose last scan or vote is older than a quarter of voteLifetime is sent to POST {DETECTORS_URL}/scan again. The other detectors get another look, and the flagging detector refreshes its vote once canVote allows it, so a version stays Suspect only while some detector still finds the problem. voteLifetime is read from the registry at startup.
5. publisher: every POLL_INTERVAL_SECONDS builds a SealedSnapshot (CHAIN_ID, REGISTRY_ADDRESS, latest block, entries, timeline heads). Entries cover Sealed, Unsealed, Cleared and Suspect versions, each with its live vote count; a Suspect entry carries suspectUntil, the time its last live vote expires, signs it with SNAPSHOT_SIGNER_PRIVATE_KEY, writes SNAPSHOT_PATH and serves it. Fresh signatures keep generatedAt meaningful for the guard's age limit.
6. Guard reports: POST /reports accepts only a SignedGuardReport whose signer is in GUARD_REPORTER_ADDRESSES, whose digest it has not seen before, and whose checkedAt is no more than 10 minutes old. A replayed or unsigned report is refused with 401 and records nothing. Each blocked entry appends a guardBlocked event with the service name (or "ci") as actor.
7. simulated on Verdict, Attestation and Stopwatch is true when the detector reports simulated or the registry is the demo registry.

HTTP API:
1. GET /snapshot, response SignedSnapshot. Answers 503 until the first snapshot is signed. generatedAt is the time of the last successful chain poll, so a snapshot never looks fresher than its chain data.
2. GET /attestations, response Attestation[] newest first.
3. GET /timeline/:key, response TimelineEvent[] in chain order.
4. GET /stopwatch, response Stopwatch[]; GET /stopwatch/:key, response Stopwatch.
5. POST /reports, body SignedGuardReport, response ReportAck.
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

Three more tables, added during the build: verdicts (evidence hash and detector per vote, for /attestations), seals (name and version from Sealed events, so every snapshot lists every sealed key) and seen_reports (digests of accepted guard reports, so a replay is refused even when nothing was blocked). All tables use CREATE TABLE IF NOT EXISTS so a restart keeps data. schema.sql in services/watcher is the source of truth.

Rules settled during the build: _changes?since=N returns changes with seq greater than N, starting from 0. A scan whose response lists failures counts as done and the failures are logged, so one detector that stays down never stalls the queue. A guard report dated more than 60 seconds in the future is refused. A service is healthy only when its last outcome is allowed. The guardBlocked key is recomputed from name and version, never taken from the report. Snapshot blockNumber is the last block the chain poller processed. CORS allows only DASHBOARD_ORIGIN. REGISTRY_START_BLOCK is the registry's deploy block for the first log query.

## Guard (packages/guard, CLI named cordon)

Configuration from env, overridable by flags:
1. GUARD_FALLBACK_MIN_AGE_DAYS: N for the age fallback (below). The team sets N in docs/decisions.md. Until then, when the variable is unset, the guard uses a placeholder of 3 days, prints a warning that the placeholder is in use, and sets fallback.placeholder true in the report.
2. GUARD_MIN_AGE_DAYS: optional minimum age that applies on every run, even when the Sealed list loads. 0 or unset disables it.
3. CHAIN_ID, RPC_URL, REGISTRY_ADDRESS: where the Sealed list lives.
4. GUARD_SNAPSHOT_URL, GUARD_SNAPSHOT_SIGNER, GUARD_SNAPSHOT_MAX_AGE_SECONDS, GUARD_CACHE_DIR: the fallback list.
5. GUARD_REPORT_URL and GUARD_REPORTER_PRIVATE_KEY: both unset means nothing is sent anywhere.
6. NPM_REGISTRY_URL: only for the age fallback, the minimum age check and rollback.

Loading the Sealed list, in order:
1. Chain: page through sealedKeys and keep status Sealed. listSource chain. The guard records every key it accepts as Sealed in GUARD_CACHE_DIR/knownSealed.json, scoped to CHAIN_ID and REGISTRY_ADDRESS. A chain list that drops a recorded key is rejected unless the chain reports that key Unsealed and an Unsealed event for it exists from REGISTRY_START_BLOCK on; the guard warns and goes to step 2. Any recorded key missing from the list finally used, and not marked Unsealed there, stays blocked. The chain read also pages through flaggedKeys and keeps keys with status None and live votes as Suspect.
2. Signed snapshot from GUARD_SNAPSHOT_URL, then the last good copy in GUARD_CACHE_DIR. Accepted only when verifyMessage passes for GUARD_SNAPSHOT_SIGNER, chainId equals CHAIN_ID, registry equals REGISTRY_ADDRESS, and generatedAt is within GUARD_SNAPSHOT_MAX_AGE_SECONDS. Every accepted snapshot fetched from the URL replaces the cached copy. Entries with status Suspect form the Suspect list. listSource snapshot; the report sets snapshotAgeSeconds (null for other sources).
3. Neither (chain unreachable, and no snapshot that passes every check, including one older than GUARD_SNAPSHOT_MAX_AGE_SECONDS): listSource none, and the age fallback runs. The guard reads publish times from NPM_REGISTRY_URL and blocks every version younger than N days, listing them under tooYoung. Versions older than N days are allowed. A version whose publish time cannot be read is treated as younger than N and blocked, listed in tooYoung with publishedAt null. The report carries fallback { minAgeDays, placeholder } and a warning in advice that the Sealed list was not checked. When the list loads, fallback is null.

Reading lockfiles:
1. The guard supports only formats it knows: npm-shrinkwrap.json and package-lock.json with lockfileVersion 2 or 3. npm-shrinkwrap.json is read first, then package-lock.json. Any other format or version (1, 4 or later, a missing file, unreadable or malformed JSON, a file larger than the guard's size limit) gives outcome unavailable, never allowed. The guard makes no claim about npm 12.
2. Every entry under packages is checked, transitive ones included. For an npm alias the entry's name field is the real package and is used for the key.
3. Non registry sources: any entry whose source is not the npm registry is high risk and blocks by default: git URLs, GitHub shorthand, commit specifiers on those, http or https tarballs outside the registry origin (NPM_REGISTRY_URL, otherwise https://registry.npmjs.org), file tarballs, and any form the guard does not recognise. Each is listed under nonRegistrySources with its kind (git, github, commit, tarball, file, other). Workspace links stay allowed. GUARD_ALLOW_NON_REGISTRY_SOURCES=true turns the block into a warning. Install passes --allow-git=none on npm 11.10.0 and later (the stricter of the two versions in docs/research/edge_cases.md section 9). The mechanisms behind this rule are in docs/research/edge_cases.md and docs/limits.md.

Suspect versions: every lockfile version that is Suspect and not Sealed is listed under suspect with its live votes and suspectUntil. check and install block it unless that exact version is named with --allow-suspect name@version, which may repeat. An allowed Suspect version stays in the report with allowed true and a warning in advice. A blocked one gets a rollback proposal that skips Sealed and Suspect versions. The sidecar never blocks on Suspect, it warns, because stopping a running service on one vote costs too much. Audit lists installed Suspect versions as warnings.

Commands (exit codes: allowed 0, blocked 1, unavailable 2):
1. cordon check [--lockfile path] [--service name]: reads the lockfile, computes each seal key and matches locally. With a minimum age, reads publish times from NPM_REGISTRY_URL and lists versions younger than the limit under tooYoung, which blocks. Prints the GuardReport and sends it signed when reporting is configured.
2. cordon install [--lockfile path]: runs check, then npm ci with --ignore-scripts only when the outcome is allowed.
3. cordon audit [--path dir]... [--cache dir]... [--docker image.tar]...: scans lockfiles under each path (the current directory when no path is given), each npm cache index, and node_modules package.json files inside the layers of each image saved with docker save. Every hit has alreadyInstalled true. Audit needs the Sealed list: with listSource none its outcome is unavailable and no age fallback runs, because it inspects what is already installed. A layer or manifest it cannot read also makes the outcome unavailable.
4. cordon rollback [--lockfile path]: for each blocked package, reads its registry metadata and proposes the highest earlier version that is neither Sealed nor too young, as an npm overrides snippet. Writes no files.
5. cordon sidecar --lockfile path --service name --port n: rechecks every POLL_INTERVAL_SECONDS. GET /health answers 200 when allowed and 503 when blocked or unavailable. GET /status answers ServiceStatus. Sends changes signed when reporting is configured.

Audit also scans each path for editor and coding agent hook files (for example .claude/settings.json, .vscode/tasks.json and the scripts they call) and lists them under hookFiles, separate from blocked versions. When any are found, advice says to inspect and remove them before revoking any token.

Whenever a blocked version has alreadyInstalled true (audit, sidecar, or a lockfile whose node_modules already holds it), advice includes, in this order:
1. First remove persistence: background daemons or services the package installed, and IDE or coding agent hooks, extensions and config it added. Some payloads destroy files when a stolen token is revoked, so this comes before any revocation.
2. Then rotate every credential that was reachable when that version was installed, including npm tokens, cloud keys, CI secrets and SSH keys.
3. A runtime stop does not undo theft that happened at install time.

## Dashboard (apps/dashboard, Next.js App Router)

1. /: stopwatch for the latest seal (publish, first verdict, quorum, first block, and the gap between each) and the live attestation feed. Data: watcher /stopwatch, /attestations.
2. /sealed: every sealed key with status. Data: SealRegistry sealedKeys, watcher /snapshot for names.
3. /seal/[key]: evidence per detector, timeline with hash chain check in the browser against the signed head, tx links. Data: watcher /timeline and /snapshot, detectors /evidence and /evidence/:evidenceHash/arkiv. When the detectors service is unreachable or has no copy, the browser reads the evidence straight from Arkiv by evidenceHash with the public client (NEXT_PUBLIC_ARKIV_ACCESS_KEY optional) and still recomputes the hash. A Stored on Arkiv label with the entity key shows whenever an Arkiv reference exists.
4. /services: guard sidecar status per service. Data: watcher /services.
5. /guardian: the Suspect queue (name, live votes, expiry, evidence link), then promote, clear, unseal and reseal through the connected wallet, with the dispute window countdown. Data: SealRegistry, watcher /snapshot.
6. /demo, only when NEXT_PUBLIC_DEMO is true: publish the poisoned demo version, reset, and show a historical replay timeline labelled as a replay, kept visually apart from the live stopwatch. Data: mockRegistry /_demo routes, detectors /replay.

Every simulated detector, verdict, stopwatch and exfiltration is labelled simulated wherever it appears. Every status shows text plus an icon. Every chain action links to NEXT_PUBLIC_EXPLORER_URL. Chain from defineAppChain with the NEXT_PUBLIC_ chain variables.

## Demo (demo/)

1. mockRegistry (MOCK_REGISTRY_PORT, a dependency free node process bound to 127.0.0.1; the sandbox never needs it because the tarball is copied in): the npm registry endpoints npm needs for packuments and tarballs, plus GET /_changes?since=seq (RegistryChange[]), POST /_demo/publish (demoPublishRequestSchema) and POST /_demo/reset. Storage under demo/mockRegistry/storage, ignored by git.
2. poisonedPackage: @cordondemo/colorkit. Version 1.4.0 has no scripts. Version 1.4.1 has a dependency free postinstall that reads only the CANARY_TOKEN env value, writes it to a file in the OS temp folder, and posts it to CANARY_SINK_URL only when that URL's host is localhost, 127.0.0.1 or canarysink (the container name); any other host means it does nothing. Nothing else. Outside the pnpm workspace, never installed outside the sandbox or the demo services.
3. canarySink: a dependency free Node script outside the pnpm workspace. It runs either as a container on the internal sandbox network (for sandboxCanary) or on the host bound to 127.0.0.1 only (for the demo services). It is never reachable from outside the machine. POST /collect stores what arrives; GET /received?token= answers { received, at }; GET /received lists everything. Labelled simulated exfiltration.
4. services: ordersApi, searchApi and notifyWorker, each a tiny HTTP service outside the pnpm workspace with its own package-lock.json resolved from mockRegistry, each behind a guard sidecar and answering 503 with a plain message while its sidecar is unhealthy. searchApi stays on 1.4.0 to show that sealing is per version.

Demo quorum is 2 of 3 detectors.

## Tests plan

Unit tests live next to the code in each package. Two cross cutting suites live in tests/ (workspace package @cordon/tests, owned by the orchestrator, run by pnpm test):

tests/fitness, structural rules that must always hold:
1. The guard never runs install scripts: every npm invocation in packages/guard passes --ignore-scripts, and none runs when the outcome is not allowed.
2. The sandbox mounts no host path: no docker argument in services/detectors uses -v, --volume or --mount, and no published ports.
3. packages/shared depends on nothing in the workspace and on no service, app or demo code.
4. SealRegistry.keyOf equals sealKeyOf for the same name and version (computed with cast against the compiled contract or a local anvil deployment).

tests/chaos, failure behaviour end to end on a local anvil chain:
1. Chain unreachable: guard falls back to a signed snapshot, then to the age fallback.
2. Stale snapshot: guard refuses it and uses the age fallback.
3. Detector offline: scan lists it under failures and the other detectors still vote.
4. Malformed lockfile and oversized lockfile: outcome unavailable.
5. Single detector seal attempt: one vote with quorum 2 leaves the version unsealed, and a second vote from the same key reverts.
6. Replayed signature: a snapshot signed for another chain or registry is refused by the guard; a guard report posted twice is refused by the watcher the second time.
7. Unsigned guard report: the watcher refuses it and records nothing.

## Environment

All variables are listed with empty values in .env.example. For Base Sepolia: chain id 84532, explorer sepolia.basescan.org, native symbol ETH. Changing chain means changing env only.

1. CHAIN_ID, RPC_URL, EXPLORER_URL, NATIVE_SYMBOL: contracts, detectors, watcher, guard.
2. DEPLOYER_PRIVATE_KEY, GUARDIAN_ADDRESS, DETECTOR_ADDRESSES, QUORUM, DISPUTE_WINDOW_SECONDS, VOTE_LIFETIME_SECONDS, MAX_SEALS_PER_DAY: contracts.
3. REGISTRY_ADDRESS: detectors, watcher, guard.
4. STATIC_SCRIPTS_PRIVATE_KEY, SANDBOX_CANARY_PRIVATE_KEY, ADVISORY_FEED_PRIVATE_KEY, DETECTORS_PORT, EVIDENCE_DIR, SANDBOX_IMAGE, OSV_API_URL: detectors.
5. MOCK_REGISTRY_URL: detectors (sandbox allow rule). ARKIV_PRIVATE_KEY (optional, turns on publishing evidence to Arkiv) and ARKIV_ACCESS_KEY (optional): detectors.
6. CANARY_SINK_URL: detectors, poisonedPackage.
7. DETECTORS_URL, WATCHER_PORT, DATABASE_PATH, SNAPSHOT_SIGNER_PRIVATE_KEY, SNAPSHOT_PATH, GUARD_REPORTER_ADDRESSES, DASHBOARD_ORIGIN, REGISTRY_START_BLOCK: watcher. MOCK_REGISTRY_URL is also read by the watcher to mark demo publishes simulated.
8. NPM_REGISTRY_URL: watcher, guard.
9. POLL_INTERVAL_SECONDS: watcher, guard sidecar.
10. GUARD_FALLBACK_MIN_AGE_DAYS, GUARD_ALLOW_NON_REGISTRY_SOURCES, GUARD_MIN_AGE_DAYS, GUARD_SNAPSHOT_URL, GUARD_SNAPSHOT_SIGNER, GUARD_SNAPSHOT_MAX_AGE_SECONDS, GUARD_CACHE_DIR, GUARD_REPORT_URL, GUARD_REPORTER_PRIVATE_KEY, GUARD_HTTP_TIMEOUT_MS (default 5000, applied to the RPC, the snapshot fetch, registry metadata and reports): guard. The guard also reads REGISTRY_START_BLOCK for its Unsealed event query.
11. MOCK_REGISTRY_PORT, MOCK_REGISTRY_STORAGE, MOCK_REGISTRY_DIST, CANARY_SINK_PORT, HOST, SERVICE_PORT, GUARD_SIDECAR_URL: demo. CORDON_DOCKER_TESTS=1 turns on the real Docker sandbox test in services/detectors.
12. NEXT_PUBLIC_*: dashboard. NEXT_PUBLIC_ARKIV_ACCESS_KEY is optional; without it the browser reads Arkiv through the public endpoint.

## Open decisions for the team

1. N for the age fallback: placeholder 3 days until the team sets it in docs/decisions.md.
2. Dispute window length and other team decisions are recorded by the team in docs/decisions.md.
3. Chainlink CRE is first in the cut order. Its supported networks are still unconfirmed.

## Settled

1. Historical replay is timeline only, labelled as a replay, and never writes to the main registry (team, 5 Nov 2026).
2. The May 2026 malicious release with valid provenance is verified: see docs/research/incidents.md.
3. Foundry and Docker are installed and running on the build machine.
4. Unavailable Sealed list: the guard uses the age fallback, neither failing open nor closed (team, 6 Nov 2026).
