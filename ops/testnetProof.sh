#!/bin/bash
set -euo pipefail
repoDir=$(cd "$(dirname "$0")/.." && pwd)
cd "$repoDir"
. "$HOME/.nvm/nvm.sh"
nvm use 22 > /dev/null
set -a
. ./.env
set +a
cacheDir=$(mktemp -d)
lockfile=demo/services/ordersApi/package-lock.json
check() {
  local code=0
  env -i PATH="$PATH" HOME="$HOME" CHAIN_ID="$CHAIN_ID" RPC_URL="$1" REGISTRY_ADDRESS="$REGISTRY_ADDRESS" REGISTRY_START_BLOCK="$REGISTRY_START_BLOCK" \
    GUARD_CACHE_DIR="$cacheDir" NPM_REGISTRY_URL=http://127.0.0.1:4873 GUARD_FALLBACK_MIN_AGE_DAYS=3 \
    node packages/guard/bin/cordon.js check --lockfile "$lockfile" > "$cacheDir/report.json" 2> "$cacheDir/err.txt" || code=$?
  node -e 'const r = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); console.log(`exit ${process.argv[2]}, outcome ${r.outcome}, listSource ${r.listSource}, blocked ${r.blocked.map((b) => `${b.name}@${b.version}`).join(",") || "none"}`)' "$cacheDir/report.json" "$code"
  sed 's/^/  guard: /' "$cacheDir/err.txt"
}
echo "== guard against $RPC_URL, registry $REGISTRY_ADDRESS, no watcher, no snapshot URL"
check "$RPC_URL"
echo
echo "== same guard with the RPC off (http://127.0.0.1:9), still no watcher"
check http://127.0.0.1:9
rm -rf "$cacheDir"
