# Readiness report

Can a judge or any developer try Cordon in their own npm project today? Every result below was run on 6 Nov 2026 from a fresh clone of main at commit 844410b (the code under test is unchanged since; later commits touched only the dashboard and ops/e2eLocal.sh), against a sample project in an empty folder. Nothing was published to npm. The detectors in the demo are simulated, and nothing here touched a testnet.

## 1. What exists today

Commands (packages/guard/src/cli.ts). Exit codes: allowed 0, blocked 1, unavailable 2. Every command prints a JSON report on stdout.

| Command | What it does |
| --- | --- |
| `cordon check --lockfile path` | Reads npm-shrinkwrap.json or package-lock.json (lockfileVersion 2 or 3), loads the Sealed list, checks every entry including transitive ones. Read only. |
| `cordon install --lockfile path` | Runs check; only if allowed, runs `npm ci --ignore-scripts` (plus `--allow-git=none` on npm 11.10.0 and later). |
| `cordon audit --path dir --cache dir --docker image.tar` | Looks for Sealed versions already present in lockfiles, npm caches and saved Docker images, and lists editor and agent hook files. |
| `cordon rollback --lockfile path` | Runs check and prints an npm overrides object that moves each blocked version to the highest earlier version that is not Sealed. Edits nothing. |
| `cordon sidecar --lockfile path --service name --port n` | Long running health endpoint for one service: 503 while the lockfile is blocked or unavailable. Needs POLL_INTERVAL_SECONDS. |
| `--allow-suspect name@version` | Option on check, install and rollback to let one Suspect version through. |

How a person gets it: there is no npm package. Today a person clones the repo with submodules, runs `pnpm install` with Node 22, and calls `node <clone>/packages/guard/bin/cordon.js` from their own project folder. Proven: the fresh clone in this run did exactly that against a project outside the repo. Node 20 does not work: `node bin/cordon.js` fails with ERR_UNKNOWN_FILE_EXTENSION, because the guard runs TypeScript directly with Node 22 type stripping.

Settings the guard reads (all from the environment):

| Variable | Public or secret | Needed for |
| --- | --- | --- |
| CHAIN_ID, RPC_URL, REGISTRY_ADDRESS, REGISTRY_START_BLOCK | public | reading SealRegistry on chain |
| GUARD_SNAPSHOT_URL, GUARD_SNAPSHOT_SIGNER, GUARD_SNAPSHOT_MAX_AGE_SECONDS | public | the signed snapshot fallback |
| GUARD_CACHE_DIR | local path | caching the last good snapshot and the record of seen seals |
| NPM_REGISTRY_URL | public | publish times for the age rules and rollback |
| GUARD_FALLBACK_MIN_AGE_DAYS, GUARD_MIN_AGE_DAYS, GUARD_ALLOW_NON_REGISTRY_SOURCES, GUARD_HTTP_TIMEOUT_MS | public | policy |
| GUARD_REPORT_URL | public | optional reports to our watcher |
| GUARD_REPORTER_PRIVATE_KEY | secret | only to sign optional reports |

The guard never needs a private key to check, install, audit or roll back. The only key it can use signs optional reports, and a judge should leave it unset.

## 2. Snapshot and registry

1. The guard works with a signed snapshot URL and nothing of ours running. Proven: a signed snapshot file served by `python3 -m http.server`, RPC_URL pointed at a dead port, no watcher, no dashboard: `cordon check` printed `listSource snapshot`, blocked ms@2.1.3 and exited 1.
2. With the RPC off it warns `chain unavailable` and moves to the snapshot. With the snapshot host also stopped it used the cached copy in GUARD_CACHE_DIR and still blocked (`snapshot fetch failed: fetch failed`, `listSource snapshot`, exit 1). With RPC_URL unset it goes straight to the snapshot.
3. One RPC URL. There is no list or failover between RPC providers.
4. What a judge needs from us: CHAIN_ID 84532, an RPC URL (the public https://sepolia.base.org works), REGISTRY_ADDRESS, REGISTRY_START_BLOCK, GUARD_SNAPSHOT_SIGNER 0x418C4E3d65ec49B97F82A490fD22565feCfee01e (a public address), and GUARD_SNAPSHOT_URL.
5. Snapshot freshness: the guard refuses a snapshot older than GUARD_SNAPSHOT_MAX_AGE_SECONDS (our setting is 3600). A snapshot file uploaded once to a static host goes stale after an hour; it needs either a job that republishes it or a longer limit for judges.
6. Our watcher serves /snapshot only on 127.0.0.1, so no public snapshot URL exists today.

## 3. First run experience

Sample project: package.json with ms 2.1.3 and debug 4.3.4; lockfile made with `npm install --package-lock-only --ignore-scripts`, which wrote no node_modules.

| Run | Result |
| --- | --- |
| `cordon check` with no settings at all | exit 1, blocked: no Sealed list, age fallback with the placeholder of 3 days, and with NPM_REGISTRY_URL unset no publish time can be read, so all 3 packages count as too young |
| same with NPM_REGISTRY_URL=https://registry.npmjs.org and GUARD_FALLBACK_MIN_AGE_DAYS=3 | exit 0, allowed |
| with a signed snapshot sealing ms 2.1.3, RPC off | exit 1, blocked ms@2.1.3, rollback proposes ms 2.1.2 |
| `cordon rollback` | printed `{"overrides":{"ms":"2.1.2"}}` |
| `cordon install` while blocked | exit 1, folder still holds only package.json and package-lock.json |
| `cordon install` while allowed | ran npm ci with scripts disabled and created node_modules, as designed |
| `cordon audit --path .` | exit 1, blocked ms@2.1.3, no hook files |

check, rollback and audit install nothing. install installs only when the outcome is allowed.

There is no ready sample project with a sealed version. The poisoned demo package @cordondemo/colorkit exists only in our local mock registry, and nothing is sealed on Base Sepolia yet.

## 4. Setup pieces

| Piece | Status | Evidence |
| --- | --- | --- |
| Copy paste quickstart for your own project | missing | README covers our local demo only |
| Config file generator | missing | no `cordon init`; settings come only from the environment |
| GitHub Actions step | missing | no workflow or example in the repo |
| Docker healthcheck | partly done | sidecar answers 503 when blocked (packages/guard/src/sidecar.ts, demo/services); no Dockerfile HEALTHCHECK example |
| package.json script | missing | no example script |
| rollback | done | `cordon rollback`, run above |
| audit | done | `cordon audit`, run above |
| uninstall | missing as a doc | nothing is installed globally; removing the clone and GUARD_CACHE_DIR is enough, but this is not written down |

## 5. Failures from a fresh folder

1. With no settings the first check blocks every package (section 3). Not written anywhere.
2. Node 20 cannot run the guard. The README says Node 22 for the repo but not for running the guard from another project.
3. The first fresh clone attempt failed on network errors to registry.npmjs.org and GitHub. A rerun passed. Not a code fault, but the install needs both reachable.
4. Running the guard from another folder needs the full path to bin/cordon.js; there is no `cordon` on PATH and this is not documented.
5. The snapshot format changed with the Cleared and Suspect work; a snapshot written by hand to the old shape was rejected as malformed. Judges never write snapshots, but our own docs show no example.
6. The guard blocks Suspect versions (one detector vote, no quorum) by default: `suspectBlocks` is always true in cli.ts and only `--allow-suspect` lets one through (packages/guard/src/check.ts line 86). That conflicts with the team's rule that a hard block happens only at Sealed.

## 6. Blocked on the team

1. Fund the deployer 0x5074bB98a467cad945794880F6Ed339388bDfE5F with about 0.05 Base Sepolia ETH, then approve running `bash ops/deployTestnet.sh`.
2. Decide where the signed snapshot is hosted for judges, and how it stays fresh (a republish job, or a longer max age).
3. Make the repo public before submission; run the history secret scan again first.
4. Decide the Suspect default (item 6 in section 5).
5. Set N in docs/decisions.md (the age fallback still uses the placeholder of 3).

Values that exist only after the testnet deploy: REGISTRY_ADDRESS, REGISTRY_START_BLOCK, and a sealed test version on chain. GUARD_SNAPSHOT_URL exists only after hosting is set up. GUARD_SNAPSHOT_SIGNER exists now.

## 7. Left to build, by value

| Item | Hours | Risk to frozen design and demo | If short on time |
| --- | --- | --- | --- |
| Quickstart doc with the copy paste block below | 1 | none | must do |
| Default NPM_REGISTRY_URL to the public registry when unset | 0.5 | low; changes first run outcome only | must do |
| Judge sample project with a lockfile entry for the sealed test version | 0.5 | none; needs the deploy first | must do |
| Hosted, refreshed signed snapshot | 2 | medium; new publishing path for the snapshot signer key | do if possible |
| Suspect default matches the team rule (warn, do not block) | 0.5 | low; one flag, tests change | team decides |
| GitHub Actions example | 0.5 | none | nice to have |
| Docker HEALTHCHECK and package.json script examples | 0.5 | none | nice to have |
| `cordon init` config generator | 2 | low | cut |
| Run on Node 20 through a compile step | 2 | medium; build step for the guard | cut |

## 8. Limits to state in the quickstart

1. Only npm lockfiles are protected: package-lock.json and npm-shrinkwrap.json with lockfileVersion 2 or 3. pnpm, yarn and bun lockfiles return unavailable.
2. One operator runs all three detectors and holds the guardian key today, so the quorum is not a quorum of independent parties.
3. This is a testnet prototype on Base Sepolia and is not for production use.
4. Hard stops are opt in: check, audit and rollback only report; install refuses to run npm only when you choose to use it; the sidecar stops a service only when you wire it into that service's health check.
5. The demo detectors are simulated, and the demo package is benign.

## 9. Draft copy paste block for judges

Values in angle brackets exist only after the testnet deploy and snapshot hosting.

```sh
git clone --recursive https://github.com/SahilKumar75/cordon.git
cd cordon
source ~/.nvm/nvm.sh && nvm use 22
corepack enable
pnpm install
cat > cordon.env <<'EOF'
CHAIN_ID=84532
RPC_URL=https://sepolia.base.org
REGISTRY_ADDRESS=<registry address after deploy>
REGISTRY_START_BLOCK=<deploy block>
GUARD_SNAPSHOT_URL=<public snapshot URL>
GUARD_SNAPSHOT_SIGNER=0x418C4E3d65ec49B97F82A490fD22565feCfee01e
GUARD_SNAPSHOT_MAX_AGE_SECONDS=3600
GUARD_CACHE_DIR=/tmp/cordonCache
NPM_REGISTRY_URL=https://registry.npmjs.org
GUARD_FALLBACK_MIN_AGE_DAYS=3
EOF
CORDON="$PWD/packages/guard/bin/cordon.js"
ENVFILE="$PWD/cordon.env"

cd /path/to/your/npm/project
set -a; . "$ENVFILE"; set +a
node "$CORDON" check
node "$CORDON" rollback
node "$CORDON" install
```

To see a block on the first run, use the sample project we will publish after the deploy: <sample project path>.
