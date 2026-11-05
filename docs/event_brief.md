# ETHGlobal Mumbai 2026 event brief

Source: ethglobal.com/events/mumbai (overview, dashboard, prizes, info/start, info/details, info/resources), read on 5 Nov 2026 while logged in.
Not read: the Friday and Saturday schedule tabs, the expanded FAQ answers, the Hacker Pack perk list. Product names below are written without hyphens to follow our style rules.

## 1. Dates, deadlines, submission

1. Event: Thu 5 Nov to Sat 7 Nov 2026, Jio World Convention Centre, Mumbai. Part of Devcon week. Pragma Mumbai on 6 Nov.
2. Hacking began Thu 5 Nov 21:00 IST.
3. Submission deadline: Sat 7 Nov 2026, 09:00 IST. Late submissions are not accepted. That leaves about 36 hours of build time from the start of hacking.
4. Submit on the Hacker Dashboard: title, description, repo link. Submissions are not open yet; a draft project can be created now.
5. Up to 3 partner prizes per project. Several tracks from one partner count as one partner prize. For each, explain how the partner tool was used and give feedback.
6. Two submission modes: Finalist plus partner prizes (live finalist judging), or partner prizes only.
7. Demo video: optional but strongly encouraged, shown on the ETHGlobal Showcase. Rules: 2 to 4 minutes (upload rejects outside that), at least 720p, no speed up, no music with captions instead of talking, no phone recording, no text to speech or AI voiceover.
8. Some partners set their own video limits: 0G under 3 minutes, EF CROPS 3 minutes max, Hedera 5 minutes max, Whitechain 2 to 4 minutes. 2 to 3 minutes satisfies all of them.
9. Repo: use version control through the event. Large single commits or missing history may be disqualified. Clearly separate new work from reused work.

## 2. Rules on existing code, AI tools, teams

1. Tracks (new for Mumbai): Classic From Scratch, or Continuity (Extend Open Source, Ship a Feature). Prizes and judging differ per track, and a team is only eligible for its own track's prizes. All team members must be on the project's track. Our dashboard has no track selected yet.
2. From Scratch: all project work must begin after hacking starts. Public libraries and starter kits are allowed, with transparency. Prior project specific code, designs or assets are not allowed. Projects built before the event get no partner prizes and no finalist slot.
3. AI tools (ChatGPT, Claude Code, Copilot, Cursor and similar) are permitted with conditions:
   1. Attribution: document where and how AI was used, naming the code, files or assets it generated or assisted.
   2. Involvement: AI should assist, not create the whole project. Projects built entirely by AI without meaningful team contribution may lose partner prize and finalist eligibility.
   3. Spec driven workflows are allowed, but all spec files, prompts and planning artifacts must be in the repo.
4. Team size 1 to 5. Solo is allowed. Each member must be accepted and staked individually.
5. Stake is returned within about 4 weeks after submitting a project.

## 3. Judging

1. Five criteria: Technicality, Originality, Practicality, Usability (UI, UX, DX), WOW factor.
2. Finalist format: 7 minutes per team, 4 minute demo plus 3 minutes Q&A. Expect: what inspired it, which tools and why, what challenges were solved.
3. Partner judging uses submission materials only. Booth visits are optional. Winners announced at closing.
4. Finalists: top 10 teams. Per person: solo 250 USDC, 2 people 250 USDC, 3 to 5 people 1,000 USDC plus 500 USDC travel. Every finalist also gets $10,000 AWS credits, a hoodie and an ETHGlobal Plus discount.
5. Named judges and speakers include Vitalik Buterin, Justin Drake and Austin Griffith (EF), Tomasz Stanczak (Nethermind), Jordi Baylina (ZisK) and Balaji Srinivasan.

## 4. Sponsor prizes

Total listed: $175,000 across 12 partners. Cont marks Continuity only tracks, which we cannot enter on From Scratch.

### Chainlink, $5,000
1. Best workflow with CRE, $1,500. Build, simulate or deploy a CRE workflow used as an orchestration layer. It must integrate at least one blockchain with an external API, data source, LLM or agent, show a successful CRE CLI simulation or live deployment, and be meaningfully used in the project.
2. Best use of CCIP 2.0, $3,500 (up to 2 teams). Must use CCIP to make a state change on a chain.

### Arc (Circle), $15,000. Every track: built in Arc Studio, shareable Arc Studio project URL shown in the demo, working frontend and backend, architecture diagram, repo link, video.
1. Best Smart Contracts with Advanced Stablecoin Logic, $3,000. Listed example: "Conditional escrow with onchain dispute and automatic release". Also payroll, vesting, treasury splits, agent payments. Bonus for reusable contracts.
2. Best DeFi or Onchain Finance App, $3,000. USDC or EURC settlement.
3. Best Mobile Web Consumer Agent using the Marketplace Discovery API, $3,000.
4. Best Use of Bridge Kit for non USDC assets, $3,000.
5. Cont: Bring Your Project to Arc, $3,000.

### Arkiv, $15,000. Every track needs writes to the Arkiv testnet with their SDK, wallet addresses and one runnable query in the README, files under /arkiv/ (schema, friction and one per judging criterion), an open source license, and an AI use statement. One Arkiv track per team, Swarm bonus on top.
1. Build on Arkiv from scratch, $4,000 (1st $3,000). App data lives in Arkiv entities with queryable fields, owners and expiry. Judged 25% each on feedback, reach, why Arkiv, how you use Arkiv. An SDK installed but never read from does not count.
2. Mirror something Ethereum depends on, $4,000. Public Ethereum data mirrored into Arkiv.
3. Node tooling, $2,000.
4. Arkiv plus Swarm bonus, $500.
5. Cont: Build on Arkiv existing projects, $4,000. Cont: Swarm bonus, $500.

### Hedera, $15,000
1. AI Agents That Pay: x402 on Hedera, $6,500. One x402 protected endpoint settling on Hedera, an agent or client that completes a paid request end to end, README with the payment flow, video of 5 minutes or less linking to HashScan. Extra points for spend controls and ERC 8004 or HCS 14 agent identity.
2. Tokenize Anything with Hedera Studios, $5,000. Must use Asset Tokenization Studio or Stablecoin Studio.
3. No Solidity Allowed, $2,000. Hedera SDKs only, two native services.
4. Cont: Built on Hedera, $1,500.

### Whitechain, $15,000. Every track: contracts on Whitechain Sepolia (chain ID 1874) verified on their explorer, at least one USDT payment settled in the demo, a README line on why the flow needs onchain stablecoin settlement, steady commit history, 2 to 4 minute video showing each party, WHITECHAIN_FEEDBACK.md.
1. Operate: Stablecoin Payments for Business, $5,000.
2. Tokenize: Real World Finance, $4,000. Contract enforced lifecycle rules, an issuer or investor flow.
3. Scale: Payments Nobody Notices, $3,000.
4. Cont: Bring Your Product to Whitechain, $3,000.

### Ethereum Foundation, $15,000 (one EF prize per project)
1. Best Use of Anon RPC, $5,000. App routes its RPC reads through Anon RPC by default.
2. Best use of the Frame Transaction Alternative Mempool (EIP 8141), $5,000.
3. Best CROPS App (censorship resistant, open source, private, secure), $3,500. FOSS license, a CROPS section in the README, video of 3 minutes max, no third party trackers.
4. Cont: CROPS Upgrade, $1,500.

### 0G, $15,000 (paid at 0G's discretion)
1. Build with 0G Private Computer, $5,000. AI inference in the main user flow with request IDs. Not wanted: apps where the AI call could be removed unnoticed.
2. Physical AI, $5,000. Agents That Pay for Themselves, $2,000. Cont: Keep Building on 0G, $3,000.

### Uniswap Foundation, $15,000
1. Build with Uniswap, $10,000 and $5,000 pools. Integrate any part of the Uniswap stack, public repo, FEEDBACK.md.

### World, $12,500
1. World ID Agent Pass, $5,000. Best Use of IDKit, $2,500 (up to 2 teams). Both need a success path and a failure path validated on a backend. Cont versions: $2,500 each.

### ENS, $10,000
1. Best Use of ENSv2, $7,000. ENSv2 on mainnet or Sepolia, central to the project.
2. Cont: ENSv2 into an existing project, $3,000.

### 1inch, $7,000
1. Build an Aqua App, $5,000. Official Aqua or SwapVM contracts, onchain token transfers in the demo. Cont: $2,000.

### Definitive, $5,000
1. Best Use of Flash Advanced Orders in a Social App, $2,500. The second track did not load.

## 5. Tools, credits, mentors, workshops

1. Hacker Pack (claimed on our account): faucets and developer perks. Perk list not read.
2. ETHGlobal faucet at ethglobal.com/faucet.
3. Ankr: free RPC for hackers, 1,500 requests per second for 7 days (Whitechain offer).
4. 0G compute credits for every team. Finalists get $10,000 AWS credits.
5. Mentors on Discord (#mentorship help channel) and in person in high visibility jackets. Feedback sessions appear on the schedule.
6. Thursday 5 Nov workshops (all done by now): Hedera with Claude Code skills, 0G, Arkiv, ENSv2, Uniswap, Whitechain, EF Anon RPC and alt mempool, Arc Studio, 1inch Aqua. Hedera and Whitechain workshops have recordings on YouTube.
7. AI tooling from sponsors: Hedera skills plugin, Uniswap AI skills, Arkiv MCP and plugin, comfy plugin for Claude Code (0G), Definitive Flash MCP.

## 6. Chains and testnets named by sponsors

1. Arc Testnet: chain ID 5042002, RPC rpc.testnet.arc.io, explorer explorer.testnet.arc.io, faucet faucet.circle.com. USDC is the native gas token with 18 decimals. Arc ships its own Foundry fork (arcforge, arccast, arcanvil per docs.arc.io). Arc Studio can deploy to Arc Testnet, Ethereum Sepolia, Base Sepolia, Arbitrum Sepolia, OP Sepolia, Polygon Amoy, Avalanche Fuji, Unichain Sepolia and Monad Testnet.
2. Whitechain Sepolia: chain ID 1874, OP Stack based. Test USDT at 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7, gas in WBT.
3. Hedera testnet, viewed on HashScan.
4. Arkiv testnet (data chain, not used for our escrow).
5. 0G Chain and 0G Storage.
6. EF alt mempool devnets for EIP 8141.
7. ENSv2 on Ethereum mainnet or Sepolia.
8. Chainlink CRE: supported networks not confirmed. docs.chain.link/cre returned 404 to our fetcher. Must be checked before Phase 1.

## Fit for Sluice

### Ranked by how naturally Sluice qualifies

1. Chainlink, Best workflow with CRE ($1,500). Requirement: a workflow that "integrate[s] at least one blockchain with an external API" and is meaningfully used. Sluice's core loop is exactly that: read Crossref and OpenAlex, write the oracle status. Simulation through the CRE CLI is enough to qualify.
2. Arc, Best Smart Contracts with Advanced Stablecoin Logic ($3,000). Requirement quotes our escrow almost word for word: "Conditional escrow with onchain dispute and automatic release". The guardian dispute window and oracle gated release fit. Catch: "Built in Arc Studio" with a shareable Studio URL.
3. Arkiv, Build on Arkiv from scratch ($3,000 first place). Requirement: app data lives in Arkiv entities that are queried and actually read. Tracked papers and verification reports as public, wallet owned Arkiv entities would replace SQLite and give funders a public report store whose hash sits on chain. Needs the /arkiv/ judging files.
4. Whitechain, Tokenize ($2,500 first place). Contract enforced release rules fit, but it needs a second deployment on chain 1874 and a USDT payment, which our native payable escrow does not do.
5. Hedera, x402 ($3,000 first place). Matches our stretch goal of pay per check, but needs Hedera settlement and an agent client. Expensive in a 36 hour window.
6. EF CROPS ($2,000 first place). Open source and auditable, but our verifier is a trusted party, so the censorship resistant property is weak.
7. Weak or no fit: 0G (advisory model calls are removable by design, which 0G says it does not want), World IDKit, ENSv2, Uniswap, 1inch, Definitive, Chainlink CCIP.

### Recommendation

1. Target three: Chainlink CRE, Arc stablecoin escrow, Arkiv from scratch.
2. Deploy on Arc Testnet (chain ID 5042002). Native gas is USDC, so a payable escrow on Arc already holds USDC and needs no ERC20 change. CHAIN_ID and RPC_URL stay env driven.
3. Fallback if CRE cannot write to Arc Testnet: deploy on Base Sepolia, drop Arc, and take Whitechain Tokenize or Hedera x402 as the third only if time allows.
4. Enter From Scratch. Nothing exists yet, so we lose nothing, and Continuity would shrink the prize pool.

### Rules that threaten the plan

1. Time. Hacking started Thu 21:00 IST and submissions close Sat 09:00 IST. Four phases plus stretch goals will not fit. Cut x402 and ERC 8004 now.
2. AI involvement. Our plan is agent driven, and the rules say projects built entirely by AI may lose partner prize and finalist eligibility. The team must make real decisions and edits, and docs/ai_usage.md must list per file what AI generated.
3. Spec artifacts. Our orchestration prompt, the event brief prompt and every file in .claude/agents count as planning artifacts and must be committed.
4. Commit history. This folder is not a git repo yet. Run git init at the start of Phase 0 and commit small and often. Large final commits risk disqualification.
5. Arc Studio. Every Arc track requires the project to be built in Arc Studio, a hosted agent that "writes, audits, tests, and deploys smart contracts". Docs do not say whether local Foundry contracts can be imported. Its CLI accepts files via a file flag. Ask at the Arc booth or Discord before relying on this prize.
6. CRE network support is unconfirmed. Oracle and escrow must share a chain, so if CRE cannot target Arc Testnet the chain plan changes.
7. Our default chain, Base Sepolia, matches no sponsor requirement.
8. Demo video must use a human voice, no AI voiceover, recorded on a computer at 720p or higher.
9. Partners judge from materials only, so the README must say clearly how each sponsor tool is used.
10. Track selection on the dashboard is still empty. You need to pick From Scratch yourself.

### Sponsor tools to use instead of building

1. Chainlink CRE: the cron trigger, HTTP fetch and chain write can replace our watcher's schedule and publish code. The watcher keeps its diff logic and the demo feed.
2. Arkiv SDK: replaces SQLite for tracked papers and reports, and gives public queryable report storage.
3. Arc native USDC: no token contract or approval flow needed for the escrow.
4. Ankr free RPC and the ETHGlobal faucet for testnet funds.
5. Hedera x402 facilitators, only if the pay per check stretch survives.
