#!/usr/bin/env bash
set -euo pipefail
PAYLOAD="$1"
ENGINE_URL="${ENGINE_URL:-http://engine:3000}"
curl -sS -X POST "$ENGINE_URL/side-effect" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
