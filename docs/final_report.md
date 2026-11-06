# Final sprint report, 7 Nov 2026

What was done in the last sprint before the 09:00 IST deadline, what was skipped, and why. Times are IST.

## Done

1. Guard: NPM_REGISTRY_URL defaults to https://registry.npmjs.org when unset, with a test. The seal key now uses the name and version from each lockfile entry's resolved tarball URL, which closes red team items 3b, 3c and 3e without a contract change. Entries without a resolved URL still use the declared name and version.
2. Dashboard read only mode: with NEXT_PUBLIC_WATCHER_URL unset, the build reads SealRegistry through the configured RPC, hides the demo controls, and tells the viewer that watcher, detector and stopwatch panels need a local run. Verified with a production build against a local chain on 7 Nov 03:20: quorum and the vault count were read from the contract. No trackers or analytics are in the client.
3. Docs: related_work.md, trust_model.md, submission_text.md, a twelve line video script in demo.md, refreshed coverage matrix, code tour, sponsor fit and open decisions, and a Try it section in the README.
4. ops/terminalDemo.sh: one command, no secrets, 16 of 16 scenes passed on 7 Nov around 03:25, including check, rollback, install refusing, audit, RPC off and watcher off.
5. ops/creDemo.sh: both CRE dry run simulations ran on 7 Nov 03:29; the TanStack version came back malicious with MAL-2026-3465 and ms 2.1.3 came back clean. Nothing was broadcast.

## Testnet and Arkiv

1. The team funded the deployer with 0.05 Base Sepolia ETH at about 04:10. SealRegistry 0x07DCC100d48fBA912fEf3e14F61d1162596a0E8F was deployed at block 55415999 and verified on Sourcify; @cordondemo/colorkit 1.4.1 was sealed by two team detector keys; the guard blocked it against the public RPC and again with the RPC off. Details in docs/testnet_proof.md.
2. Arkiv: the writer wallet 0xDe760446b5a7fFf40f17625f77d4165BaA013Fc9 still held 0 tGLM at 04:20, so no entity was written. Arkiv is marked planned in the README and removed from the prize list.

## Free hosting for the read only dashboard (team does these steps)

Untested on the host itself. The same production build, with the values below, was served locally on 7 Nov about 04:25 and read one sealed version from the Base Sepolia registry through https://sepolia.base.org; the seal time and vote count show as unknown in this mode because they come from the watcher.

1. Sign in at https://vercel.com with the GitHub account that owns SahilKumar75/cordon, and allow Vercel to read that repository.
2. Add New, Project, import SahilKumar75/cordon.
3. Root Directory: apps/dashboard. Keep "Include files outside the root directory" on, because the dashboard imports packages/shared.
4. Framework preset: Next.js. Leave the build and install commands at their defaults; Vercel uses pnpm because the repo has pnpm-lock.yaml.
5. Project Settings, Node.js Version: 22.x.
6. Environment variables, all public values, no keys:

| Name | Value |
| --- | --- |
| NEXT_PUBLIC_CHAIN_ID | 84532 |
| NEXT_PUBLIC_RPC_URL | https://sepolia.base.org |
| NEXT_PUBLIC_EXPLORER_URL | https://sepolia.basescan.org |
| NEXT_PUBLIC_NATIVE_SYMBOL | ETH |
| NEXT_PUBLIC_REGISTRY_ADDRESS | 0x07DCC100d48fBA912fEf3e14F61d1162596a0E8F |

7. Do not set NEXT_PUBLIC_WATCHER_URL, NEXT_PUBLIC_DETECTORS_URL, NEXT_PUBLIC_DEMO, NEXT_PUBLIC_MOCK_REGISTRY_URL or NEXT_PUBLIC_ARKIV_ACCESS_KEY. Leaving the first one unset is what turns on read only mode.
8. Deploy, then open /sealed and check that the address shown matches the README.

Paste the resulting URL into the live demo field of the form.

## Known gaps left open

1. packages/guard/src/check.ts still calls N = 3 a placeholder in its warning until docs/decisions.md records the team's answer at Gate B.
2. cre/cordonAdvisory/config.staging.json has the zero address as the receiver, which is fine for a dry run and must change before any broadcast.
3. apps/dashboard/lib/arkiv.ts checks the evidence hash of an Arkiv entity but not that its owner is our writer wallet.
4. docs/red_team.md has not been rerun against the lockfile identity fix; the new unit test covers the three cases.
