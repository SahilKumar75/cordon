# Red team

Authorized adversarial review of Cordon, run on 6 Nov 2026 against the real code on a Node 22 runtime, local anvil chains on free ports, in memory SQLite, and mock HTTP servers bound to 127.0.0.1. No live demo stack was touched. No malicious tarball was downloaded or run. Every payload stand in is benign: it writes a constant to a temp folder and talks to nothing. Scripts and fixtures live in the session scratchpad under scratchpad/redteam. Each row names the driver script and quotes the observed line.

## Method

Drivers (all under scratchpad/redteam, run with `node --experimental-strip-types`):

1. t_lockfile.ts: guard `check` against reconstructed lockfiles, snapshot served locally.
2. t_npmforge.ts: guard `install` plus a real `npm ci` against a local registry serving a benign tarball, to see what lands in node_modules.
3. t_gitprepare.ts: guard `install` against a real local git dependency whose prepare script writes a canary file.
4. t_static.ts: the real `scanStatic` on crafted tarballs.
5. t_snapshot.ts: guard `check` against forged signed snapshots.
6. t_rpc.ts: guard `check` against a mock RPC that lies about the sealed list.
7. t_reports.ts: the real `acceptReport` against forged guard reports.
8. t_chain.ts: real `submitVerdict` calls on a local anvil SealRegistry.
9. t_tanstack.ts: the TanStack replay (section below).

## Attempt table

| # | Attack | How | Result | Evidence |
| --- | --- | --- | --- | --- |
| 1a | git+https with commit | lockfile entry resolved `git+https://...#sha` | failed (blocked) | t_lockfile: `nonRegistry=[payload@1.0.0:commit] outcome=blocked` |
| 1b | git+ssh no commit | `git+ssh://git@github.com/...` | failed (blocked) | t_lockfile: `kind git, blocked` |
| 1c | github: shorthand | `github:attacker/payload` | failed (blocked) | t_lockfile: `kind github, blocked` |
| 1d | github: commit | `github:attacker/payload#sha` | failed (blocked) | t_lockfile: `kind commit, blocked` |
| 1e | codeload tarball | `https://codeload.github.com/.../tar.gz/sha` | failed (blocked) | t_lockfile: `kind github, blocked` |
| 1f | tarball on another host | `https://evil.example/payload.tgz` | failed (blocked) | t_lockfile: `kind tarball, blocked` |
| 1g | file: tarball | `file:../payload.tgz` | failed (blocked) | t_lockfile: `kind file, blocked` |
| 1h | userinfo trick `registry.npmjs.org@evil` | authority confusion in a tarball URL | failed (blocked) | t_lockfile: classified `tarball`, origin is evil.example, blocked |
| 1i | gitlab https .git | `https://gitlab.com/.../payload.git` | failed (blocked) | t_lockfile: `kind tarball, blocked` |
| 1j | git source deep in a transitive path | github: commit four node_modules deep | failed (blocked) | t_lockfile: `nonRegistry=[@tanstack/setup@0.0.1:commit] blocked` |
| 1k | git source with GUARD_ALLOW_NON_REGISTRY_SOURCES=true | operator opt out | worked, as designed (warn only) | t_lockfile: `outcome=allowed` with the warning line; documented flag |
| 1l | file link entry outside the project | `link:true` to `../../outside` | failed (ignored, allowed) | t_lockfile: link entries are skipped by design; no code runs from a link in npm ci |
| 2a | child_process name assembled from strings | `require(['child','process'].join('_'))` plus `['execFile'+'Sync']` | failed (flagged) | t_static: `installScriptShell` still matches on the `execFile` substring |
| 2b | require through a variable module id | `const mod='ht'+'tps'; require(mod)` | worked (evaded) | t_static: `malicious=false findings=[]` |
| 2c | .node native addon via a JS loader | `require('./build/Release/addon.node')` inside the called file | worked (evaded) | t_static: `malicious=false findings=[payloadNonJavaScript]` (finding only, not malicious) |
| 2d | shell script via an assembled spawn call | `['spa'+'wnSync']('./scripts/setup.sh')` | worked (evaded) | t_static: `malicious=false findings=[payloadNonJavaScript]` |
| 2e | prepare delegates to a non lifecycle script | `prepare:"npm run build"`, payload in `build` | worked (evaded) | t_static: `malicious=false findings=[]` |
| 2f | payload one require deeper than the called file | run.js requires lib/helper.js | worked (evaded) | t_static: `malicious=false findings=[]` |
| 2g | binding.gyp build with no lifecycle script | node_gyp rebuild runs the gyp action | worked (evaded) | t_static: `malicious=false findings=[]` |
| 2h | hook names outside the scanned set | `preprepare`, `dependencies` scripts | worked (evaded) | t_static: `malicious=false findings=[]` |
| 2i | control: literal require('https') in postinstall | baseline | failed (flagged) | t_static: `malicious=true findings=[installScriptNetwork]` |
| 3a | alias folder innocent, name field is the sealed package | honest alias direction | failed (blocked) | t_lockfile: `blocked=[@tanstack/react-router@1.169.5]` |
| 3b | name field forged to a clean package, resolved serves the sealed tarball | lockfile keys on the declared name | worked (bypass) | t_npmforge: guard `allowed`, yet `node_modules/rtsealed/package.json` holds the real rtsealed@1.0.0 |
| 3c | case change in the name field | `RTsealed` vs sealed `rtsealed` | worked (bypass) | t_npmforge: guard `allowed`, real package installed |
| 3e | build metadata on the sealed version | lockfile version `1.0.0+cordon`, resolved serves `1.0.0` | worked (bypass) | t_npmforge: guard `allowed`, `node_modules/rtsealed` version 1.0.0 installed |
| 3d | other scope, same package name | `@tanstack-mirror/react-router` | n/a (different package, correctly not sealed) | t_lockfile: `allowed`; a different name is a different package by design |
| 3f | leading zero version `1.169.05` | non canonical version string | failed to be a bypass (also fails to resolve the sealed version) | t_lockfile: `allowed`; npm would not resolve this to 1.169.5 |
| 4a | snapshot older than GUARD_SNAPSHOT_MAX_AGE_SECONDS | stale generatedAt | failed (rejected) | t_snapshot: `rejected: snapshot is older than GUARD_SNAPSHOT_MAX_AGE_SECONDS`, fell to fallback |
| 4b | snapshot dated in the future | future generatedAt | failed (rejected) | t_snapshot: `rejected: snapshot generatedAt is in the future` |
| 4c | snapshot signed by the wrong key | foreign signer | failed (rejected) | t_snapshot: `rejected: snapshot signer is not GUARD_SNAPSHOT_SIGNER` |
| 4d | snapshot for another chain | chainId 1 | failed (rejected) | t_snapshot: `rejected: snapshot chainId 1 does not match CHAIN_ID` |
| 4e | snapshot for another registry | foreign registry address | failed (rejected) | t_snapshot: `rejected: snapshot registry does not match REGISTRY_ADDRESS` |
| 4f | valid old sealed snapshot replayed after an unseal | serve the pre unseal snapshot again | failed (re blocks) | t_snapshot: `4f-4 ... blocked=[@tanstack/react-router@1.169.5]`; replay cannot unblock, it only re seals |
| 5a | RPC returns an empty list, no prior cache record | first read, no knownSealed.json | worked (bypass) | t_rpc: `5a ... outcome=allowed listSource=chain` |
| 5b | RPC returns an empty list, with a prior cache record | monotonic cache present | failed (rejected) | t_rpc: `chain list rejected: it drops 1 previously sealed version`, stays blocked |
| 5c | RPC reports the wrong chain id | chainId mismatch | failed (rejected) | t_rpc: `chain unavailable: RPC reports chain 1, expected 31337` |
| 5d | RPC marks a key Unsealed with no Unsealed event | status 2, empty eth_getLogs | failed (rejected) | t_rpc: `chain list rejected ... no matching Unsealed event`, stays blocked |
| 5e | RPC marks a key Unsealed and serves a forged Unsealed log | status 2, a correctly encoded eth_getLogs entry keyed to the version | worked (bypass) | t_rpc: `5e ... outcome=allowed listSource=chain blocked=[]` |
| 6a | unsigned guard report | empty signature | failed (refused) | server rejects on schema before acceptReport; t_reports direct call also refuses |
| 6b | report signed by an unknown key | signer not in GUARD_REPORTER_ADDRESSES | failed (refused 401) | t_reports: `signer is not an allowed guard reporter` |
| 6c | valid report replayed verbatim | same digest twice | failed (refused) | t_reports: second attempt `report was already received` |
| 6d | report dated in the future | checkedAt +1h | failed (refused 401) | t_reports: `checkedAt is outside the accepted window` |
| 6e | tampered body with the original signature | swap service and blocked, keep signature | failed (refused 401) | t_reports: `signature does not match the report` |
| 6f | non detector submits a verdict on chain | stranger key calls submitVerdict | failed (revert) | t_chain: `REVERT`, `sealed ... false` |
| 6g/6h | detector vote replayed while live | same detector votes twice | failed (revert) | t_chain: `6h ... REVERT` (DuplicateVote) |
| 6i | stale vote after the vote lifetime cannot combine | advance EVM time past voteLifetime, second detector votes | failed (no seal) | t_chain: `6i ... sealed ... false`; only after a refresh does `6j ... sealed ... true` |

## What worked

Confirmed install bypasses, in order of severity:

1. Forged RPC unseal (5e). A malicious or compromised RPC that both marks a key Unsealed in `sealedKeys` and returns a correctly encoded `Unsealed` log for that key defeats the monotonic cache and the guard installs a version it had already recorded as Sealed. The guard trusts the same RPC for the event that is supposed to justify dropping the key, and `hasUnsealEvent` only checks that at least one log came back; it never checks that the log's guardian holds GUARDIAN_ROLE or that the event is real.
2. Lockfile identity forgery (3b, 3c, 3e). The seal key is computed from the name and version the lockfile declares, but `npm ci` fetches the tarball at `resolved`. Changing the declared name, its letter case, or appending build metadata to the version makes the guard key a different, unsealed identity while npm installs the genuine sealed tarball. A one character edit to a lockfile version string is enough, and the source is still a registry URL so the non registry rule never fires.
3. Empty list on first read (5a). With no knownSealed.json for this chain and registry yet, an RPC that returns an empty list produces `allowed`. This is the documented monotonic trust gap, confirmed against the code.

Detector evasion (2b to 2h) all slip past staticScripts, so a crafted install loader produces no scan time malicious verdict from that detector. This weakens defence in depth but is not by itself an install bypass, because the non registry rule and advisoryFeed are separate paths.

## What held

Every non registry lockfile source (1a to 1j, including the userinfo authority trick 1h) blocks. Snapshot forgery of every kind (4a to 4e) is rejected and the guard fails closed to the age fallback. A replayed old snapshot cannot unblock an unsealed version (4f). The watcher refuses unsigned, unknown signer, replayed, future dated, and tampered reports (6a to 6e). On chain, a non detector cannot vote, a live duplicate reverts, and a stale vote cannot reach quorum (6f to 6j). The honest alias direction (3a) blocks correctly.

## TanStack replay

Incident MAL-2026-3465, @tanstack/react-router 1.169.5 and 1.169.8, 11 May 2026. All times UTC, from the recorded fixtures and docs/research/incidents.md. The payload arrived through an optionalDependencies entry pointing at a github: commit whose prepare script ran on install.

Reference times:

1. 19:20:42.105 publish of 1.169.5; 19:26:17.716 publish of 1.169.8 (npm registry metadata).
2. 19:46:46 StepSecurity opens the tracking issue (about 26 minutes).
3. about 20:19 first deprecations; about 21:03 all 84 versions deprecated.
4. 22:13:38 to 23:55:26 npm removes tarballs.
5. 23:44:35 OSV publishes MAL-2026-3465.

What Cordon as built would have done, proven with t_tanstack.ts:

1. Install time non registry block, no seal and no detector needed. The moment a lockfile that resolves @tanstack/setup from a github: commit is checked, the guard blocks. t_tanstack: `B1 ... outcome=blocked nonRegistry=[@tanstack/setup@0.0.0:commit]`. This is the earliest protection and does not depend on the chain, the detectors, or any seal. It fires as soon as the poisoned version is resolved into a lockfile, so in principle from 19:20:42 onward for any developer or CI run using the guard.
2. A lockfile that pins only the registry version with no github transitive entry and no seal is allowed in the age fallback, because the version is months old. t_tanstack: `A1 ... outcome=allowed listSource=none`. So without a seal the pure registry pin of the removed version is not blocked by age; the seal or the github path is what stops it.
3. Scan time staticScripts verdict. On a benign reconstruction of the manifest shape (prepare script plus a github: optionalDependency), staticScripts returns malicious via the gitDependency rule. t_tanstack: `staticScripts malicious=true findings=[gitDependency]`. In production this vote could be cast shortly after publish, assuming the watcher follows the real npm changes feed.
4. advisoryFeed verdict cannot exist before OSV published MAL-2026-3465 at 23:44:35, because the detector queries OSV for the exact name and version.
5. Quorum is 2. sandboxCanary does not run on a public registry tarball, so it casts no vote here. The two available votes are staticScripts (scan time) and advisoryFeed (not before 23:44:35). So the earliest a seal could land is 23:44:35, about 4 hours 24 minutes after the first publish, and only if the watcher had already scanned and staticScripts had already voted.
6. With a seal in place, the guard blocks the registry version directly. t_tanstack: `C1 ... outcome=blocked blocked=[@tanstack/react-router@1.169.5] listSource=snapshot`.

Assumptions, stated plainly:

1. The production watcher follows the real npm changes feed. The demo does not; it uses demo/mockRegistry, so the demo cannot reproduce step 3 timing against the real publish time.
2. staticScripts only votes if the watcher scanned the version; the scan time in production is unknown, so step 3 is an upper bound on how early the seal path could start.
3. advisoryFeed depends on OSV availability and timing; 23:44:35 is the earliest its vote could exist.
4. No malicious tarball was fetched; step 3 uses a benign reconstruction of the manifest shape, and the gitDependency rule fires on the manifest fields alone.

Net: Cordon's seal path would have produced a block no earlier than 23:44:35, after human deprecation (about 20:19) but inside the tarball removal window. The install time non registry block is the only Cordon mechanism that protects from the moment of publish, and it is the one that matches this incident's actual delivery vector.

## Prioritised fixes

Most severe first. Cordon owns every file named.

1. Stop trusting the RPC for the unseal event (fixes 5e). packages/guard/src/sealedList.ts, `hasUnsealEvent`. Do not accept a dropped seal just because `eth_getLogs` returned something. At minimum, decode the `Unsealed` event and confirm the emitting guardian holds GUARDIAN_ROLE (a second read the same RPC can still lie about, so prefer the next clause), and require the signed snapshot to corroborate the unseal before the guard drops a recorded key. Treat a chain and snapshot disagreement as keep blocked.
2. Key the seal check on the resolved tarball identity, not the lockfile's self declared name and version (fixes 3b, 3c, 3e). packages/guard/src/lockfile.ts and packages/guard/src/check.ts. Parse the name and version out of the `resolved` registry path and cross check them against the declared name and version; on any mismatch, block or mark unavailable. Normalise the version by stripping build metadata before building the seal key, and lower case the name, so `1.0.0+x` and `RTsealed` cannot dodge an exact string key.
3. Give the guard a baseline on first read (reduces 5a). packages/guard/src/sealedList.ts. Before trusting an empty chain list on a cold cache, seed knownSealed from the signed snapshot, so an RPC that hides every seal on the first run is caught by the same monotonic check that already catches later drops. Alternatively require the chain and the snapshot to agree on a first read.
4. Harden staticScripts against the evasions (2b to 2h). services/detectors/src/staticScripts.ts. Follow require chains from install scripts rather than scanning only the directly named file; treat a lifecycle script that shells to another package script (`npm run x`, `node x`) as reaching that script; flag an install script that loads a .node addon or a shell file as malicious, not finding only, when an install hook reaches it; and widen the hook set to the names npm actually runs. Keep false seal risk in mind: pair any new malicious rule with the existing quorum and dispute window.
