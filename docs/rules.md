# ETHGlobal Mumbai rules that apply to Sluice

Source: ethglobal.com/events/mumbai/info/details and info/start, read 5 Nov 2026.

## Deadline and track

1. Submit by Sat 7 Nov 2026, 09:00 IST. Late submissions are refused.
2. We enter the Classic From Scratch track. All project code starts after hacking began on Thu 5 Nov, 21:00 IST.
3. Public libraries and starter kits are allowed. Each one is credited in the README.

## Existing code

1. No project specific code, designs or assets from before the event.
2. The README separates what we wrote from what we reused.

## AI tools

1. AI tools are allowed. We used Claude Code with project subagents.
2. docs/ai_usage.md lists per file or folder what AI generated, what AI assisted, and what the team wrote or changed by hand.
3. All prompts, specs and planning artifacts are committed: the orchestration prompt, the event brief prompt, CLAUDE.md, docs/architecture.md and every file in .claude/agents.
4. The team makes and records the design decisions. A project built entirely by AI can lose partner prize and finalist eligibility.

## Version control

1. Git from the first file. Small commits through the event. No single large final commit.

## Submission

1. Repo link, title, description, up to 3 partner prizes with how we used each tool and our feedback.
2. Demo video 2 to 3 minutes (fits every partner limit), 720p or higher, recorded on a computer, human voice, no AI voiceover, no speed up.
3. Finalist judging: 4 minute live demo plus 3 minutes Q&A.

## Partner specific files

1. Chainlink CRE: workflow source in the repo and a recorded CLI simulation or deployment. The submission explains how CRE is used and gives feedback.
2. Arc, only if the mentor confirms locally built contracts qualify: shareable Arc Studio project URL, architecture diagram, Studio shown in the demo.

## Stack after the event brief

1. Chain stays Base Sepolia, set only by env (CHAIN_ID, RPC_URL, EXPLORER_URL, NATIVE_SYMBOL and their NEXT_PUBLIC_ twins), so a switch to Arc Testnet is a config change.
2. Partner prize target: Chainlink CRE. Arc waits for the mentor answer. Arkiv is dropped.
3. A CRE workflow is a second publish path to the oracle. The watcher's direct publish stays so the demo never depends on CRE.
4. SQLite stores tracked papers and reports.
5. x402 and ERC 8004 are dropped.
