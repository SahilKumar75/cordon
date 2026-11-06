#!/usr/bin/env bash
set -euo pipefail

repoDir=$(cd "$(dirname "$0")/.." && pwd)
cd "$repoDir"

cat << 'EOF'
Cordon terminal demo, local chain, real time, no testnet and no keys of yours.

What runs:
  anvil with SealRegistry, a mock npm registry, the detectors and the watcher
  publish @cordondemo/colorkit 1.4.1, a demo package whose postinstall only touches a canary value
  two detectors vote, SealRegistry seals 1.4.1 at quorum 2 of 3
  cordon install refuses, cordon check blocks, cordon rollback proposes 1.4.0, cordon audit finds it
  RPC off: cordon check still blocks from the signed snapshot
  RPC and watcher off: cordon check still blocks from the cached snapshot

The detectors here are run by us and are simulated operators.
EOF

exec bash "$repoDir/ops/e2eLocal.sh"
