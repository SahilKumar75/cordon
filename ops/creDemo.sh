#!/usr/bin/env bash
set -euo pipefail

cre=$(command -v cre || echo "$HOME/.cre/bin/cre")
cd "$(dirname "$0")/../cre"
[ -f .env ] || { echo "cre/.env with CRE_ETH_PRIVATE_KEY is missing; a dry run never spends it, see README Chainlink CRE" >&2; exit 1; }

echo "Chainlink CRE workflow cordonAdvisory, local simulation only, dry run, no transaction."
for target in '{"name":"@tanstack/react-router","version":"1.169.5"}' '{"name":"ms","version":"2.1.3"}'; do
  echo
  echo "== simulate $target"
  "$cre" workflow simulate cordonAdvisory --target staging-settings --non-interactive --trigger-index 0 --http-payload "$target" 2>&1 \
    | grep -E "malicious|clean|writeReport|Workflow Simulation Result|error|Error" || true
done
