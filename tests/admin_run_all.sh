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
BASE=http://localhost:$PORT node tests/admin_order.mjs | grep -E "FAIL|passed|!!"
BASE=http://localhost:$PORT node tests/admin_live.mjs | grep -E "FAIL|passed|!!"

# the chain steps below overwrite these tracked data files temporarily: keep copies and put them back on exit
KEEP=$(mktemp -d); for f in overrides order schedule; do [ -f "site/data/$f.json" ] && cp "site/data/$f.json" "$KEEP/$f.json"; done
restore() { for f in overrides order schedule; do if [ -f "$KEEP/$f.json" ]; then cp "$KEEP/$f.json" "site/data/$f.json"; else rm -f "site/data/$f.json"; fi; done; kill -- -$PID 2>/dev/null || true; }
trap restore EXIT
# --- chain: patches saved in the portal -> overrides.json (Publish) -> build; and the daily mirror must leave the patches alone ---
DB=$(ls "$P"/v3/d1/miniflare-D1DatabaseObject/*.sqlite | head -1)
node --no-warnings scripts/db.mjs export --db "$DB" --out "$P/pub" --only data/overrides.json
node -e '
const o = JSON.parse(require("fs").readFileSync(process.argv[1] + "/pub/data/overrides.json", "utf8"));
const v = process.argv[2], l = o.lessons[v], s = o.series.muslim;
const ok = l && l.title === "عنوان مصحح نهائي" && l.n === 5 && l.hd === "1440-6-5" && /^\d{4}-\d{2}-\d{2}$/.test(l.date) && !("hidden" in l) && s && s.title === "شرح صحيح مسلم (مصحح)" && s.description === "وصف جديد";
console.log(ok ? "ok   overrides.json exported from the portal edits" : "FAIL overrides.json: " + JSON.stringify(o)); process.exit(ok ? 0 : 1)' "$P" "$VIDEO_ID"
cp "$P/pub/data/overrides.json" site/data/overrides.json
node scripts/build.mjs | tail -1
node -e '
const c = JSON.parse(require("fs").readFileSync("dist/catalogue.json", "utf8")), v = process.argv[1];
const l = c.lessons.find(x => x.id === v), m = c.series.find(x => x.id === "muslim");
const ok = l && l.title === "عنوان مصحح نهائي" && l.n === 5 && m && m.title === "شرح صحيح مسلم (مصحح)";
console.log(ok ? "ok   the built site shows the patched YouTube lesson and series" : "FAIL build: " + JSON.stringify([l, m])); process.exit(ok ? 0 : 1)' "$VIDEO_ID"
grep -q "عنوان مصحح نهائي" "dist/lesson/$VIDEO_ID/index.html" && echo "ok   the pre-rendered lesson page carries the patched title" || { echo "FAIL pre-rendered page"; exit 1; }
cp "$KEEP/overrides.json" site/data/overrides.json 2>/dev/null || rm -f site/data/overrides.json
node --no-warnings scripts/db.mjs mirror-catalogue --out "$P/mirror.sql"
npx wrangler@4 d1 execute drwasiullah $W --file "$P/mirror.sql" >/dev/null 2>&1
CNT=$(npx wrangler@4 d1 execute drwasiullah $W --json --command "select (select count(*) from lessons where origin='catalogue') l, (select count(*) from series where origin='catalogue') s, (select count(*) from overrides) o" 2>/dev/null)
node -e '
const r = JSON.parse(process.argv[1])[0].results[0], want = JSON.parse(require("fs").readFileSync("site/catalogue.json", "utf8"));
const ok = r.l === want.lessons.length && r.s === want.series.length && r.o === 2;
console.log(ok ? `ok   daily mirror re-seeded ${r.l} YouTube lessons / ${r.s} series and left the 2 patches alone` : "FAIL mirror: " + process.argv[1]); process.exit(ok ? 0 : 1)' "$CNT"

# --- chain: the saved order of `tadrib` (left by admin_order.mjs) -> order.json (Publish) -> build: the series page and the player follow it ---
node --no-warnings scripts/db.mjs export --db "$DB" --out "$P/pub" --only data/order.json
cp "$P/pub/data/order.json" site/data/order.json
node scripts/build.mjs | tail -1
node -e '
const fs = require("fs"), o = JSON.parse(fs.readFileSync(process.argv[1] + "/pub/data/order.json", "utf8"));
const t = o.tadrib; const first = fs.readFileSync("dist/lesson/" + t[0] + "/index.html", "utf8");
const page = fs.readFileSync("dist/series/tadrib/index.html", "utf8");
const ok = t && t.length === 110 && t[0] === "tadrib-0002" && !/rel="prev"/.test(first) && /rel="next"/.test(first) && page.indexOf("/lesson/tadrib-0002/") < page.indexOf("/lesson/tadrib-0001/") && !o.muslim;
console.log(ok ? "ok   saved order -> order.json -> built site (series page and previous/next follow it; the reset series is not listed)" : "FAIL order chain: " + JSON.stringify(t && t.slice(0, 4))); process.exit(ok ? 0 : 1)' "$P"
cp "$KEEP/order.json" site/data/order.json 2>/dev/null || rm -f site/data/order.json

# --- chain: schedule edits made in the portal -> schedule.json (Publish) -> the pre-rendered /schedule/ page ---
node --no-warnings scripts/db.mjs export --db "$DB" --out "$P/pub" --only data/schedule.json
cp "$P/pub/data/schedule.json" site/data/schedule.json
node scripts/build.mjs | tail -1
grep -q "ملاحظة جديدة" dist/schedule/index.html && grep -q "حضور" dist/schedule/index.html && echo "ok   schedule edits -> schedule.json -> built /schedule/ page (note and live button)" || { echo "FAIL schedule chain"; exit 1; }
node -e '
const o = JSON.parse(require("fs").readFileSync(process.argv[1] + "/pub/data/schedule.json", "utf8"));
const ok = o.slots.every(s => /^[a-z0-9-]{1,20}$/.test(s.id)) && new Set(o.slots.map(s => s.id)).size === o.slots.length && o.note === "ملاحظة جديدة" && o.live && o.live.url === "https://mixlr.com/wahatualsunnah";
console.log(ok ? "ok   exported schedule: every slot has a unique id, note and live button saved" : "FAIL schedule doc: " + JSON.stringify(o).slice(0, 300)); process.exit(ok ? 0 : 1)' "$P"
cp "$KEEP/schedule.json" site/data/schedule.json 2>/dev/null || true
