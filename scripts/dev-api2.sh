#!/usr/bin/env bash
# Keep api2 + SSH PG tunnel running for local Better Auth.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/api2"

REMOTE="${API2_SSH_HOST:-root@60.205.9.135}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
LOG=/tmp/api2.log

ensure_tunnel() {
  if nc -z 127.0.0.1 5433 2>/dev/null; then
    return 0
  fi
  echo "[api2-dev] opening SSH tunnel 5433 -> $REMOTE:5432"
  ssh -i "$SSH_KEY" -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 \
    -f -N -L 5433:127.0.0.1:5432 "$REMOTE"
}

ensure_tunnel
echo "[api2-dev] starting (log: $LOG)"
exec node --watch --env-file=.env src/server.js >>"$LOG" 2>&1
