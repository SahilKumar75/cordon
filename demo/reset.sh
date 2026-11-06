#!/bin/sh
set -eu
. "$(dirname "$0")/env.sh"
sh "$demoDir/stop.sh"

targets="$demoDir/mockRegistry/storage
$demoDir/canarySink/received
$demoDir/logs"
if [ -n "${DATABASE_PATH:-}" ]; then
  targets="$targets
$DATABASE_PATH
$DATABASE_PATH-wal
$DATABASE_PATH-shm"
fi
[ -z "${SNAPSHOT_PATH:-}" ] || targets="$targets
$SNAPSHOT_PATH"

resolved=$(printf '%s\n' "$targets" | node -e '
const { basename, isAbsolute, relative, resolve, sep } = require("node:path");
const repo = process.argv[1];
const lines = require("node:fs").readFileSync(0, "utf8").split("\n").filter(Boolean);
for (const line of lines) {
  const full = resolve(repo, line);
  const inside = relative(repo, full);
  const outside = inside === "" || inside.startsWith("..") || isAbsolute(inside);
  if (outside || inside.split(sep)[0] === "contracts" || basename(full).startsWith(".env")) {
    console.error(`refusing to delete ${full}: only demo data inside ${repo} is cleared`);
    process.exit(1);
  }
  console.log(full);
}' "$repoDir")

printf '%s\n' "$resolved" | while IFS= read -r target; do
  rm -rf "$target"
  echo "cleared $target"
done
echo "reset done: the next demo/start.sh begins at seq 1 with an empty timeline"
