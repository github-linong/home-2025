#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
source ~/.nvm/nvm.sh 2>/dev/null || true
nvm use 22 2>/dev/null || true
npm run build:web
echo "Static site built → apps/web/dist"
