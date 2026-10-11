#!/usr/bin/env bash
# Runs every admin test against a throw-away local database and dev server (no Cloudflare account needed).
# Needs: node 22, npx (wrangler is fetched), ffmpeg (makes the audio fixtures), Playwright + Chromium resolvable from the repo (see CLAUDE.md).
set -euo pipefail
cd "$(dirname "$0")/.."
P=$(mktemp -d); A=$P/audio; mkdir -p "$A"; PORT=${PORT:-8791}; W="-c admin/wrangler.jsonc --local --persist-to $P"
node --no-warnings tests/admin_auth.mjs | grep -E "FAIL|passed|!!"
node --no-warnings scripts/db.mjs seed --out "$P/seed.sql" >/dev/null
npx --yes wrangler@4 d1 migrations apply drwasiullah $W >/dev/null 2>&1
npx wrangler@4 d1 execute drwasiullah $W --file "$P/seed.sql" >/dev/null 2>&1
npx wrangler@4 d1 execute drwasiullah $W --command "insert into users(email,role) values ('boss@example.com','admin'),('ed@example.com','editor'),('off@example.com','editor')" >/dev/null 2>&1
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=300:duration=90"  -ac 1 -b:a 48k "$A/small.mp3"
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=500:duration=3600" -ac 1 -b:a 48k "$A/big.mp3"
ffmpeg -loglevel error -y -f lavfi -i "sine=frequency=700:duration=30"  -ac 1 -b:a 48k "$A/t3.mp3"
head -c 3000 /dev/urandom > "$A/fake.mp3"
setsid npx wrangler@4 dev $W --port "$PORT" --var ENV:dev --var GH_API_BASE:http://localhost:8795 --var GH_DISPATCH_TOKEN:testtoken > "$P/dev.log" 2>&1 &
PID=$!; trap 'kill -- -$PID 2>/dev/null || true' EXIT
for i in $(seq 1 40); do curl -s -o /dev/null "http://localhost:$PORT/" && break; sleep 1; done
BASE=http://localhost:$PORT node tests/admin_http.mjs | grep -E "FAIL|passed|!!"
BASE=http://localhost:$PORT AUDIO_DIR=$A node tests/admin_upload.mjs | grep -E "FAIL|passed|!!"
VIDEO_ID=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("site/catalogue.json","utf8")).lessons[0].id)')
BASE=http://localhost:$PORT AUDIO_DIR=$A VIDEO_ID=$VIDEO_ID node tests/admin_edit.mjs | grep -E "FAIL|passed|!!"
