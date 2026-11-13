#!/usr/bin/env bash
set -euo pipefail

CONFIGS_DIR="$(cd "$(dirname "$0")" && pwd)"
if ! command -v python3 >/dev/null 2>&1; then
  echo "setup.sh requires Python 3. Install it, then rerun this command." >&2
  exit 1
fi
exec python3 "$CONFIGS_DIR/scripts/setup.py" "$@"
