# Architecture

Every part of Sluice talks through the types, schemas, hashing and ABIs in packages/shared. If a contract, service or page needs a different shape, change packages/shared first, then the callers. The Solidity interfaces below must match the ABIs in packages/shared/src/abis exactly.

## Flow

1. A funder creates a grant in MilestoneEscrow for a researcher, a paperHash and a list of milestone amounts, paying the total in the chain's native token.
2. The author submits the paper's reference list (or a PDF) to the verifier. The verifier checks each reference against Crossref and OpenAlex, stores the report in SQLite and returns it with its hash.
3. The watcher rechecks every tracked paper on a schedule. When the computed status differs from the status on chain, it publishes the new status, report hash and dbVersion to IntegrityOracle.
4. releaseMilestone pays the next milestone only while the oracle reads Clean for that paperHash.
5. A retraction of a cited work (real, or simulated in the demo) makes the next recheck report Flagged. The watcher publishes Flagged and the next release reverts. Funds stay in the escrow.
6. The author removes or replaces the citation and verifies again. The watcher publishes Clean and release works again.
7. If a paper stays Flagged, the guardian can release the next milestone once the dispute window has passed since the Flagged status was set.

## Ownership

1. Contracts. Owner agent: contracts; paths: contracts/.
2. Verifier service. Owner agent: verifier; paths: services/verifier/.
3. Watcher service and CRE workflow. Owner agent: watcher; paths: services/watcher/, cre/.
4. Web app. Owner agent: frontend; paths: apps/web/.
5. SQLite schema, seed, fixtures. Owner agent: data; paths: data/.
6. README and docs. Owner agent: docs; paths: README.md, docs/ except decisions.md and prompts/.
7. Audit. Owner agent: reviewer; paths: reads everything, edits nothing.
8. Shared package, root config, CLAUDE.md, agent files. Owner agent: orchestrator; paths: packages/shared/, root files, .claude/agents/.

docs/decisions.md belongs to the team and no agent edits it.

## Paper identity and hashing

1. paperId is a stable identifier chosen when the paper is first verified: the paper's own DOI, or another stable id such as an arXiv id.
2. paperHash = keccak256 of the UTF8 bytes of paperId after it is trimmed, lowercased, and stripped of a doi.org URL prefix or a "doi:" prefix. Fixing a citation keeps the same paperHash. Implemented as paperHashOf.
3. reportHash = keccak256 of the report JSON without the advisory field, serialized with keys sorted at every level, no whitespace. Model output therefore never affects the hash on chain. Implemented as hashReport.

## Report

Defined by reportSchema in packages/shared/src/schemas.ts.

```ts
type ReferenceCheck = {
  raw: string
  doi: string | null
  resolved: boolean
  retracted: boolean
  retractionDate: string | null
  source: "crossref" | "openalex" | "simulation" | null
  matchConfidence: number
}

type Report = {
  version: 1
  paperId: string
  paperHash: Hex32
  checkedAt: string
  dbVersion: string
  references: ReferenceCheck[]
  summary: {
    status: "Clean" | "Flagged"
    total: number
    resolvedCount: number
    unresolvedCount: number
    retractedCount: number
  }
  advisory: { label: "advisory"; notes: string[] } | null
}
```

Rules:
1. A reference has a DOI only when a DOI appears in its text (doiPattern). matchConfidence is 1 for those and 0 for references without a DOI. No fuzzy title search in this version.
2. resolved is true when Crossref returns the work for that DOI.
3. retracted is true when Crossref lists a retraction notice for the work, or OpenAlex marks it retracted, or the DOI is in the simulated list passed by the watcher. source names which one; Crossref wins over OpenAlex, both win over simulation. retractionDate comes from the Crossref notice or the simulation time, null for OpenAlex.
4. summary.status is Flagged when retractedCount is above 0, otherwise Clean. Unresolved references are listed and counted but never flag on their own. reportSchema rejects a report whose status or total disagrees with its references.
7. A DOI match stops before trailing punctuation, so "10.1000/x)." yields "10.1000/x".
5. dbVersion names the sources queried and the UTC date of the query, for example "crossref+openalex@20261106". When a simulated retraction was applied, "+simulation" is appended.
6. advisory is null unless a model judged check runs. It never changes summary.status and is never written on chain.

## Contracts

Solidity 0.8.24, OpenZeppelin v5 AccessControl and ReentrancyGuard.

```solidity
interface IIntegrityOracle {
    enum Status { Unknown, Clean, Flagged }

    struct Record {
        Status status;
        bytes32 reportHash;
        string dbVersion;
        uint64 updatedAt;
    }

    event StatusChanged(bytes32 indexed paperHash, Status status, bytes32 reportHash, string dbVersion, uint64 updatedAt);

    error InvalidStatus(uint8 status);

    function VERIFIER_ROLE() external view returns (bytes32);
    function setStatus(bytes32 paperHash, Status status, bytes32 reportHash, string calldata dbVersion) external;
    function onReport(bytes calldata metadata, bytes calldata report) external;
    function getStatus(bytes32 paperHash) external view returns (Record memory);
    function isClean(bytes32 paperHash) external view returns (bool);
}
```

1. setStatus and onReport require VERIFIER_ROLE. The publisher wallet gets the role at deploy. The CRE forwarder gets it only when CRE_FORWARDER_ADDRESS is set.
2. onReport decodes report as abi.encode(bytes32 paperHash, uint8 status, bytes32 reportHash, string dbVersion) and applies the same logic as setStatus. metadata is ignored. The oracle also reports support for the CRE receiver interface through supportsInterface. The exact receiver interface is checked against the CRE docs before Phase 2.
3. Setting Unknown reverts with InvalidStatus. Every successful call sets updatedAt to block.timestamp and emits StatusChanged.

```solidity
interface IMilestoneEscrow {
    struct Grant {
        address funder;
        address researcher;
        bytes32 paperHash;
        uint256[] amounts;
        uint256 nextMilestone;
        uint256 released;
        uint64 createdAt;
    }

    event GrantCreated(uint256 indexed grantId, address indexed funder, address indexed researcher, bytes32 paperHash, uint256 total);
    event MilestoneReleased(uint256 indexed grantId, uint256 indexed index, uint256 amount, bool byGuardian);

    error NoMilestones();
    error ZeroAmount();
    error ZeroResearcher();
    error ValueMismatch(uint256 expected, uint256 sent);
    error UnknownGrant(uint256 grantId);
    error AllMilestonesPaid(uint256 grantId);
    error NotGrantParty(address caller);
    error PaperNotClean(bytes32 paperHash, uint8 status);
    error PaperIsClean(bytes32 paperHash);
    error DisputeWindowOpen(uint64 opensAt);
    error TransferFailed();

    function GUARDIAN_ROLE() external view returns (bytes32);
    function oracle() external view returns (address);
    function disputeWindow() external view returns (uint64);
    function grantCount() external view returns (uint256);
    function getGrant(uint256 grantId) external view returns (Grant memory);
    function createGrant(address researcher, bytes32 paperHash, uint256[] calldata amounts) external payable returns (uint256 grantId);
    function releaseMilestone(uint256 grantId) external;
    function guardianResolve(uint256 grantId) external;
}
```

1. Constructor: (address oracle, address guardian, uint64 disputeWindow). The deployer gets DEFAULT_ADMIN_ROLE, the guardian gets GUARDIAN_ROLE.
2. createGrant: amounts not empty, every amount above 0, researcher not zero, msg.value equal to the sum. Grant ids start at 0 and count up.
3. releaseMilestone: caller is the funder or the researcher. Pays amounts[nextMilestone] to the researcher only if oracle.isClean(paperHash). Milestones are paid strictly in order, so a milestone is only payable after the previous one.
4. guardianResolve: caller has GUARDIAN_ROLE and the oracle status is not Clean (Clean reverts with PaperIsClean, use releaseMilestone). The window starts at the oracle record's updatedAt when Flagged, or at the grant's createdAt when the paper is still Unknown, so a paper that is never verified cannot lock funds forever. block.timestamp must be at least start + disputeWindow. Pays the next milestone to the researcher.
5. Funds only ever leave to the researcher. There is no withdraw, refund or slash path.
6. Both pay paths update state before the transfer and use nonReentrant.
7. Deploy script reads DEPLOYER_PRIVATE_KEY, PUBLISHER address derived from PUBLISHER_PRIVATE_KEY, GUARDIAN_ADDRESS, DISPUTE_WINDOW_SECONDS and optional CRE_FORWARDER_ADDRESS from env, and writes contracts/deployments/{chainId}.json with both addresses.

## SQLite (node:sqlite, file at DATABASE_PATH)

```sql
CREATE TABLE papers (
  paper_hash TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL,
  title TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE paper_references (
  paper_hash TEXT NOT NULL REFERENCES papers(paper_hash),
  position INTEGER NOT NULL,
  raw TEXT NOT NULL,
  PRIMARY KEY (paper_hash, position)
);

CREATE TABLE reports (
  report_hash TEXT PRIMARY KEY,
  paper_hash TEXT NOT NULL REFERENCES papers(paper_hash),
  status TEXT NOT NULL CHECK (status IN ('Clean', 'Flagged')),
  report_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE publications (
  paper_hash TEXT PRIMARY KEY REFERENCES papers(paper_hash),
  status TEXT NOT NULL CHECK (status IN ('Unknown', 'Clean', 'Flagged')),
  report_hash TEXT NOT NULL,
  db_version TEXT NOT NULL,
  tx_hash TEXT,
  published_at TEXT NOT NULL
);
```

The verifier writes papers, paper_references and reports. Verifying an existing paperId replaces its paper_references. The watcher writes publications and reads the rest.

## Verifier HTTP API (Fastify, VERIFIER_PORT)

1. POST /verify. Body: VerifyRequest JSON; response: VerifyResponse.
2. POST /verify/pdf. Body: multipart form: paperId, optional title, file; response: VerifyResponse.
3. GET /papers. Body: none; response: TrackedPaper[].
4. GET /papers/:paperHash. Body: none; response: { paper: TrackedPaper, latest: VerifyResponse or null }.
5. GET /reports/:reportHash. Body: none; response: VerifyResponse.
6. GET /health. Body: none; response: { ok: true }.

Errors are ApiError JSON with status 400 for bad input, 404 for unknown hashes, 502 when Crossref or OpenAlex fails. Uploaded PDFs go to UPLOAD_DIR. CROSSREF_MAILTO is sent for the Crossref polite pool. A request with a non empty simulatedRetractions list is rejected with 400 unless DEMO_FEED_ENABLED is true on the verifier, so simulated data can never reach the chain outside the demo.

## Watcher (VERIFIER_URL, every RECHECK_INTERVAL_SECONDS)

Recheck of one paper:
1. Load the paper and its references from SQLite.
2. POST {VERIFIER_URL}/verify with paperId, references and the DOIs in the demo feed as simulatedRetractions.
3. Read getStatus(paperHash) from the oracle.
4. If the report status equals the status on chain: write the publication row only when none exists yet for the chain's reportHash (this is how CRE mode records its writes), then stop. No transaction is sent, so repeated runs are idempotent.
5. Otherwise publish. PUBLISH_MODE=direct sends setStatus from PUBLISHER_PRIVATE_KEY and writes the publication with its tx hash. PUBLISH_MODE=cre lists the change on GET /pending for the CRE workflow.

1. GET /status. Body: none; response: { paperHash, publication: Publication or null, pending: boolean }[].
2. POST /recheck/:paperHash. Body: none; response: { changed: boolean, publication: Publication or null }.
3. GET /pending. Body: none; response: { paperHash, status, reportHash, dbVersion }[].
4. POST /demo/retract. Body: DemoRetractRequest; response: DemoRetraction.
5. GET /demo/retractions. Body: none; response: DemoRetraction[].
6. DELETE /demo/retractions. Body: none; response: { cleared: number }.
7. GET /health. Body: none; response: { ok: true }.

The demo routes exist only when DEMO_FEED_ENABLED is true. Retractions live in memory and every one carries simulated: true.

## CRE workflow (cre/)

Cron trigger, HTTP GET {WATCHER_URL}/pending, then an EVM write of each change to IntegrityOracle.onReport through the CRE forwarder. Shown with the CRE CLI simulation for the Chainlink prize. Base Sepolia support, the forwarder address and the receiver interface are confirmed in Phase 2 before writing code. The demo does not depend on this path.

## Web (Next.js App Router)

1. /. Purpose: What Sluice does and current grants; data: escrow reads.
2. /grants. Purpose: All grants with paper status; data: escrow getGrant, oracle getStatus.
3. /grants/new. Purpose: Create a grant; data: createGrant through wagmi.
4. /grants/[grantId]. Purpose: Milestones, release, guardian resolve, freeze state; data: escrow, oracle, watcher /status.
5. /verify. Purpose: Submit references or a PDF, then trigger a recheck; data: verifier /verify, watcher /recheck.
6. /papers/[paperHash]. Purpose: Latest report, oracle record, publication tx; data: verifier /papers, oracle getStatus.
7. /demo. Purpose: Simulated retraction panel, labelled as simulation; data: watcher /demo routes.

/demo renders only when NEXT_PUBLIC_DEMO is true. Chain comes from NEXT_PUBLIC_CHAIN_ID, NEXT_PUBLIC_RPC_URL, NEXT_PUBLIC_EXPLORER_URL and NEXT_PUBLIC_NATIVE_SYMBOL through defineSluiceChain.

## Environment

All variables are listed with empty values in .env.example. For Base Sepolia: chain id 84532, explorer sepolia.basescan.org, native symbol ETH. Switching chain means changing env only.

1. CHAIN_ID, RPC_URL, EXPLORER_URL, NATIVE_SYMBOL. Used by: contracts, watcher, cre.
2. DEPLOYER_PRIVATE_KEY, GUARDIAN_ADDRESS, DISPUTE_WINDOW_SECONDS, CRE_FORWARDER_ADDRESS, ETHERSCAN_API_KEY. Used by: contracts.
3. PUBLISHER_PRIVATE_KEY. Used by: contracts (role grant), watcher.
4. ORACLE_ADDRESS. Used by: watcher, cre.
5. ESCROW_ADDRESS. Used by: contracts deploy output and operators filling NEXT_PUBLIC_ESCROW_ADDRESS. No service reads it.
6. DATABASE_PATH. Used by: verifier, watcher, data.
7. UPLOAD_DIR, CROSSREF_MAILTO, VERIFIER_PORT. Used by: verifier.
8. DEMO_FEED_ENABLED. Used by: verifier, watcher.
9. VERIFIER_URL, WATCHER_PORT, RECHECK_INTERVAL_SECONDS, PUBLISH_MODE. Used by: watcher.
10. WATCHER_URL. Used by: cre.
11. NEXT_PUBLIC_*. Used by: web.

## Open items

1. CRE: supported networks, forwarder address and receiver interface. Needed before Phase 2.
2. Arc prize eligibility waits for the mentor answer. If it goes ahead, only env changes.
3. Foundry is not installed on this machine yet (only foundryup is present). Needed before Phase 1 contracts work.
