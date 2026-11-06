# Incidents

Each entry lists its sources with an access date. Status is verified when the team or a primary source confirms it, unverified otherwise. Links and advisory ids keep their original spelling. Times are UTC.

## TanStack npm compromise, 11 May 2026

Status: verified (team confirmed, 5 Nov 2026). Rechecked against the postmortem text, OSV and npm registry metadata on 6 Nov 2026.

Sources:
1. TanStack postmortem (primary), published 11 May 2026, last updated 15 May 2026, accessed 6 Nov 2026: https://tanstack.com/blog/npm-supply-chain-compromise-postmortem
2. Endor Labs write up, published 11 May 2026, updated 13 May 2026, accessed 6 Nov 2026: https://www.endorlabs.com/learn/shai-hulud-compromises-the-tanstack-ecosystem-80-packages-compromised
3. GHSA-g7cv-rxg3-hmpx (alias CVE-2026-45321) as served by OSV, accessed 6 Nov 2026: https://api.osv.dev/v1/vulns/GHSA-g7cv-rxg3-hmpx
4. MAL-2026-3465 (alias GHSA-5q7g-gw3w-r3rh), covering @tanstack/react-router only, accessed 6 Nov 2026: https://api.osv.dev/v1/vulns/MAL-2026-3465
5. Tracking issue opened by StepSecurity, accessed 6 Nov 2026: https://github.com/TanStack/router/issues/7383
6. npm registry metadata, read without downloading any tarball, accessed 6 Nov 2026: https://registry.npmjs.org/@tanstack%2freact-router
7. Wiz analysis, published 12 May 2026, accessed 6 Nov 2026: https://www.wiz.io/blog/mini-shai-hulud-strikes-again-tanstack-more-npm-packages-compromised
8. MITRE ATT&CK entry S9043 (Mini Shai Hulud), created 29 Jul 2026, accessed 6 Nov 2026: https://attack.mitre.org/software/S9043/

What happened, per the postmortem text unless another source is named:
1. On 11 May 2026 an attacker published 84 malicious versions across 42 @tanstack packages, two versions per package, in two batches at 19:20:39 and 19:26:14. The postmortem gives the window as 19:20 to 19:26. OSV lists 84 affected entries under GHSA-g7cv-rxg3-hmpx, which matches. npm registry metadata still records the times of the removed versions, for example @tanstack/react-router 1.169.5 at 19:20:42.105 and 1.169.8 at 19:26:17.716.
2. The publishes authenticated through the OIDC trusted publisher binding for the TanStack/router release.yml workflow on main. The Publish Packages step of that workflow was skipped because tests failed; the attacker code posted to the registry directly with an OIDC token read from runner memory.
3. The releases carried valid npm provenance (Endor Labs states this directly; the postmortem describes the OIDC trusted publisher binding but does not use the word valid). The provenance was accurate about where the build ran, which is why it could not tell a hijacked build from a clean one. This is the basis for our rule that provenance is never an allow signal.
4. Install time execution. The malicious versions added an optionalDependencies entry @tanstack/setup pointing at a github: commit; installing it fetched that commit and ran its prepare lifecycle script, which ran a payload of about 2.3 MB (router_init.js). The payload harvested credentials, exfiltrated over the Session network, and republished other packages the victim maintains with the same injection.
5. Detection and response: StepSecurity opened issue #7383 at 19:46:46, about 26 minutes after the first publish. The first deprecations landed at about 20:19 (about 59 minutes), and all affected versions were deprecated by about 21:03 (1 hour 43 minutes). npm removed tarballs from 22:13:38 (@tanstack/query-core) to 23:55:26 (@tanstack/router-core). A formal IOC email went to npm and GitHub security at 05:02 on 12 May.
6. Advisory times as served by OSV: MAL-2026-3465 published 11 May 2026 at 23:44:35; GHSA-g7cv-rxg3-hmpx published 12 May 2026 at 00:12:49.
7. The initial StepSecurity scope was 14 packages and 28 versions; a scan of all 295 @tanstack packages found the full scope.
8. The postmortem recommends treating any host that installed an affected version on 11 May as compromised and rotating AWS, GCP, Kubernetes, Vault, GitHub, npm and SSH credentials reachable from it. It gives no download count and lists that as an open question.

Settled disagreements:
1. Entry point. Settled in favour of the postmortem: a pull_request_target workflow (bundle-size.yml) built fork code, poisoned the GitHub Actions cache that release.yml later restored, and the poisoned binaries read the OIDC token from runner memory. The postmortem says no npm tokens were stolen and none of the malicious publishes used a maintainer npm token. On a second reading, the Endor Labs write up does not claim a stolen npm token either: it says the run obtained a legitimate publish token derived from OIDC. What Endor Labs leaves out is the pull_request_target and cache poisoning steps; it describes the orphaned commit and the github: optionalDependency, which the postmortem places in the payload stage, not the entry stage. The two sources also name different attacker forks (zblgg/configuration in the postmortem timeline, voicproducoes/router in Endor Labs); both accounts appear in the postmortem.
2. Scale. For TanStack itself all sources agree: 42 packages, 84 versions (postmortem, Endor Labs body text, OSV). The wider campaign count does not agree: the Endor Labs title says 160+ package versions and its page header says 80+ packages; Wiz gives no total, and its tables list roughly 178 npm package names plus 2 PyPI packages (our count of the tables, approximate); secondary blogs say 170+ across npm and PyPI. We use only the TanStack numbers.

Claim recorded with limited support: that this was the first malicious npm release carrying provenance the attacker did not forge. Only one article we found makes that claim: CybelAngel blog post on the TanStack attack by Leah Koonthamattam, 13 May 2026, which calls it the first documented case of malicious npm packages shipping with valid provenance attestation, accessed 6 Nov 2026: https://cybelangel.com/blog/tanstack-npm-supply-chain-attack/ . Treat it as a single source claim and do not repeat it in the README or the pitch. Endor Labs also contradicts it: it says the SAP campaign about two weeks earlier (the 29 April 2026 wave) produced packages with valid provenance attestations too. Neither the postmortem nor Wiz claims a first.

Wiper, updated 6 Nov 2026. Earlier recorded as unverified from secondary write ups only. It now has vendor and MITRE sources but is still absent from the TanStack postmortem, so it stays unverified against the primary source. Wiz describes a gh-token-monitor daemon (macOS LaunchAgent at ~/Library/LaunchAgents/com.user.gh-token-monitor.plist, Linux systemd user unit at ~/.config/systemd/user/gh-token-monitor.service) that polls GitHub every 60 seconds and runs rm -rf ~/ when it sees a 40X error from token revocation, and exits after 24 hours without firing. Wiz tells readers to remove it before revoking GitHub tokens. MITRE S9043 records the same dead man switch, citing Flashpoint. Relevant to design rule 3 (worms can destroy files when interrupted).

IDE and coding agent persistence, per Endor Labs: .claude/settings.json hooks with copies at .claude/router_runtime.js and .claude/setup.mjs, and .vscode/tasks.json with runOn folderOpen plus .vscode/setup.mjs. These live in the project tree, so deleting node_modules does not remove them. Wiz also says files in .claude/ and .vscode/ persist after npm uninstall. MITRE S9043 records hooks in AI coding agent configuration as a persistence technique.

Team instruction, 6 Nov 2026, applied to the guard's advice: remove persistence daemons and IDE or coding agent hooks before revoking any tokens, then rotate credentials. This holds whether or not the wiper detail above is confirmed.

### Timeline check, 6 Nov 2026

Each TanStack timestamp above, with its source. Postmortem rows are excerpts from https://tanstack.com/blog/npm-supply-chain-compromise-postmortem , whose timeline says all times are UTC. All accessed 6 Nov 2026.

1. Window 19:20 to 19:26: verified. Postmortem summary: "between 19:20 and 19:26 UTC, an attacker published 84 malicious versions across 42 @tanstack/* npm packages".
2. First batch 19:20:39: verified. Postmortem 19:20:39 row: "npm registry receives publish for @tanstack/history@1.161.9 and 41 sibling packages". Registry metadata agrees: @tanstack/history 1.161.9 at 19:20:39.565 (https://registry.npmjs.org/@tanstack%2fhistory).
3. Second batch 19:26:14: verified. Postmortem 19:26:14 row names "(@tanstack/history@1.161.12 etc.)". Registry metadata: @tanstack/history 1.161.12 at 19:26:14.690.
4. @tanstack/react-router 1.169.5 at 19:20:42.105 and 1.169.8 at 19:26:17.716: verified from registry metadata (https://registry.npmjs.org/@tanstack%2freact-router).
5. Issue #7383 at 19:46:46: verified. The postmortem row reads 19:46 and says ashishkurmi "opens issue #7383"; the GitHub API gives created_at 19:46:46 (https://api.github.com/repos/TanStack/router/issues/7383).
6. About 26 minutes to detection: verified. Postmortem timing table: "Compromise publicly detected | ~26 min".
7. First deprecations at about 20:19, about 59 minutes: verified. Postmortem 20:19 row: "Tanner deprecates @tanstack/history@1.161.9 and @1.161.12". Timing table: "First versions deprecated (2 of 84) | ~59 min".
8. All deprecated by about 21:03, 1 hour 43 minutes: verified. Postmortem 21:03 row: "Final batch deprecation runs across the remaining versions". Timing table: "Full scope deprecated (84 of 84) | ~1h 43m".
9. Tarball removals 22:13:38 to 23:55:26: verified. Postmortem: "first removal at 22:13:38 (@tanstack/query-core), last at 23:55:26 (@tanstack/router-core)".
10. IOC email 05:02 on 12 May: verified. Postmortem 05:02 row: "Tanner emails security@npmjs.com and GitHub security with full IOC list".
11. MAL-2026-3465 published 23:44:35 and GHSA-g7cv-rxg3-hmpx published 00:12:49 on 12 May: verified from OSV (links in the source list above).
12. Counts 42 packages, 84 versions, 295 packages scanned, initial 14 packages: verified. Postmortem rows: "42 packages, 84 versions (two per package", "Comprehensive scan of all 295 @tanstack/* packages", and "(initially 14 of the 42)".


Use in Cordon: the timestamps above are the reference case for the replay timeline, built from OSV and npm registry data and labelled as a replay. See replay_candidates.md.

## Nx (s1ngularity), 26 to 27 Aug 2025

Status: verified (primary sources: maintainer advisory, OSV, npm registry metadata).

Sources:
1. GHSA-cxm3-wv7p-598c, maintainer advisory with a timeline in EDT, as served by OSV, accessed 6 Nov 2026: https://api.osv.dev/v1/vulns/GHSA-cxm3-wv7p-598c (GitHub copy: https://github.com/nrwl/nx/security/advisories/GHSA-cxm3-wv7p-598c)
2. MAL-2025-41443 for the nx package, accessed 6 Nov 2026: https://api.osv.dev/v1/vulns/MAL-2025-41443
3. Nx postmortem, published 5 Sep 2025, accessed 6 Nov 2026: https://nx.dev/blog/s1ngularity-postmortem
4. First public report, GitHub issue #32522, accessed 6 Nov 2026: https://github.com/nrwl/nx/issues/32522
5. npm registry metadata, accessed 6 Nov 2026: https://registry.npmjs.org/nx

Facts:
1. Packages and versions: nx 20.9.0, 20.10.0, 20.11.0, 20.12.0, 21.5.0, 21.6.0, 21.7.0, 21.8.0; @nx/devkit, @nx/js, @nx/workspace and @nx/node 20.9.0 and 21.5.0; @nx/eslint 21.5.0; @nx/key and @nx/enterprise-cloud 3.2.0 (OSV also lists @nx/key 5.0.7).
2. Publish: registry metadata gives nx 21.5.0 at 26 Aug 2025 22:32:25 and nx 20.12.0, the last, at 27 Aug 2025 00:37:44. The advisory timeline matches (6:32 PM to 8:37 PM EDT).
3. Public report: issue #32522 opened 27 Aug 2025 at 00:30:02 (8:30 PM EDT on 26 Aug). npm removed the versions at 10:44 PM EDT on 26 Aug (02:44 UTC on 27 Aug), per the advisory. OSV published GHSA-cxm3-wv7p-598c and the MAL ids at 27 Aug 2025 16:42:47.
4. Execution: install time. A postinstall script scanned the file system for credentials, posted them as an encoded string to a new s1ngularity-repository repo under the victim's GitHub account, and appended sudo shutdown -h 0 to .bashrc and .zshrc. The Nx postmortem says it tried to use local AI tools such as Claude and Gemini.
5. Entry: a GitHub Actions workflow injection let the attacker exfiltrate the npm publish token; this time a real npm token was stolen, unlike TanStack.
6. Editor angle: the Nx Console VS Code extension (18.6.30 to 18.65.1) installed nx@latest to check versions, so opening the editor while the bad version was tagged latest ran the postinstall.

## debug and chalk account takeover, 8 Sep 2025

Status: verified (primary sources: maintainer advisory, OSV, npm registry metadata, vendor report).

Sources:
1. GHSA-4x49-vf9v-38px, debug maintainer advisory, as served by OSV, accessed 6 Nov 2026: https://api.osv.dev/v1/vulns/GHSA-4x49-vf9v-38px
2. MAL-2025-46974 (debug) and MAL-2025-46969 (chalk), accessed 6 Nov 2026: https://api.osv.dev/v1/vulns/MAL-2025-46974 and https://api.osv.dev/v1/vulns/MAL-2025-46969
3. Aikido report, published 8 Sep 2025, accessed 6 Nov 2026: https://www.aikido.dev/blog/npm-debug-and-chalk-packages-compromised
4. debug issue #1005, accessed 6 Nov 2026: https://github.com/debug-js/debug/issues/1005
5. npm registry metadata, accessed 6 Nov 2026: https://registry.npmjs.org/debug and https://registry.npmjs.org/chalk

Facts:
1. A phishing email from a lookalike domain (npmjs.help, registered 5 Sep 2025 per Aikido) took over the maintainer account. Aikido lists 18 packages, about 2 billion weekly downloads combined, including debug 4.4.2 and chalk 5.6.1.
2. Publish: registry metadata gives debug 4.4.2 at 8 Sep 2025 13:12:39.973 and chalk 5.6.1 at 13:13:05.239.
3. Public report: Aikido's feed flagged the releases from 13:16, about 4 minutes after publish. debug issue #1005 opened at 13:35:26. OSV published MAL-2025-46974 at 14:26:51 and MAL-2025-46969 at 17:11:19. The GitHub reviewed advisory GHSA-4x49-vf9v-38px was published 15 Sep 2025.
4. Execution: runtime only, in the browser. No install script. The payload wrapped fetch, XMLHttpRequest and window.ethereum methods to swap wallet addresses in crypto transactions. The debug advisory says local, server and command line environments were not affected, but browser bundles built while the bad version was installed keep the payload until rebuilt.
5. Cleanup: npm removed the versions during 8 Sep. On 13 Sep the owner published new patch versions to bust stale copies in private registries and caches (debug 4.4.3 at 17:25:19 per registry metadata). This is a direct example of design rule 5: registry removal did not clean mirrors, caches or built bundles.

## ua-parser-js account takeover, 22 Oct 2021

Status: verified (primary sources: GitHub advisory via OSV, maintainer repo issue, CERT-EU, npm registry metadata).

Sources:
1. GHSA-pjwm-rvh2-c87w (alias CVE-2021-4229), as served by OSV, accessed 6 Nov 2026: https://api.osv.dev/v1/vulns/GHSA-pjwm-rvh2-c87w
2. Issue #536 in the maintainer repo, accessed 6 Nov 2026: https://github.com/faisalman/ua-parser-js/issues/536
3. CERT-EU Security Advisory 2021-057, 26 Oct 2021, accessed 6 Nov 2026: https://www.cert.europa.eu/publications/security-advisories/2021-057/
4. npm registry metadata, accessed 6 Nov 2026: https://registry.npmjs.org/ua-parser-js

Facts:
1. Versions 0.7.29, 0.8.0 and 1.0.0, published 22 Oct 2021 at 12:15:21, 12:16:06 and 12:16:19 per registry metadata. Clean versions 0.7.30, 0.8.1 and 1.0.1 followed between 16:16 and 16:26.
2. Public report: issue #536 opened 22 Oct 2021 at 13:46:48, about 1.5 hours after publish. GHSA-pjwm-rvh2-c87w was published at 20:38:14 the same day.
3. Execution: install time. CERT-EU says a preinstall.js script detected the operating system and launched a shell script or a batch file that fetched a Monero miner and, on Windows, a credential stealing DLL.
4. OSV holds no MAL id for this incident, only the GHSA. A detector that filters on MAL ids alone would miss it.
