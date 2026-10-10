#!/usr/bin/env bash
# Runs the usage-counter test on a throw-away local copy of the PUBLIC site + database. Needs node 22, ffmpeg, Playwright (see CLAUDE.md).
set -euo pipefail
cd "$(dirname "$0")/.."
P=$(mktemp -d); PORT=${PORT:-8788}
node --no-warnings scripts/db.mjs seed --out "$P/seed.sql" >/dev/null
npx --yes wrangler@4 d1 migrations apply drwasiullah --local --persist-to "$P" >/dev/null 2>&1
npx wrangler@4 d1 execute drwasiullah --local --persist-to "$P" --file "$P/seed.sql" >/dev/null 2>&1
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=300:duration=90" -ac 1 -b:a 48k "$P/small.mp3"
VIDEO_ID=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("site/catalogue.json","utf8")).lessons[0].id)')
setsid npx wrangler@4 dev --local --persist-to "$P" --port "$PORT" > "$P/dev.log" 2>&1 &
PID=$!; trap 'kill -- -$PID 2>/dev/null || true' EXIT
for i in $(seq 1 90); do curl -s -o /dev/null "http://localhost:$PORT/" && break; sleep 1; done
BASE=http://localhost:$PORT PERSIST=$P AUDIO_DIR=$P VIDEO_ID=$VIDEO_ID node tests/analytics_check.mjs
