#!/bin/sh
set -eu
pidFile="$(cd "$(dirname "$0")" && pwd)/logs/pids"
[ -f "$pidFile" ] || { echo "demo is not running" >&2; exit 0; }
xargs kill < "$pidFile" 2>/dev/null || true
rm "$pidFile"
