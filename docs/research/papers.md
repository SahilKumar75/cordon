# Papers on malicious package detection

Numbers come from each paper's arXiv abstract unless noted. Venues come from the arXiv comment or journal fields. All accessed 6 Nov 2026.

## Datasets and taxonomies

1. Ohm, Plate and others. Backstabber's Knife Collection: A Review of Open Source Software Supply Chain Attacks. DIMVA 2020. https://arxiv.org/abs/2005.09535
   Measured: 174 malicious packages from real attacks, Nov 2015 to Nov 2019, 62.6% npm, 16.1% PyPI, 21.3% RubyGems, analysed by hand. From the paper body: 56% trigger on installation, 43% at runtime, 41% check a condition before running, 61% use typosquatting, 49% use obfuscation. Relevance: the base rate for install time execution behind design rule 1.
2. Ladisa, Plate and others. Taxonomy of Attacks on Open Source Software Supply Chains. IEEE S&P 2023. https://arxiv.org/abs/2204.04008
   Measured: an attack tree of 107 vectors linked to 94 real incidents and 33 safeguards, validated by 17 experts and 134 developers.

## Metadata signals

3. Zahan, Zimmermann and others. What are Weak Links in the npm Supply Chain? ICSE SEIP 2022 (DOI 10.1145/3510457.3513044). https://arxiv.org/abs/2112.10165
   Measured: metadata of 1.63 million npm packages and six weak link signals. Found 2,818 maintainer emails on expired domains, enough to take over 8,494 packages; the install script signal found 11 malicious packages in one case study; 470 developers surveyed.
4. Zhou, Liang and others. A Large scale Fine grained Analysis of Packages in Open Source Software Ecosystems. arXiv 2024, venue not checked. https://arxiv.org/abs/2404.11467
   Measured: metadata, static and dynamic features across 50,000+ legitimate and 1,000+ malicious packages. Malicious packages have less metadata and call HTTP or URL functions more often; one feature dimension alone separates the classes about as well as all combined.

## Static analysis and machine learning

5. Sejfia, Schäfer. Practical Automated Detection of Malicious npm Packages (Amalfi). ICSE 2022 (DOI 10.1145/3510003.3510104). https://arxiv.org/abs/2202.13953
   Method: classifiers, then a check that the package reproduces from its source repo to drop false positives, then clone detection. Measured: on 96,287 versions published in one week it found 95 previously unknown malware samples, a few seconds per package.
6. Zhang, Huang and others. Killing Two Birds with One Stone: Malicious Package Detection in NPM and PyPI using a Single Model of Malicious Behavior Sequence (Cerebro). TOSEM 2024 (DOI 10.1145/3705304). https://arxiv.org/abs/2309.02637
   Method: behaviour sequences fed to a fine tuned BERT model across both ecosystems. Measured: 306 new malicious PyPI packages and 196 new npm packages found.
7. Zahan, Burckhardt and others. Leveraging Large Language Models to Detect npm Malicious Packages (SocketAI). arXiv 2024, venue not checked. https://arxiv.org/abs/2403.12196
   Measured: GPT-4 reached 99% precision and 97% F1, GPT-3 91% precision and 94% F1; 16% better precision and 9% better F1 than static analysis alone; a static pre screen cut files sent to the model by 77.9% and cost by 60.9% (GPT-3) and 76.1% (GPT-4).

## Dynamic analysis and sandboxing

8. Duan, Alrawi and others. Towards Measuring Supply Chain Attacks on Package Managers for Interpreted Languages (MalOSS). NDSS 2021. https://arxiv.org/abs/2002.01139
   Method: metadata, static and dynamic analysis across registries. Measured: 339 new malicious packages reported, 278 (82%) confirmed by registry maintainers, three with more than 100,000 downloads.
9. Huang, Wang and others. DONAPI: Malicious NPM Packages Detector using Behavior Sequence Knowledge Mapping. USENIX Security 2024. https://arxiv.org/abs/2403.08334
   Method: static triage, then dynamic API call sequences matched to a behaviour knowledge base, over a local mirror of 3.4 million packages. Measured: 325 malicious samples confirmed by hand, 246 API call sequences not seen in known samples.
10. Zheng, Wei and others. Towards Robust Detection of Open Source Software Supply Chain Poisoning Attacks in Industry Environments (OSCAR). ASE 2024 Industry Showcase (DOI 10.1145/3691620.3695262). https://arxiv.org/abs/2409.09356
    Method: full execution in a sandbox with fuzzing of exported functions and API hooks. Measured: F1 0.95 on npm and 0.91 on PyPI; on benign packages that look malicious, false positive rate fell from 34.63% to 2.57% on npm. Deployed on Ant Group mirrors since Jan 2023.
11. Pantelaios, Kapravelos. FV8: A Forced Execution JavaScript Engine for Detecting Evasive Techniques. USENIX Security 2024. https://arxiv.org/abs/2405.13175
    Measured: 11% more code coverage than stock V8, 28 evasion categories (five new); 1,443 (14.6%) of known malicious npm packages contain at least one evasion. Relevance: a sandbox that only runs install can miss payloads gated on conditions.
12. Huang, Zhao and others. ProfMalPlus: Agent Coordinated Detection of Malicious NPM Packages via Static Dynamic Analysis Synergy. arXiv, 15 Jul 2026, venue not checked. https://arxiv.org/abs/2607.13965
    Measured, as claimed by the authors: 98.1% F1, 3.5 to 52.6 points above other detectors, and 597 previously unknown malicious packages confirmed and removed from npm.

## Industry systems

13. OpenSSF Package Analysis. https://github.com/ossf/package-analysis
    Runs packages in gVisor sandboxes and records file access, network connections and commands. Its README gives no detection numbers. The MAL ids in OSV come from the ossf/malicious-packages repository (seen in the malicious-packages-origins field of MAL-2026-3465); the link between the two projects was not confirmed from the README.

## What this means for Bulkhead

1. No single method is enough: static triage plus dynamic runs (DONAPI, OSCAR) and evasion (FV8) all point to several independent detectors, which is the quorum design.
2. Reported precision is measured on curated benchmarks. A false seal is an outage, so these numbers do not justify a quorum of one.

## Figures check

Team rule: no figure marked not verified may appear in the README or the pitch. All sources accessed 6 Nov 2026.

1. 72.21 percent of malicious packages use lifecycle scripts. Verified.
   Source: Guo, Chen and others, arXiv 2603.27549, first posted 29 Mar 2026. Version 1 is titled Understanding NPM Malicious Package Detection: A Benchmark Driven Empirical Analysis; the current arXiv title is How Effective Are NPM Malicious Package Detectors? A Large Scale Empirical Study. https://arxiv.org/abs/2603.27549 (text read from https://arxiv.org/html/2603.27549v1)
   Sentence: "Among 6,420 malicious packages, 4,636 (72.21%) exploit installation scripts as attack vectors."
   Context: preprint, venue not checked. The same paper gives preinstall 61.15%, postinstall 6.74%, install 2.20%.
2. 21.2 percent with no JavaScript files. Not verified as worded.
   Same source. Sentence: "More strikingly, 1,362 packages (21.9%) rely entirely on install scripts with no malicious JavaScript code in any file."
   Two problems. The paper prints 21.9%, but 1,362 of 6,420 is 21.2%, so the paper's own numbers disagree. And the paper says no malicious JavaScript code, not no JavaScript files. Safe wording: 1,362 of 6,420 malicious packages in that benchmark had their whole attack in package.json install scripts.
3. 5.78 versus 3.72 percent. Verified as reported by Socket, not checked against vlt's own post.
   Source: Socket blog, Sarah Gooding, 26 Feb 2025: https://socket.dev/blog/vlt-launches-reproduce
   Excerpt: "they found that 5.78% were reproducible, compared to only 3.72% that had added provenance attestations"
   Context: vlt (Darcy Clarke) tested 5,000 high impact npm packages. A vendor measurement, not peer reviewed.
4. 53 to 87 percent rebuild verification. Verified, but it is a range across four ecosystems, not an npm figure.
   Source: Solarin, Kalu, Davis, Amusuo, Reproducibility is Not Enough: Artifact Verifiability in Decentralized Build Package Ecosystems, arXiv 2608.18180, 18 Aug 2026: https://arxiv.org/abs/2608.18180
   Sentence from the abstract (HTML version): "Our results show that artifact verifiability is low and uneven: across ecosystems, roughly 53–87% of completed rebuilds verify, and recovering the source commit is the dominant obstacle."
   Context: 34,005 packages from Crates.io, npm, PyPI and RubyGems. npm is the low end at 52.9% of completed rebuilds (Crates.io 87.4%). With provenance used to recover the source commit, npm rose to 73.2%. Any npm claim should use 52.9%, not the range.
