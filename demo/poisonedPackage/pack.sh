#!/bin/sh
set -e
cd "$(dirname "$0")"
mkdir -p dist
npm pack --ignore-scripts --pack-destination dist ./v1.4.0 ./v1.4.1
