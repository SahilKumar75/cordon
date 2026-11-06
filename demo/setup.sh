#!/bin/sh
set -eu
. "$(dirname "$0")/env.sh"
nodeImage=node:22-alpine@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914

sh "$demoDir/poisonedPackage/pack.sh"
docker build --build-arg NODE_IMAGE=$nodeImage -t bulkheadcanarysink "$demoDir/canarySink"

setupStorage=$(mktemp -d)
HOST=127.0.0.1 MOCK_REGISTRY_STORAGE="$setupStorage" node "$demoDir/mockRegistry/server.js" > "$setupStorage/registry.log" 2>&1 &
registryPid=$!
trap 'kill $registryPid; wait $registryPid 2> /dev/null || true; rm -rf "$setupStorage"' EXIT
waitFor "$NPM_REGISTRY_URL/_changes"
curl -fsS -X POST "$NPM_REGISTRY_URL/_demo/publish" -H "content-type: application/json" -d '{"name":"@bulkheaddemo/colorkit","version":"1.4.1"}' > /dev/null

for service in ordersApi searchApi notifyWorker; do
  (cd "$demoDir/services/$service" && npm ci --ignore-scripts --no-audit --no-fund --registry "$NPM_REGISTRY_URL/")
done
echo "setup done: tarballs packed, canary sink image built, services installed with scripts disabled"
