#!/bin/bash
set -euo pipefail
name=${1:?usage: bash ops/packGuard.sh <npm package name> [version]}
version=${2:-0.1.0}
repoDir=$(cd "$(dirname "$0")/.." && pwd)
out="$repoDir/data/npmPackage"
rm -rf "$out"
mkdir -p "$out/dist"
cd "$repoDir/packages/guard"
echo 'import { main } from "./src/cli.ts"; main();' | npx --yes esbuild@0.24.2 --bundle --platform=node --format=esm --target=node22 \
  --sourcefile=entry.ts --loader=ts --define:import.meta.filename='""' \
  --external:viem --external:tar --external:zod \
  --banner:js='#!/usr/bin/env node' --outfile="$out/dist/cordon.js" --log-level=warning
chmod +x "$out/dist/cordon.js"
cp "$repoDir/LICENSE" "$out/LICENSE"
node -e '
const [name, version, out] = process.argv.slice(1);
const pkg = {
  name, version,
  description: "Guard for Cordon: blocks npm package versions sealed in the SealRegistry contract before they install or run. Testnet prototype.",
  license: "MIT",
  type: "module",
  bin: { cordon: "dist/cordon.js" },
  files: ["dist", "README.md", "LICENSE"],
  engines: { node: ">=22" },
  repository: { type: "git", url: "git+https://github.com/SahilKumar75/cordon.git" },
  homepage: "https://github.com/SahilKumar75/cordon#readme",
  keywords: ["npm", "supply chain", "security", "lockfile", "ethereum"],
  dependencies: { tar: "^7.4.0", viem: "^2.21.0", zod: "^3.25.0" },
};
require("node:fs").writeFileSync(`${out}/package.json`, JSON.stringify(pkg, null, 2) + "\n");
' "$name" "$version" "$out"
cat > "$out/README.md" << EOF
# $name

The command line guard of [Cordon](https://github.com/SahilKumar75/cordon), a circuit breaker for npm dependencies. It reads the Sealed list from the SealRegistry contract and blocks sealed package versions in your lockfile before npm installs or runs them.

Testnet prototype: npm lockfile v2 and v3 only, and one operator runs every detector and the guardian key today.

\`\`\`sh
export CHAIN_ID=84532 RPC_URL=https://sepolia.base.org
export REGISTRY_ADDRESS=0x07DCC100d48fBA912fEf3e14F61d1162596a0E8F REGISTRY_START_BLOCK=55415999
export GUARD_CACHE_DIR=\$HOME/.cordon
npx $name check --lockfile path/to/project
\`\`\`

Exit code 0 means allowed, 1 blocked, 2 unavailable. Other commands: install, audit, rollback, sidecar. Details, limits and the demo are in the [repository](https://github.com/SahilKumar75/cordon).
EOF
echo "built $name@$version in $out"
