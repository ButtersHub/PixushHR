#!/usr/bin/env bash
set -euo pipefail
NAME="$1"
ARGS="$2"
ENGINE_URL="${ENGINE_URL:-http://engine:3000}"
curl -sS -X POST "$ENGINE_URL/tools/execute" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"$NAME\", \"args\": $ARGS}"
