#!/bin/bash
set -euo pipefail
opsDir=$(cd "$(dirname "$0")" && pwd)
repoDir=$(dirname "$opsDir")
. "$HOME/.nvm/nvm.sh"
nvm use 22 > /dev/null
cd "$repoDir"
cast="$HOME/.foundry/bin/cast"
forge="$HOME/.foundry/bin/forge"
logFile="$repoDir/data/deployTestnet.log"
minimumWei=12000000000000000

[ -f .env ] || { echo ".env is missing, run pnpm --filter @cordon/ops keys first" >&2; exit 1; }
set -a
. ./.env
set +a
for name in CHAIN_ID RPC_URL EXPLORER_URL NATIVE_SYMBOL DEPLOYER_PRIVATE_KEY GUARDIAN_ADDRESS DETECTOR_ADDRESSES QUORUM DISPUTE_WINDOW_SECONDS MAX_SEALS_PER_DAY GUARD_SNAPSHOT_SIGNER; do
  [ -n "${!name:-}" ] || { echo "$name is empty in .env" >&2; exit 1; }
done
[ "$CHAIN_ID" != 31337 ] || { echo "CHAIN_ID is anvil, use ops/e2eLocal.sh for local runs" >&2; exit 1; }
rpcChain=$("$cast" chain-id --rpc-url "$RPC_URL")
[ "$rpcChain" = "$CHAIN_ID" ] || { echo "RPC_URL serves chain $rpcChain, .env says $CHAIN_ID" >&2; exit 1; }

deployer=$(cd ops && node --input-type=module -e 'import { privateKeyToAccount } from "viem/accounts"; console.log(privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY).address)')
balance=$("$cast" balance "$deployer" --rpc-url "$RPC_URL")
echo "chain $CHAIN_ID, deployer $deployer, balance $("$cast" from-wei "$balance") $NATIVE_SYMBOL"
node -e 'process.exit(BigInt(process.argv[1]) >= BigInt(process.argv[2]) ? 0 : 1)' "$balance" "$minimumWei" || {
  echo "deployer needs at least $("$cast" from-wei "$minimumWei") $NATIVE_SYMBOL, fund $deployer and run this again" >&2
  exit 1
}

echo
echo "== top up detectors, guardian and snapshot signer"
pnpm --silent --filter @cordon/ops fund

echo
echo "== deploy SealRegistry: quorum $QUORUM, dispute window ${DISPUTE_WINDOW_SECONDS}s, max seals per day $MAX_SEALS_PER_DAY"
mkdir -p data
(cd contracts && "$forge" script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --broadcast --slow) > "$logFile" 2>&1 || {
  echo "forge script failed, see $logFile" >&2
  exit 1
}
node --experimental-strip-types --no-warnings ops/recordDeployment.ts
registry=$(node -p 'require(process.argv[1]).sealRegistry' "$repoDir/contracts/deployments/$CHAIN_ID.json")

echo
echo "== read back from chain"
call() { "$cast" call --rpc-url "$RPC_URL" "$registry" "$@"; }
[ "$(call 'quorum()(uint16)')" = "$QUORUM" ] || { echo "quorum on chain does not match" >&2; exit 1; }
[ "$(call 'disputeWindow()(uint64)' | cut -d' ' -f1)" = "$DISPUTE_WINDOW_SECONDS" ] || { echo "dispute window on chain does not match" >&2; exit 1; }
[ "$(call 'maxSealsPerDay()(uint16)')" = "$MAX_SEALS_PER_DAY" ] || { echo "max seals per day on chain does not match" >&2; exit 1; }
[ "$(call 'hasRole(bytes32,address)(bool)' "$(call 'GUARDIAN_ROLE()(bytes32)')" "$GUARDIAN_ADDRESS")" = true ] || { echo "guardian role missing" >&2; exit 1; }
detectorRole=$(call 'DETECTOR_ROLE()(bytes32)')
for detector in ${DETECTOR_ADDRESSES//,/ }; do
  [ "$(call 'hasRole(bytes32,address)(bool)' "$detectorRole" "$detector")" = true ] || { echo "detector role missing for $detector" >&2; exit 1; }
done
echo "quorum, dispute window, rate limit, guardian and detector roles match .env"

echo
echo "== verify source on Sourcify"
constructorArgs=$("$cast" abi-encode "constructor(address,address[],uint16,uint64,uint16)" "$GUARDIAN_ADDRESS" "[$DETECTOR_ADDRESSES]" "$QUORUM" "$DISPUTE_WINDOW_SECONDS" "$MAX_SEALS_PER_DAY")
(cd contracts && "$forge" verify-contract --verifier sourcify --chain "$CHAIN_ID" --constructor-args "$constructorArgs" --watch "$registry" src/SealRegistry.sol:SealRegistry) >> "$logFile" 2>&1 \
  && echo "verified" || echo "Sourcify verification did not finish, see $logFile; the deployment itself is fine"

echo
echo "SealRegistry $registry"
echo "$EXPLORER_URL/address/$registry"
echo "next: sh demo/reset.sh, then start the stack as in docs/demo.md Prepare"
