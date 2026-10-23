#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Install Node.js 22 or newer: https://nodejs.org/"; exit 1; }
node scripts/start.cjs
