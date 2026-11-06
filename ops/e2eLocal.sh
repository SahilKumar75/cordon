#!/bin/bash
set -euo pipefail
opsDir=$(cd "$(dirname "$0")" && pwd)
repoDir=$(dirname "$opsDir")
. "$HOME/.nvm/nvm.sh"
nvm use 22 > /dev/null
cd "$repoDir"

runDir="$repoDir/data/e2eLocal"
logDir="$runDir/logs"
pidFile="$runDir/pids"
keyFile="$opsDir/keys/local.env"
demoEnv="$repoDir/demo/demo.env"
deploymentFile="$repoDir/contracts/deployments/31337.json"
foundryBin="$HOME/.foundry/bin"
sandboxImage=node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914
anvilPort=8546
detectorsPort=4301
watcherPort=4302
rpcUrl="http://127.0.0.1:$anvilPort"
watcherUrl="http://127.0.0.1:$watcherPort"
detectorsUrl="http://127.0.0.1:$detectorsPort"
demoPackage=@cordondemo/colorkit
sealedVersion=1.4.1
hold=false
[ "${1:-}" != --hold ] || hold=true
dashboardUrl=http://127.0.0.1:3000
createdDemoEnv=false
createdDeployment=false
results=()
timings=""

say() { printf '\n== %s\n' "$1"; }
pass() { results+=("pass  $1"); echo "pass: $1"; }
fail() { results+=("FAIL  $1"); echo "fail: $1" >&2; exit 1; }

waitUntil() {
  local label=$1 seconds=$2
  shift 2
  local deadline=$((SECONDS + seconds))
  until "$@" > /dev/null 2>&1; do
    [ "$SECONDS" -lt "$deadline" ] || fail "$label (timed out after ${seconds}s)"
    sleep 0.5
  done
}

launch() {
  local name=$1
  shift
  "$@" > "$logDir/$name.log" 2>&1 &
  echo "$name $!" >> "$pidFile"
}

stopProcess() {
  local pid
  pid=$(awk -v name="$1" '$1 == name { print $2 }' "$pidFile" 2> /dev/null || true)
  [ -z "$pid" ] || { kill "$pid" 2> /dev/null || true; wait "$pid" 2> /dev/null || true; }
  awk -v name="$1" '$1 != name' "$pidFile" > "$pidFile.next" 2> /dev/null && mv "$pidFile.next" "$pidFile"
}

guard() { node --experimental-strip-types --no-warnings "$repoDir/packages/guard/bin/cordon.js" "$@"; }
castCall() { "$foundryBin/cast" call --rpc-url "$rpcUrl" "$registryAddress" "$@"; }
isSealed() { [ "$(castCall 'isSealed(bytes32)(bool)' "$sealKey")" = true ]; }
hasVoted() { [ "$(castCall 'hasVoted(bytes32,address)(bool)' "$sealKey" "$1")" = true ]; }
healthy() { curl -fs "$1/health"; }
evidenceAtLeast() { [ "$(find "$runDir/evidence" -maxdepth 1 -name '*.json' 2> /dev/null | wc -l)" -ge "$1" ]; }

serviceAnswers() {
  local code
  code=$(curl -s -o "$runDir/body" -w '%{http_code}' "http://127.0.0.1:$1/")
  [ "$code" = "$2" ] && grep -q "$3" "$runDir/body"
}

snapshotSeals() {
  curl -fs "$watcherUrl/snapshot" | node -e '
const signed = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
const entry = signed.snapshot.entries.find((item) => item.key.toLowerCase() === process.argv[1].toLowerCase());
process.exit(entry && entry.status === "Sealed" ? 0 : 1);' "$sealKey" && grep -qi "${sealKey#0x}" "$repoDir/$SNAPSHOT_PATH"
}

stopwatchComplete() {
  curl -fs "$watcherUrl/stopwatch/$sealKey" > "$runDir/stopwatch.json" && node -e '
const watch = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
process.exit(watch.firstVerdictAt && watch.sealedAt && watch.firstBlockAt ? 0 : 1);' "$runDir/stopwatch.json"
}

reportField() { node -e 'const report = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); console.log(eval(process.argv[2]));' "$1" "$2"; }

checkBlocksFromSnapshot() {
  local label=$1 output=$runDir/$2.json code=0
  guard check --lockfile "$repoDir/demo/services/ordersApi/package-lock.json" > "$output" 2> "$runDir/$2.err" || code=$?
  local source blocked age
  source=$(reportField "$output" 'report.listSource')
  blocked=$(reportField "$output" 'report.blocked.map((item) => `${item.name}@${item.version}`).join(",")')
  age=$(reportField "$output" 'report.snapshotAgeSeconds')
  echo "exit $code, listSource $source, blocked $blocked, snapshot age ${age}s"
  sed 's/^/  guard: /' "$runDir/$2.err"
  [ "$code" = 1 ] && [ "$source" = snapshot ] && [ "$blocked" = "$demoPackage@$sealedVersion" ] || fail "$label"
  pass "$label"
}

summary() {
  echo
  echo "== summary"
  [ "${#results[@]}" -eq 0 ] || printf '%s\n' "${results[@]}"
  [ -z "$timings" ] || printf '%s\n' "$timings"
}

teardown() {
  local status=$?
  set +e
  summary
  say "teardown"
  [ ! -d "$repoDir/demo/logs" ] || cp -R "$repoDir/demo/logs" "$logDir/demo"
  [ "$createdDemoEnv" != true ] || sh "$repoDir/demo/reset.sh"
  if [ -f "$pidFile" ]; then
    while read -r name pid; do
      kill "$pid" 2> /dev/null && echo "stopped $name"
    done < "$pidFile"
    rm -f "$pidFile"
  fi
  docker ps -aq --filter name=canarysink --filter name=cordon_run_ | xargs docker rm --force > /dev/null 2>&1
  [ "$createdDemoEnv" != true ] || rm -f "$demoEnv"
  [ "$createdDeployment" != true ] || rm -f "$deploymentFile"
  rm -rf "$runDir/evidence" "$runDir/guardCache" "$runDir"/install*
  echo "logs kept in $logDir"
  exit "$status"
}

say "preflight"
[ ! -e "$demoEnv" ] || { echo "demo/demo.env already exists, move it aside first" >&2; exit 1; }
[ ! -f "$repoDir/demo/logs/pids" ] || { echo "demo is running, run demo/stop.sh first" >&2; exit 1; }
for port in $anvilPort $detectorsPort $watcherPort 4873 4880 4101 4102 4103 4201 4202 4203 3000; do
  ! lsof -nP -iTCP:"$port" -sTCP:LISTEN > /dev/null 2>&1 || { echo "port $port is in use" >&2; exit 1; }
done
rm -rf "$runDir"
mkdir -p "$logDir" "$repoDir/data" "$repoDir/snapshots"
: > "$pidFile"
trap teardown EXIT
trap 'exit 130' INT TERM

if [ ! -f "$keyFile" ]; then
  mkdir -p "$(dirname "$keyFile")"
  (cd "$opsDir" && node --input-type=module -e '
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
for (const role of ["DEPLOYER", "STATIC_SCRIPTS", "SANDBOX_CANARY", "ADVISORY_FEED", "GUARDIAN", "SNAPSHOT_SIGNER", "GUARD_REPORTER"]) {
  const key = generatePrivateKey();
  console.log(`${role}_PRIVATE_KEY=${key}`);
  console.log(`${role}_ADDRESS=${privateKeyToAccount(key).address}`);
}') > "$keyFile"
  chmod 600 "$keyFile"
  echo "generated anvil only keys in $keyFile"
fi
set -a
. "$keyFile"
set +a

say "1. anvil, funding, SealRegistry deploy"
launch anvil "$foundryBin/anvil" --host 127.0.0.1 --port "$anvilPort" --chain-id 31337 --block-time 1
waitUntil "anvil answers" 20 "$foundryBin/cast" chain-id --rpc-url "$rpcUrl"
for address in "$DEPLOYER_ADDRESS" "$STATIC_SCRIPTS_ADDRESS" "$SANDBOX_CANARY_ADDRESS" "$ADVISORY_FEED_ADDRESS" "$GUARDIAN_ADDRESS" "$SNAPSHOT_SIGNER_ADDRESS"; do
  "$foundryBin/cast" rpc --rpc-url "$rpcUrl" anvil_setBalance "$address" 0x56BC75E2D63100000 > /dev/null
done
[ -e "$deploymentFile" ] || createdDeployment=true
(cd "$repoDir/contracts" && env \
  DETECTOR_ADDRESSES="$STATIC_SCRIPTS_ADDRESS,$SANDBOX_CANARY_ADDRESS,$ADVISORY_FEED_ADDRESS" \
  QUORUM=2 DISPUTE_WINDOW_SECONDS=120 VOTE_LIFETIME_SECONDS=86400 MAX_SEALS_PER_DAY=20 \
  "$foundryBin/forge" script script/Deploy.s.sol:Deploy --rpc-url "$rpcUrl" --broadcast) > "$logDir/deploy.log" 2>&1 || fail "forge script deploy, see $logDir/deploy.log"
registryAddress=$(node -p 'require(process.argv[1]).sealRegistry' "$deploymentFile")
startBlock=$(node -p 'require(process.argv[1]).blockNumber' "$deploymentFile")
[ "$(castCall 'quorum()(uint16)')" = 2 ] || fail "SealRegistry quorum is 2"
pass "anvil up, 6 keys funded, SealRegistry $registryAddress at block $startBlock, quorum 2 of 3"

say "2. build and start services"
cat > "$demoEnv" << EOF
MOCK_REGISTRY_PORT=4873
MOCK_REGISTRY_URL=http://127.0.0.1:4873
NPM_REGISTRY_URL=http://127.0.0.1:4873
CANARY_SINK_PORT=4880
CANARY_SINK_URL=http://127.0.0.1:4880
POLL_INTERVAL_SECONDS=5
DATABASE_PATH=data/watcher.sqlite
SNAPSHOT_PATH=snapshots/snapshot.json
CHAIN_ID=31337
RPC_URL=$rpcUrl
EXPLORER_URL=$rpcUrl
NATIVE_SYMBOL=ETH
REGISTRY_ADDRESS=$registryAddress
REGISTRY_START_BLOCK=$startBlock
GUARD_FALLBACK_MIN_AGE_DAYS=
GUARD_ALLOW_NON_REGISTRY_SOURCES=
GUARD_MIN_AGE_DAYS=
GUARD_SNAPSHOT_URL=$watcherUrl/snapshot
GUARD_SNAPSHOT_SIGNER=$SNAPSHOT_SIGNER_ADDRESS
GUARD_SNAPSHOT_MAX_AGE_SECONDS=900
GUARD_CACHE_DIR=$runDir/guardCache
GUARD_REPORT_URL=$watcherUrl/reports
GUARD_REPORTER_PRIVATE_KEY=$GUARD_REPORTER_PRIVATE_KEY
EOF
chmod 600 "$demoEnv"
createdDemoEnv=true
set -a
. "$demoEnv"
set +a
sh demo/reset.sh > "$logDir/reset.log" 2>&1
sh demo/setup.sh > "$logDir/setup.log" 2>&1 || fail "demo/setup.sh, see $logDir/setup.log"
docker rm --force canarysink > /dev/null 2>&1 || true
pass "demo tarballs packed, cordoncanarysink image built, services installed with scripts disabled"

launch detectors env DETECTORS_PORT="$detectorsPort" EVIDENCE_DIR="$runDir/evidence" SANDBOX_IMAGE="$sandboxImage" \
  OSV_API_URL=https://api.osv.dev node --experimental-strip-types services/detectors/src/server.ts
waitUntil "detectors health" 30 healthy "$detectorsUrl"
sh demo/start.sh > "$logDir/start.log" 2>&1 || fail "demo/start.sh, see $logDir/start.log"
launch watcher env WATCHER_PORT="$watcherPort" DETECTORS_URL="$detectorsUrl" REGISTRY_START_BLOCK="$startBlock" \
  SNAPSHOT_SIGNER_PRIVATE_KEY="$SNAPSHOT_SIGNER_PRIVATE_KEY" GUARD_REPORTER_ADDRESSES="$GUARD_REPORTER_ADDRESS" \
  DASHBOARD_ORIGIN=http://127.0.0.1:3000 node --experimental-strip-types services/watcher/src/server.ts
waitUntil "watcher health" 30 healthy "$watcherUrl"
waitUntil "first signed snapshot" 30 curl -fs "$watcherUrl/snapshot"
waitUntil "ordersApi serves before publish" 30 serviceAnswers 4101 200 orders
waitUntil "watcher scans startup version 1.4.0" 180 evidenceAtLeast 2
pass "detectors :$detectorsPort, watcher :$watcherPort, mock registry, canary sink, 3 services with sidecars, 1.4.0 scanned clean"

if [ "$hold" = true ]; then
  say "dashboard"
  launch dashboard env NEXT_PUBLIC_CHAIN_ID=31337 NEXT_PUBLIC_RPC_URL="$rpcUrl" NEXT_PUBLIC_EXPLORER_URL="$rpcUrl" NEXT_PUBLIC_NATIVE_SYMBOL=ETH \
    NEXT_PUBLIC_REGISTRY_ADDRESS="$registryAddress" NEXT_PUBLIC_WATCHER_URL="$watcherUrl" NEXT_PUBLIC_DETECTORS_URL="$detectorsUrl" \
    NEXT_PUBLIC_DEMO=true NEXT_PUBLIC_MOCK_REGISTRY_URL="$MOCK_REGISTRY_URL" NEXT_PUBLIC_SNAPSHOT_SIGNER="$SNAPSHOT_SIGNER_ADDRESS" \
    sh -c 'cd "$1" && exec node node_modules/next/dist/bin/next dev -H 127.0.0.1' sh "$repoDir/apps/dashboard"
  waitUntil "dashboard answers" 180 curl -fs "$dashboardUrl"
  pass "dashboard $dashboardUrl"
  echo
  echo "The local stack is up. Open $dashboardUrl/demo and publish $demoPackage@$sealedVersion."
  echo "Guard commands need this environment first: set -a; . demo/demo.env; set +a"
  echo "Press Ctrl+C to stop everything and clean up."
  while true; do sleep 3600; done
fi

say "3. publish $demoPackage@$sealedVersion and watch it seal"
sealKey=$(castCall 'keyOf(string,string,string)(bytes32)' npm "$demoPackage" "$sealedVersion")
curl -fsS -X POST "$NPM_REGISTRY_URL/_demo/publish" -H "content-type: application/json" \
  -d "{\"name\":\"$demoPackage\",\"version\":\"$sealedVersion\"}" > /dev/null || fail "publish through mock registry"
pass "published, key $sealKey"
waitUntil "watcher records the publish" 30 curl -fs "$watcherUrl/stopwatch/$sealKey"
pass "watcher recorded the publish and scheduled the scan"
waitUntil "key Sealed on anvil" 240 isSealed
hasVoted "$STATIC_SCRIPTS_ADDRESS" || fail "staticScripts voted"
hasVoted "$SANDBOX_CANARY_ADDRESS" || fail "sandboxCanary voted"
pass "staticScripts and sandboxCanary voted, key Sealed on anvil"
waitUntil "signed snapshot lists the seal" 60 snapshotSeals
pass "signed snapshot (served and $SNAPSHOT_PATH) lists the key as Sealed"
waitUntil "ordersApi answers 503 is sealed" 60 serviceAnswers 4101 503 "is sealed"
waitUntil "notifyWorker answers 503 is sealed" 60 serviceAnswers 4103 503 "is sealed"
serviceAnswers 4102 200 search || fail "searchApi on 1.4.0 answers 200"
pass "ordersApi and notifyWorker answer 503 is sealed, searchApi on 1.4.0 answers 200"
waitUntil "stopwatch complete" 60 stopwatchComplete
timings=$(node -e '
const watch = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
const base = Date.parse(watch.publishedAt);
const gap = (at) => `+${((Date.parse(at) - base) / 1000).toFixed(1)}s`;
console.log(`stopwatch ${watch.name}@${watch.version} simulated ${watch.simulated}`);
console.log(`  publish        ${watch.publishedAt}`);
console.log(`  first verdict  ${watch.firstVerdictAt}  ${gap(watch.firstVerdictAt)}`);
console.log(`  quorum         ${watch.sealedAt}  ${gap(watch.sealedAt)}`);
console.log(`  first block    ${watch.firstBlockAt}  ${gap(watch.firstBlockAt)}`);' "$runDir/stopwatch.json")
printf '%s\n' "$timings"
pass "watcher stopwatch has publish, first verdict, quorum and first block"
installDir=$(mktemp -d "$runDir/installXXXXXX")
cp demo/services/ordersApi/package.json demo/services/ordersApi/package-lock.json "$installDir"
installCode=0
guard install --lockfile "$installDir/package-lock.json" > "$logDir/install.json" 2> "$logDir/install.err" || installCode=$?
[ "$installCode" = 1 ] && [ ! -e "$installDir/node_modules" ] || fail "cordon install exits 1 without npm ci (exit $installCode)"
pass "cordon install on a copy of ordersApi exits 1 and runs no npm ci"

say "4. CROPS: RPC off, then watcher off"
stopProcess anvil
waitUntil "anvil is down" 10 bash -c "! curl -fs -X POST -H 'content-type: application/json' -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_chainId\"}' $rpcUrl"
checkBlocksFromSnapshot "RPC off: cordon check blocks 1.4.1 from the watcher signed snapshot" rpcOff
stopProcess watcher
checkBlocksFromSnapshot "RPC and watcher off: cordon check blocks 1.4.1 from the cached signed snapshot" bothOff
grep -q "snapshot fetch failed" "$runDir/bothOff.err" || fail "second check read the cache, not the watcher"
pass "the last check could not reach the watcher and used the cache"
