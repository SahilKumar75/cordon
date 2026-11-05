# Incidents

Each entry lists its sources with an access date. Status is verified when the team or a primary source confirms it, unverified otherwise. Links and advisory ids keep their original spelling.

## TanStack npm compromise, 11 May 2026

Status: verified (team confirmed, 5 Nov 2026).

Sources, accessed 5 Nov 2026:
1. TanStack postmortem (primary): https://tanstack.com/blog/npm-supply-chain-compromise-postmortem
2. Endor Labs write up: https://www.endorlabs.com/learn/shai-hulud-compromises-the-tanstack-ecosystem-80-packages-compromised
3. GitHub advisory listing the affected packages, named in the postmortem: GHSA-g7cv-rxg3-hmpx

What happened, per the postmortem as summarised in search results on the access date:
1. On 11 May 2026 between 19:20 and 19:26 UTC, an attacker published 84 malicious versions across 42 @tanstack packages through TanStack's own release pipeline.
2. The releases carried valid npm provenance. The provenance was accurate about where the build ran, which is why it could not tell a hijacked build from a clean one. This is the basis for our rule that provenance is never an allow signal.
3. An outside researcher opened a tracking issue about 26 minutes after the first publish. TanStack deprecated the versions 1 hour 43 minutes after the first publish, and npm removed the tarballs between 22:13 and 23:55 UTC.
4. TanStack recommends rotating credentials reachable from any host that installed an affected version.

Points where sources disagree, to be resolved against the postmortem text by the research agent:
1. Entry point. The postmortem summary describes a pull_request_target workflow, GitHub Actions cache poisoning and an OIDC token taken from runner memory, with no stolen credentials. The Endor Labs write up says a short lived npm publish token was used.
2. Scale of the wider campaign. Endor Labs ties it to the Shai Hulud wave; secondary reports give different package counts across npm and PyPI.

Claim recorded with limited support: that this was the first malicious npm release carrying provenance the attacker did not forge. Only one article we found makes that claim. Treat it as a single source claim and do not repeat it in the README or the pitch.

Unverified, from secondary write ups only: a persistence daemon that wipes files when the stolen GitHub token is revoked. Relevant to design rule 3 (worms can destroy files when interrupted).

Team instruction, 6 Nov 2026, applied to the guard's advice: remove persistence daemons and IDE or coding agent hooks before revoking any tokens, then rotate credentials. This holds whether or not the wiper detail above is confirmed.

Use in Bulkhead: the timestamps above are the reference case for the replay timeline, built from OSV and npm registry data and labelled as a replay.
