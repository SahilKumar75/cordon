# Demo

The recorded demo script, the scene that shows censorship resistance, the historical replay, a recording checklist, and the commands to prepare and reset between takes. Contract address, explorer links and funded keys: see Deployment in [README.md](../README.md#deployment).

## Screen layout

1. Browser: the dashboard at http://localhost:3000, with the Base Sepolia explorer in a second tab.
2. Terminal A: the guard commands below, run from the repo root with the root .env loaded.
3. Terminal B: the watcher, visible so the viewer can see it stop. Terminal C: the detectors.

Shorthand used below: `cordon` means `node packages/guard/bin/cordon.js`, and `LOCK` means `demo/services/ordersApi/package-lock.json`.

## Script, under three minutes

| Time | Beat | On screen | Say |
| --- | --- | --- | --- |
| 0:00 | Problem | Dashboard home | On 11 May 2026 an attacker published 84 malicious versions of 42 TanStack packages. They carried valid npm provenance, and installing them ran a payload that stole credentials. Cordon stops a version like that before it runs. |
| 0:15 | Publish | /demo, click publish for @cordondemo/colorkit 1.4.1 | This is our own demo package. Its install script sends a fake canary token to a sink on this machine, nothing else. |
| 0:30 | Detectors vote | Attestation feed: staticScripts, sandboxCanary, advisoryFeed, each tagged simulated | Three detectors that fail in different ways: one reads the install script, one installs it in a throwaway container and watches the canary, one checks public advisories. In this demo all three are run by us, so they are labelled simulated. |
| 0:55 | Sealed | /sealed, then the explorer tab on the Sealed event | Two of three agreed, so SealRegistry on Base Sepolia sealed exactly version 1.4.1. Anyone can check the votes and evidence hashes on the explorer. |
| 1:10 | Stopwatch | Home: publish, first verdict, quorum, first block, with the gap between each | From publish to first verdict to quorum to first block. Read the gaps as they appear on screen; quote no number in advance. |
| 1:25 | Install blocked | Terminal A: `cordon install --lockfile LOCK` | The guard reads the lockfile and the Sealed list before npm runs. Outcome blocked, exit code 1, and npm ci never starts, so nothing is downloaded. |
| 1:40 | Services stopped | `curl -s localhost:4101`, `curl -s localhost:4103`, `curl -s localhost:4102`; dashboard /services | ordersApi and notifyWorker answer 503 with `Stopped by the guard: @cordondemo/colorkit@1.4.1 is sealed`. searchApi is on 1.4.0 and keeps serving, because seals are per version. |
| 1:55 | Rollback | `cordon rollback --lockfile LOCK` | It proposes 1.4.0 as an npm overrides snippet. It never edits files. |
| 2:05 | Rotation advice | The advice lines in the install report | 1.4.1 is already installed in this service, so the advice comes in order: remove persistence daemons and editor or coding agent hooks first, then rotate credentials. A runtime stop cannot undo theft at install time. |
| 2:15 | Censorship resistance | See the next section | |
| 2:40 | Replay | /demo, Historical replay panel, MAL-2026-3465 | See the replay section. |
| 2:55 | Close | Dashboard home | Cordon: seal one version, block it everywhere before it runs. |

## Censorship resistance scene (2:15 to 2:40)

The point: the guard keeps blocking Sealed versions with our watcher and the chain RPC both unreachable, from a signed snapshot it cached.

1. Switch off the RPC for the guard by pointing it at a dead port:

   ```sh
   RPC_URL=http://127.0.0.1:9 cordon check --lockfile LOCK
   ```

   On screen: a warning that the chain is unavailable, then a report with `"listSource": "snapshot"`, `"outcome": "blocked"` and @cordondemo/colorkit 1.4.1 under blocked. Exit code 1. This run fetched the signed snapshot from the watcher and cached it in GUARD_CACHE_DIR.

2. Stop the watcher: press Ctrl+C in terminal B so the viewer sees it exit. Run the same command again.

   On screen: the chain warning, a warning that the snapshot fetch failed, and still `"listSource": "snapshot"`, `"outcome": "blocked"`, with `snapshotAgeSeconds` showing how old the cached snapshot is. Exit code 1.

Say: the RPC is gone and our own server is gone, and the guard still blocks, because the Sealed list it cached is signed and it checks the signer, chain, registry and age itself. If the snapshot grows older than GUARD_SNAPSHOT_MAX_AGE_SECONDS, the guard falls back to blocking versions younger than N days, and says so.

Do not show the cached snapshot being accepted when it is older than GUARD_SNAPSHOT_MAX_AGE_SECONDS; it would be refused, and that refusal is correct.

## Historical replay (2:40 to 2:55)

On /demo, open the Historical replay panel and run it for MAL-2026-3465 (@tanstack/react-router). The panel is tagged Replay and sits apart from the live stopwatch. Say "replay" out loud; never call it a seal. It is a timeline only, built from public data, and it never writes to any chain.

What the viewer should see, all from [docs/research/replay_candidates.md](research/replay_candidates.md#1-mal-2026-3465-tanstackreact-router-recommended), times in UTC on 11 May 2026:

1. 19:20:42.105, @tanstack/react-router 1.169.5 published (npm registry metadata).
2. 19:26:17.716, 1.169.8 published (npm registry metadata).
3. 23:44:35, OSV publishes MAL-2026-3465.

Say: from the first publish to the MAL record took about 4 hours 24 minutes. Do not claim what Cordon would have done in that window; this replay shows the public timeline only.

## Recording checklist

1. Human voice. No AI voiceover.
2. Length two to four minutes; aim under three.
3. At least 720p.
4. Screen recorded on a computer, not filmed with a phone.
5. No sped up footage.
6. No music with captions in place of speech.
7. Intro under 20 seconds.
8. Every detector, verdict and the canary exfiltration visibly labelled simulated; the replay visibly labelled Replay.
9. Terminal font large enough to read the outcome and exit code at 720p.
10. No private keys, .env contents or seed phrases on screen.

## Prepare

Once per machine:

```sh
source ~/.nvm/nvm.sh && nvm use 22
pnpm install
sh demo/setup.sh
```

Before each take:

1. Check the root .env against Deployment in the README: CHAIN_ID, RPC_URL, REGISTRY_ADDRESS, detector and snapshot signer keys, GUARD_SNAPSHOT_URL, GUARD_SNAPSHOT_SIGNER, GUARD_SNAPSHOT_MAX_AGE_SECONDS and GUARD_CACHE_DIR must be set. GUARD_SNAPSHOT_MAX_AGE_SECONDS must be longer than the take.
2. Start the stack, each long running command in its own terminal:

   ```sh
   sh demo/start.sh
   set -a; . ./.env; set +a
   pnpm --filter @cordon/watcher start
   pnpm --filter @cordon/detectors start
   pnpm --filter @cordon/dashboard dev
   ```

3. Open the dashboard and confirm the stopwatch is empty and all three services show healthy.

## Reset between takes

```sh
sh demo/reset.sh
rm -rf "$GUARD_CACHE_DIR"
```

Then stop the watcher, detectors and dashboard, and start again from step 2 of Prepare.

demo/reset.sh stops the demo stack and clears the mock registry storage, the canary sink data, the logs, the watcher database and the snapshot file. It does not touch the chain. A seal on Base Sepolia is permanent for that version's key, and only the guardian can unseal it after the dispute window, which does not make it sealable again by detectors. So rehearse against a local anvil deployment, and for each recorded take on Base Sepolia after the first, use a fresh SealRegistry deployment with its address set in .env: see Deployment in README.
