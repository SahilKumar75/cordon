# Replay candidates

Real advisories for a timeline only replay. Every value below was read from api.osv.dev and from npm registry metadata (the packument time field) on 6 Nov 2026. No tarball was downloaded and no package was run. Machine values are given in backticks exactly as served, so the replay code can compare them byte for byte.

Removed versions disappear from the versions object of the packument but keep their entry in the time object, which is what makes these replays possible after a takedown.

## 1. MAL-2026-3465, @tanstack/react-router (recommended)

1. OSV: https://api.osv.dev/v1/vulns/MAL-2026-3465 (alias GHSA-5q7g-gw3w-r3rh)
2. Affected: @tanstack/react-router `1.169.5` and `1.169.8`
3. OSV published `2026-05-11T23:44:35Z`, modified `2026-05-12T07:09:29.153799Z`
4. npm publish times from https://registry.npmjs.org/@tanstack%2freact-router : `1.169.5` at `2026-05-11T19:20:42.105Z`, `1.169.8` at `2026-05-11T19:26:17.716Z`. Both versions are absent from the versions object now.
5. Related: GHSA-g7cv-rxg3-hmpx, published `2026-05-12T00:12:49Z`, covers all 84 TanStack versions: https://api.osv.dev/v1/vulns/GHSA-g7cv-rxg3-hmpx . An OSV query for @tanstack/react-router 1.169.5 returns both ids.
6. Optional human sourced events, each with its own link: tracking issue #7383 opened `2026-05-11T19:46:46Z` (GitHub API created_at, https://github.com/TanStack/router/issues/7383); npm tarball removals 22:13:38 to 23:55:26 UTC per the postmortem.
7. Gap from first publish to OSV MAL record: about 4 hours 24 minutes.

The recorded fixtures in services/detectors/src/fixtures/ (osvVulnMal20263465.json, osvQueryTanstackReactRouter.json, npmTimesTanstackReactRouter.json) match the live values above, checked on 6 Nov 2026.

Why recommended: it is the incident the design rules came from, the publish times survive in registry metadata to the millisecond, the MAL id covers exactly two versions of one package (sealing per version shows clearly), and the team has already verified it.

## 2. MAL-2025-46974, debug

1. OSV: https://api.osv.dev/v1/vulns/MAL-2025-46974 (aliases CVE-2025-59144, GHSA-4x49-vf9v-38px, GHSA-8mgj-vmr8-frr6)
2. Affected: debug `4.4.2`
3. OSV published `2025-09-08T14:26:51Z`, modified `2025-09-16T06:44:36.384185Z`
4. npm publish time from https://registry.npmjs.org/debug : `4.4.2` at `2025-09-08T13:12:39.973Z`. Absent from versions now. Last clean version before it: `4.4.1` at `2025-05-13T20:56:36.431Z`.
5. Gap from publish to OSV MAL record: about 74 minutes.

Why useful: a runtime payload with no install script, so it shows that scripts disabled is not enough and the version itself must be blocked. Companion: MAL-2025-46969 for chalk `5.6.1`, OSV published `2025-09-08T17:11:19Z`, npm publish `2025-09-08T13:13:05.239Z` (https://api.osv.dev/v1/vulns/MAL-2025-46969).

## 3. MAL-2025-41443, nx

1. OSV: https://api.osv.dev/v1/vulns/MAL-2025-41443
2. Affected: nx `20.9.0`, `20.10.0`, `20.11.0`, `20.12.0`, `21.5.0`, `21.6.0`, `21.7.0`, `21.8.0`
3. OSV published `2025-08-27T16:42:47Z`
4. npm publish times from https://registry.npmjs.org/nx : `21.5.0` `2025-08-26T22:32:25.482Z`, `20.9.0` `2025-08-26T22:39:32.482Z`, `20.10.0` `2025-08-26T23:54:13.820Z`, `21.6.0` `2025-08-26T23:54:32.051Z`, `20.11.0` `2025-08-27T00:16:47.286Z`, `21.7.0` `2025-08-27T00:17:13.250Z`, `21.8.0` `2025-08-27T00:37:19.279Z`, `20.12.0` `2025-08-27T00:37:44.372Z`. All absent from versions now.
5. Gap from first publish to OSV MAL record: about 18 hours, a useful contrast to the faster cases.

Why useful: install time postinstall payload, eight versions on two release lines. An OSV query for nx 21.5.0 returns MAL-2025-41443 but not GHSA-cxm3-wv7p-598c, so a detector should look up both by id.

## Not suitable

ua-parser-js (GHSA-pjwm-rvh2-c87w) has registry times for 0.7.29, 0.8.0 and 1.0.0, but OSV holds no MAL id for it. Fine for a GHSA based replay, not for one that requires a MAL id.
