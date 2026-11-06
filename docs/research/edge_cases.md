# Edge cases

Cases that change how Bulkhead must behave. All sources accessed 6 Nov 2026. Source code references are to GitHub repos read through the GitHub API; nothing was installed or run.

## 1. Provenance passes on a hijacked build

1. TanStack, 11 May 2026: malicious versions were published through the project's own OIDC trusted publisher binding for release.yml on main, so provenance correctly named the real repo and workflow. Postmortem: https://tanstack.com/blog/npm-supply-chain-compromise-postmortem . Endor Labs states the packages still carry valid npm provenance: https://www.endorlabs.com/learn/shai-hulud-compromises-the-tanstack-ecosystem-80-packages-compromised
2. Endor Labs says the SAP campaign about two weeks earlier produced packages with valid provenance as well, so TanStack was likely not the first case.
3. npm's own documentation: "When a package in the npm registry has established provenance, it does not guarantee the package has no malicious code." https://docs.npmjs.com/generating-provenance-statements
4. Design effect: matches design rule 2. Provenance is never an allow signal and never lowers a detector score.

## 2. Payloads that damage files when interrupted or when tokens are revoked

1. TanStack wave (Mini Shai Hulud): Wiz describes a gh-token-monitor daemon that polls GitHub every 60 seconds and wipes the home directory when it sees a 40X error from token revocation, then exits after 24 hours. Wiz says to remove it before revoking GitHub tokens. https://www.wiz.io/blog/mini-shai-hulud-strikes-again-tanstack-more-npm-packages-compromised . MITRE S9043 records the same: https://attack.mitre.org/software/S9043/ . Not in the TanStack postmortem, so unverified against the primary source.
2. Shai Hulud 2.0, Nov 2025: MITRE S9008 records that it destroyed the home directory by overwriting and deleting every writable file, citing Unit 42 and Socket: https://attack.mitre.org/software/S9008/ . Koi reports the trigger as failure to authenticate or persist: https://www.koi.ai/incident/live-updates-sha1-hulud-the-second-coming-hundred-npm-packages-compromised . The Wiz Shai Hulud 2.0 post (https://www.wiz.io/blog/shai-hulud-2-0-ongoing-supply-chain-attack) did not describe the wiper when read, so the trigger condition is unverified.
3. Nx, Aug 2025: the postinstall appended sudo shutdown -h 0 to .bashrc and .zshrc (GHSA-cxm3-wv7p-598c, https://api.osv.dev/v1/vulns/GHSA-cxm3-wv7p-598c).
4. Design effect: matches design rules 3 and 9. Sandboxes are disposable. Guard advice orders persistence removal before token revocation.

## 3. IDE and coding agent hooks used for persistence

1. TanStack wave, per Endor Labs: .claude/settings.json hooks with .claude/router_runtime.js and .claude/setup.mjs, and .vscode/tasks.json with runOn folderOpen plus .vscode/setup.mjs. These sit in the project tree, so deleting node_modules leaves them. MITRE S9043 lists hooks in AI coding agent configuration as persistence.
2. Claude Code hooks are shell commands that run automatically; project hooks live in .claude/settings.json, which can be committed, and a SessionStart event exists. https://code.claude.com/docs/en/hooks
3. VS Code runs a task with runOn folderOpen when the folder opens, but only if task.allowAutomaticTasks allows it (default off, with a one time prompt) and never in an untrusted workspace. https://code.visualstudio.com/docs/debugtest/tasks
4. Nx, Aug 2025: the Nx Console VS Code extension (18.6.30 to 18.65.1) installed nx@latest on editor start, which ran the malicious postinstall without any user install. The Nx postmortem says the payload tried to use local AI tools such as Claude and Gemini. https://nx.dev/blog/s1ngularity-postmortem
5. Design effect: bulkhead audit should list .claude/, .vscode/tasks.json and shell rc files changed near the install time as places to inspect. Editors and agents can trigger installs, so the guard belongs in CI and in any agent install path, not only in a human shell.

## 4. Install scripts disabled does not cover git dependency prepare on npm 10 and 11

1. The TanStack payload arrived through an optionalDependencies entry pointing at a github: commit whose prepare script ran on install (postmortem).
2. pacote, which npm uses to fetch packages, gained the commit "fix: respect ignoreScripts option for git dependencies" on 12 May 2026: https://github.com/npm/pacote/commit/e0af7f6a49880895817aa863f99747b102495f93 . Reading lib/git.js at each tag, the check is present in pacote v22.0.0 and absent from v21.5.2 and v19.0.3.
3. npm v10.9.10 depends on pacote ^19.0.3, npm v11.21.2 on ^21.5.2, npm v12.2.2 on ^22.0.1 (package.json at each tag in https://github.com/npm/cli). Node 22 ships an npm 10 release.
4. Status: verified from source only, not by running an install. The team should confirm with a harmless local git dependency before relying on it.
5. Mitigation: allow-git=none (npm 11.9.0 and later, default in npm 12) stops git dependencies from being fetched at all; see section 9.
6. Design effect: npm ci --ignore-scripts on Node 22 may still run prepare for git dependencies. The guard should report every lockfile entry whose resolved field is a git or github URL, and the sealed check alone does not cover this path.

## 5. Lockfile versions and npm-shrinkwrap.json precedence

1. npm docs: lockfileVersion 1 is written by npm 5 and 6, version 2 by npm 7 and 8 (backwards compatible with 1), version 3 by npm 9 and later. Since npm 7 there is also a hidden lockfile at node_modules/.package-lock.json, always version 3. When both files exist at the root, npm-shrinkwrap.json wins and package-lock.json is ignored. https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json
2. npm 12.0.0 (released 8 Jul 2026) changed both points, per Arborist source (https://github.com/npm/cli/blob/v12.2.2/workspaces/arborist/lib/shrinkwrap.js):
   a. lockfileVersion 4 exists. Arborist writes it when a lockfile has patched dependencies (npm patch) or packageExtensions state, so older clients abort. The maximum supported is 4.
   b. The commit "feat!: drop npm-shrinkwrap.json support" (21 Apr 2026, https://github.com/npm/cli/commit/2e5dcad17a) says npm-shrinkwrap.json is no longer loaded or honored at the root or inside dependency tarballs.
3. Design effect: the architecture reads npm-shrinkwrap.json first "matching what npm ci uses". That holds only up to npm 11. Under npm 12 a stale npm-shrinkwrap.json would be checked while npm ci installs from package-lock.json. The guard should either know the npm major version or check both files and block if either holds a Sealed version. A version 4 lockfile currently falls into unavailable, which is safe but will block npm 12 projects that use npm patch.

## 6. npm alias entries in lockfiles

1. In lockfile versions 2 and 3 the packages key is the install path (node_modules/aliasName). Arborist adds a name field to an entry only when the real package name differs from the folder name, which is the alias case (metaFromNode in shrinkwrap.js, link above). The npm docs do not document this per entry name field.
2. In the legacy dependencies section (version 1), an alias is written as a version string of the form npm:realName@version (same file).
3. Design effect: matches the architecture. Use the entry name when present, otherwise derive the name from the path after the last node_modules segment. Never key on the folder name for an aliased entry.

## 7. npm cache layout

1. The cache lives in _cacache inside the cache root: ~/.npm on POSIX, %LocalAppData%\npm-cache on Windows. It is content addressable and verified on insert and on extract. https://docs.npmjs.com/cli/v11/commands/npm-cache
2. From cacache source (https://github.com/npm/cacache): the index is under index-v5, bucketed by the sha256 of the key into two 2 character directories; content is under content-v2/sha512/xx/yy/rest, named by the integrity hash. Index entries hold the key, the integrity and metadata.
3. Registry responses are cached under keys of the form make-fetch-happen:request-cache: followed by the full URL (https://github.com/npm/make-fetch-happen/blob/main/lib/cache/key.js), so a tarball URL in the index reveals name and version.
4. npx keeps its own installs under _npx in the cache root (Nx advisory cleanup steps).
5. Design effect: bulkhead audit --cache can walk index-v5, read keys that are tarball URLs, and match name and version against the Sealed list without touching content files.

## 8. What a registry takedown or deprecation does and does not remove

1. Deprecation only prints a warning on install; the version stays installable. https://docs.npmjs.com/deprecating-and-undeprecating-packages-or-package-versions
2. Once a name and version has been used it can never be used again, even after unpublish. https://docs.npmjs.com/policies/unpublish . The policy page does not describe security removals by npm staff.
3. Observed on 6 Nov 2026: removed malicious versions (TanStack, Nx, debug, chalk, ua-parser-js) are gone from the versions object of the packument but their publish times remain in the time object. See replay_candidates.md.
4. A takedown does not reach copies outside the public registry. The debug advisory says owners published new patch versions on 13 Sep 2025 to cache bust private registries that might still hold the bad version, and that browser bundles built with it keep the payload until rebuilt (https://api.osv.dev/v1/vulns/GHSA-4x49-vf9v-38px). The Nx advisory tells users to purge internal registries such as Artifactory and Nexus and clean npm, yarn and pnpm caches (https://api.osv.dev/v1/vulns/GHSA-cxm3-wv7p-598c).
5. Persistence the payload left behind (daemons, hooks, shell rc edits) is untouched by any registry action.
6. Design effect: matches design rule 5. Audit scans lockfiles, caches and Docker layers; built bundles and internal mirrors are worth listing in docs/limits.md as places audit does not reach.

## 9. Git dependency mechanisms that run code without lifecycle scripts

All sources accessed 6 Nov 2026.

a. A .npmrc inside a git dependency that replaces the git binary (npm). Reported, not reproduced by us.
1. npm has a git config key: "The command to use for git commands." Its default is git (definitions.js in https://github.com/npm/cli/blob/v12.2.2/workspaces/config/lib/definitions/definitions.js).
2. Koi researchers (Oren Yomtov, Idan Dardikman) reported that a malicious git dependency can ship a .npmrc that sets git to an attacker script, so when npm prepares a nested git dependency it runs that script instead of git, even with --ignore-scripts. npm closed the report as expected behaviour. Sources: SecurityAffairs, 28 Jan 2026, https://securityaffairs.com/187416/hacking/packagegate-bugs-let-attackers-bypass-protections-in-npm-pnpm-vlt-and-bun.html ; the DEF CON Singapore talk slides, https://media.defcon.org/DEF%20CON%20SG%201/DEF%20CON%20SG%201%20main%20stage%20presentations/Oren%20Yomtov%2C%20Idan%20Dardikman%20-%20PackageGate%20-%20Finding%200-days%20in%20every%20JS%20Package%20Manager.pdf (fetch failed with a connection reset, not read). The original Koi post (koi.ai/blog/packagegate-6-zero-days-in-js-package-managers-but-npm-wont-act) now redirects to a Palo Alto Networks product page, so the primary write up could not be read. Status: not verified against a primary source.
3. The mechanism is consistent with the old pacote code in section 4: preparing a git dependency spawns npm install inside the cloned repo, which reads that repo's own config. The npm 12 docs for allow-git give the reason for the new default: git dependencies "may install configuration the project does not control".

b. pnpm running prepare when it fetches a git dependency. Verified.
1. GHSA-379q-355j-w6rj (CVE-2025-69264), published 7 Jan 2026, affects pnpm 10.0.0 up to but not including 10.26.0: https://api.osv.dev/v1/vulns/GHSA-379q-355j-w6rj
2. pnpm 10 disables dependency lifecycle scripts by default through onlyBuiltDependencies, but git hosted dependencies run prepare, prepublish and prepack during the fetch phase, where that allowlist is never consulted. Only ignoreScripts stops it there.
3. Related: GHSA-7vhp-vf5g-r2fw (CVE-2025-69263), pnpm lockfile integrity bypass for remote dynamic dependencies, published 7 Jan 2026: https://api.osv.dev/v1/vulns/GHSA-7vhp-vf5g-r2fw

c. The npm setting that disallows git dependencies. Verified.
1. Name: allow-git (CLI flag --allow-git, .npmrc key allow-git). Accepted values: all, none, root. all fetches any git dependency; none fetches none; root allows only git dependencies listed in the project's own package.json (and git fetches for commands like npm view). Changing it does not remove dependencies already installed. Source: definitions.js at each tag in https://github.com/npm/cli and https://docs.npmjs.com/cli/v11/using-npm/config
2. First version: npm 11.9.0, released 4 Feb 2026. The npm CLI changelog lists "config: add --allow-git" (#8943, commit f5f6cf7) under 11.9.0, and the definition is present at tag v11.9.0 and absent at v11.8.0. The GitHub changelog of 18 Feb 2026 says v11.10.0 and later (https://github.blog/changelog/2026-02-18-npm-bulk-trusted-publishing-config-and-script-security-now-generally-available/); the source tags show 11.9.0, so 11.10.0 is the first version npm announced, not the first that has it.
3. Defaults: all in npm 11. none from npm 12.0.0 (changelog: "allow-git and allow-remote now default to "none"", #9466). npm 10.9.10 does not have the setting, so Node 22 with its bundled npm 10 cannot use it.
4. Known bug: npm/cli#9189 (opened 3 Apr 2026) reported that allow-git=root refused root level git dependencies; the fix PR #9206 merged 15 Apr 2026. Which npm 11 release first carries the fix is not verified.
5. npm 11.15.0 (20 May 2026) added the sibling settings allow-file, allow-directory and allow-remote (#9339).
6. Design effect: bulkhead install should pass --allow-git=none when npm is 11.9.0 or later, and on npm 10 refuse or flag any lockfile entry resolved from git.

## 10. Out of scope: theft of short lived CI tokens from runner memory

In TanStack the attacker read an OIDC token from the memory of the GitHub Actions runner and published with it (postmortem). That happens inside the publisher's CI before any version reaches the registry. Bulkhead acts on versions after they are published, so it cannot prevent this theft; it can only seal the versions that result. Hardening the publisher's CI (pinning actions, auditing pull_request_target, scoping OIDC trust to one workflow and branch) is out of scope for Bulkhead and should be listed in docs/limits.md.

## 11. Loaders that start another runtime such as Bun

1. Shai Hulud 2.0, Nov 2025: a preinstall script setup_bun.js finds or downloads a Bun runtime for the platform, then starts bun_environment.js in a detached background process with output suppressed, so the install looks normal. Socket, 24 Nov 2025: https://socket.dev/blog/shai-hulud-strikes-again-v2 . Unit 42 says it "disguises itself as a helpful Bun installer" and that bun_environment.js is over 10 MB and heavily obfuscated: https://unit42.paloaltonetworks.com/npm-supply-chain-attack/ . Wiz names both files and says this variant runs only in preinstall: https://www.wiz.io/blog/shai-hulud-2-0-ongoing-supply-chain-attack
2. TanStack, May 2026: Endor Labs says the payload needs Bun (it calls Bun.gunzipSync), the prepare hook runs it with Bun, and a Bun download during install is a warning sign. https://www.endorlabs.com/learn/shai-hulud-compromises-the-tanstack-ecosystem-80-packages-compromised
3. None of these sources states why the attackers chose Bun. The claim that it evades Node based monitoring is not verified.
4. Design effect: staticScripts should flag install or prepare scripts that download or start another runtime (bun, deno, a fetched binary). sandboxCanary must watch every process in the container, not only node, and the detached child means a run that looks finished may still be active, so the sandbox timeout applies to the container, not the npm process.
