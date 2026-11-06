#!/bin/sh
set -eu
. "$(dirname "$0")/env.sh"
export HOST=127.0.0.1
logDir="$demoDir/logs"
pidFile="$logDir/pids"
mkdir -p "$logDir"
[ ! -f "$pidFile" ] || { echo "demo already running, run demo/stop.sh first" >&2; exit 1; }

launch() {
  name=$1
  shift
  "$@" > "$logDir/$name.log" 2>&1 &
  echo $! >> "$pidFile"
}

launch mockRegistry node "$demoDir/mockRegistry/server.js"
launch canarySink node "$demoDir/canarySink/server.js"
waitFor "$NPM_REGISTRY_URL/_changes"

for entry in ordersApi:4101:4201 searchApi:4102:4202 notifyWorker:4103:4203; do
  service=${entry%%:*}
  ports=${entry#*:}
  servicePort=${ports%%:*}
  guardPort=${ports#*:}
  launch "${service}Guard" node --experimental-strip-types "$repoDir/packages/guard/src/cli.ts" sidecar \
    --lockfile "$demoDir/services/$service/package-lock.json" --service "$service" --port "$guardPort"
  launch "$service" env SERVICE_PORT="$servicePort" GUARD_SIDECAR_URL="http://127.0.0.1:$guardPort" \
    node "$demoDir/services/$service/server.js"
done

waitFor "http://127.0.0.1:$CANARY_SINK_PORT/received"
for port in 4201 4202 4203; do waitFor "http://127.0.0.1:$port/status"; done
echo "mockRegistry $NPM_REGISTRY_URL, canarySink http://127.0.0.1:$CANARY_SINK_PORT"
echo "ordersApi :4101 (guard :4201), searchApi :4102 (guard :4202), notifyWorker :4103 (guard :4203)"
echo "logs in $logDir, stop with demo/stop.sh"
