#!/usr/bin/env bash
# Install dependencies and start the vending backend.
# Works from any directory / any PC: it resolves backend-full relative to this
# script, so you can copy the three folders anywhere and just run this.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/../backend-full"

if [ ! -d "$BACKEND_DIR" ]; then
  echo "backend-full/ not found next to scripts/. Keep backend-full, frontend-vending-machine and scripts together." >&2
  exit 1
fi

cd "$BACKEND_DIR"
echo "[start_backend] installing dependencies in $(pwd) ..."
npm install
echo "[start_backend] starting server on http://localhost:3000 ..."
npm start
