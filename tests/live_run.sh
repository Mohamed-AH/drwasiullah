#!/usr/bin/env bash
# Live layer on the PUBLIC site: throw-away local copy (seeded D1, public dev server with LIVE_TTL=0). Needs node 22, Playwright + axe-core (see CLAUDE.md).
set -euo pipefail
cd "$(dirname "$0")/.."
P=$(mktemp -d); PORT=${PORT:-8788}
node --no-warnings scripts/db.mjs seed --out "$P/seed.sql" >/dev/null
npx --yes wrangler@4 d1 migrations apply drwasiullah --local --persist-to "$P" >/dev/null 2>&1
npx wrangler@4 d1 execute drwasiullah --local --persist-to "$P" --file "$P/seed.sql" >/dev/null 2>&1
setsid npx wrangler@4 dev --local --persist-to "$P" --port "$PORT" --var LIVE_TTL:0 > "$P/dev.log" 2>&1 &
PID=$!; trap 'kill -- -$PID 2>/dev/null || true' EXIT
for i in $(seq 1 90); do curl -s -o /dev/null "http://localhost:$PORT/" && break; sleep 1; done
BASE=http://localhost:$PORT PERSIST=$P node tests/live_check.mjs
