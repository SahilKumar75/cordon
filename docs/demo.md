# Demo

The script for a three minute video: terminal first, then the dashboard, then the limits said plainly. Everything runs on this machine; no testnet funds and no keys of yours are needed.

## Before recording

1. Terminal: from the repo root, Node 22 active, Docker running, nothing listening on ports 3000, 4101 to 4103, 4201 to 4203, 4873, 4880 or 8546.
2. Run `bash ops/terminalDemo.sh` once as a dry run. It takes a few minutes, prints a pass line per scene and cleans up after itself.
3. For the dashboard part, start `bash ops/e2eLocal.sh --hold` in a second terminal and open http://127.0.0.1:3000.
4. If the Base Sepolia deployment exists by recording time, keep the explorer page for SealRegistry open in a browser tab (address in the README, Deployment).

## Spoken script, twelve lines

| # | On screen | Say |
| --- | --- | --- |
| 1 | Terminal, `bash ops/terminalDemo.sh` starts | In May 2026 malicious TanStack versions carried valid provenance and ran a payload on install. Cordon tries to block a version like that before it runs. |
| 2 | Publish and votes scroll by | We publish our own demo package, colorkit 1.4.1. Its install script only touches a canary value on this machine. |
| 3 | `pass: staticScripts and sandboxCanary voted, key Sealed` | Two of three detectors vote, and the registry contract seals exactly version 1.4.1. These detectors are run by us, so they are simulated operators. |
| 4 | Stopwatch lines | The stopwatch shows publish, first verdict, quorum and first block, measured in this run. |
| 5 | `cordon install` exits 1 | The guard reads the lockfile before npm runs. Blocked, exit 1, and npm never starts. |
| 6 | `cordon check`, `cordon rollback` | Check blocks it from the chain, and rollback proposes 1.4.0 without editing any file. |
| 7 | `cordon audit` | Audit finds the sealed version already installed, so the advice is to remove persistence and hooks first, then rotate credentials. |
| 8 | RPC off, then watcher off | With the RPC off, the guard blocks from the signed snapshot. With our watcher off too, it blocks from its cached copy. |
| 9 | Dashboard home and stopwatch | The dashboard shows the same run: votes, evidence hashes and the stopwatch. |
| 10 | Dashboard, the vault | The vault lists every sealed version, read straight from the contract. |
| 11 | Dashboard, a seal page with evidence | Each vote carries an evidence hash, and the evidence body is checked against it. |
| 12 | Terminal or README limits | Limits: npm lockfile v2 and v3 only, one operator holds every key today, the guardian is a single key, and this is a testnet prototype. |

## Recording checklist

1. Real time, no speed up and no cuts inside a scene.
2. Your own voice, no music.
3. At least 720p, recorded on a computer screen.
4. Length between two and four minutes, and under three minutes in practice: the EF Best CROPS App prize asks for a video of three minutes at most.
5. Say simulated wherever the detectors appear, and do not say deployed unless the Base Sepolia deployment exists and is on screen.
6. Upload the video to ETHGlobal.com with the project submission.

## Reset between takes

Both scripts clean up on exit. If a run was killed, run `sh demo/stop.sh` and `sh demo/reset.sh`, and remove demo/demo.env before the next take.
