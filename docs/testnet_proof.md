# Testnet proof, Base Sepolia, 7 Nov 2026

What ran on Base Sepolia (chain id 84532) on 7 Nov 2026 around 04:15 IST, with the commands, so anyone can check it.

## Deployment

1. SealRegistry: [0x07DCC100d48fBA912fEf3e14F61d1162596a0E8F](https://sepolia.basescan.org/address/0x07DCC100d48fBA912fEf3e14F61d1162596a0E8F), deployed at block 55415999 by `bash ops/deployTestnet.sh`.
2. Settings read back from the chain by the same script: quorum 2, dispute window 3600 s, vote lifetime 86400 s, max seals per day 10, the guardian role and the three detector roles as in .env. Source verified on Sourcify.
3. Deployer 0x5074bB98a467cad945794880F6Ed339388bDfE5F, funded by the team with 0.05 Base Sepolia ETH.

## Demo seal

`node --experimental-strip-types ops/sealDemo.ts` (from ops/) had two of our detector keys vote by hand on @cordondemo/colorkit 1.4.1, our own demo package, which is not on the public npm registry. No detector scan ran for this seal; the evidence hash is the keccak256 of a fixed note in ops/sealDemo.ts that says so.

| Step | Transaction | Block |
| --- | --- | --- |
| staticScripts vote | [0xab6a670c…be0d](https://sepolia.basescan.org/tx/0xab6a670c8584923ce69e28dffdc1de5e0d2d9fac32e9f6843c6f2d33d468be0d) | 55416244 |
| sandboxCanary vote, quorum reached, Sealed | [0x88a6b406…e6e5](https://sepolia.basescan.org/tx/0x88a6b4064b2795ea2f7fb0e80206c101fe4caa10418ea66e389b637f71ffe6e5) | 55416257 |

Seal key 0x405f99113d19f40ba72ef07960e394e0c0f8540c16f8b225145ce90e129616b4, evidence hash 0xa4a343ac6e86afdfd447dd7400be0c2d7ba04cab87c66594d8a427a916ab7789, isSealed true.

## Guard against the public RPC

`bash ops/testnetProof.sh` runs `cordon check` on demo/services/ordersApi/package-lock.json, which locks @cordondemo/colorkit 1.4.1, with no watcher and no snapshot URL, and a fresh empty guard cache.

| Run | RPC | Exit | Outcome | List source | Blocked |
| --- | --- | --- | --- | --- | --- |
| 1 | https://sepolia.base.org | 1 | blocked | chain | @cordondemo/colorkit@1.4.1 |
| 2 | off (http://127.0.0.1:9) | 1 | blocked | none | @cordondemo/colorkit@1.4.1 |

In run 2 the guard could not reach the chain and had no snapshot, so it blocked from the sealed key it recorded in its cache during run 1 ("1 previously sealed version(s) missing from the available list stay blocked"). A guard that never read the chain before would fall back to the age rule instead: block versions younger than N = 3 days or of unknown age. The demo package has no public npm publish date, so the registry metadata warning in both runs is expected.

## Limits

The two votes were cast by keys our team holds, by hand, for a demo package. This shows the contract and the guard working on a public testnet; it does not show independent detectors, and it is not a seal of a real malicious package.
