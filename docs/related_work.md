# Related work

Cordon is not the first tool to stop malicious npm packages at install time. Several tools already do that, most of them more mature than this prototype. We make no claim of novelty. What Cordon tries differently is where the verdict lives: a version is blocked once a quorum of distinct detector keys votes on a public registry contract, and every guard reads that list itself. Whether that is better than a vendor feed is an open question; today one operator holds every Cordon key (see [trust model](trust_model.md)).

Facts below were checked on the linked pages on 7 Nov 2026. Where we could not confirm something, we say so.

## npmguard

Two ETHGlobal hackathon projects share this name, both from the GitHub user kryczkal. The Cannes 2026 project audits npm tarballs with an LLM risk score, agent investigation and Docker sandbox tests, and publishes verdicts as ENS subnames with reports on IPFS ([showcase](https://ethglobal.com/showcase/npmguard-aeihd), [repo](https://github.com/kryczkal/EthCannes2026)). The Lisbon 2026 project is a CLI that replaces npm install and blocks packages that audit as dangerous, with LLM triage and a Docker sandbox behind it ([showcase](https://ethglobal.com/showcase/npmguard-wt7wh), [repo](https://github.com/kryczkal/NpmGuard)). It is the closest prior work to Cordon that we know of: an onchain record of npm verdicts.

## Socket Firewall

Made by Socket. You prefix a command, such as `sfw npm install`, and it filters package manager network traffic to block malicious dependencies, across npm, yarn, pnpm, pip, uv and cargo. Source available under PolyForm Shield 1.0.0 ([repo](https://github.com/SocketDev/sfw-free)). The README does not say where its verdicts come from.

## Aikido SafeChain

Made by Aikido Security. A local proxy and shell wrappers intercept npm and PyPI downloads and block malware, using Aikido's own malware list. By default it also hides versions younger than 48 hours, which is the same idea as Cordon's optional minimum age. AGPL 3.0 or commercial ([repo](https://github.com/AikidoSec/safe-chain)).

## Datadog Supply Chain Firewall (scfw)

Made by Datadog, Apache 2.0. `scfw run -- npm install` checks the packages an install would pull against known malicious ones. Local mode uses Datadog's open malicious packages dataset and the OSV.dev API ([repo](https://github.com/DataDog/supply-chain-firewall)).

## Dependency Guardian

A product that downloads the package tarball and runs static behavioural detectors, without CVE lookups ([site](https://westbayberry.com/), [Product Hunt](https://www.producthunt.com/products/dependency-guardian/launches)). We could not verify its maker or license; it appears to be closed source. Cordon's staticScripts detector follows the same idea of reading the tarball itself.

## installwall

We could not find an official source for this name, so we make no statement about what it does.

## OSV and OpenSSF malicious packages

OSV is an open vulnerability database in a shared schema, with an API and OSV Scanner ([osv.dev](https://google.github.io/osv.dev/faq), [repo](https://github.com/google/osv.dev)). The OpenSSF malicious packages repository holds reports of malicious packages in OSV format, Apache 2.0 ([repo](https://github.com/ossf/malicious-packages)). Cordon's advisoryFeed detector and the Chainlink CRE workflow query the OSV API and only count records whose id starts with MAL, so they depend on this work directly.
