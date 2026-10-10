/* Usage counters: the public Worker's POST /api/event and the browser code that sends it (play after 30 s of real listening, download, video play).
   Run through tests/analytics_run.sh (local dev server of the PUBLIC site on :8788, seeded local D1). Fixtures: AUDIO_DIR/small.mp3 (>= 60 s). */
import { chromium } from "playwright";
import { execSync } from "node:child_process";

const BASE = process.env.BASE || "http://localhost:8788", PERSIST = process.env.PERSIST, DIR = process.env.AUDIO_DIR || "/tmp/aud";
const AUDIO = "tadrib-0001", VIDEO = process.env.VIDEO_ID;
let bad = 0;
const check = (name, cond, extra = "") => { if (!cond) bad++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + String(extra)}`); };
const rows = () => JSON.parse(execSync(`npx wrangler@4 d1 execute drwasiullah -c wrangler.jsonc --local --persist-to ${PERSIST} --json --command "select lesson_id, event, n from stats_daily order by lesson_id, event"`, { stdio: ["ignore", "pipe", "ignore"] }).toString())[0].results;
const send = (body, headers = {}) => fetch(BASE + "/api/event", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "sec-fetch-site": "same-origin", ...headers } });

/* the endpoint itself */
check("valid event: 204", (await send({ id: AUDIO, e: "play" })).status === 204);
check("same event again counts again", (await send({ id: AUDIO, e: "play" })).status === 204);
check("unknown lesson / bad id / bad kind / junk: 204 but not stored", [(await send({ id: "no-such-lesson", e: "play" })).status, (await send({ id: "a b", e: "play" })).status, (await send({ id: AUDIO, e: "hack" })).status, (await send("{not json")).status].every(s => s === 204));
check("cross-site refused (403)", (await send({ id: AUDIO, e: "play" }, { "sec-fetch-site": "cross-site", origin: "https://evil.example" })).status === 403);
check("GET refused (405)", (await fetch(BASE + "/api/event")).status === 405);
check("oversized body refused", (await send("x".repeat(500), { "content-length": "500" })).status === 413);
let r = rows();
check("only the two valid plays were stored, summed in one row", r.length === 1 && r[0].lesson_id === AUDIO && r[0].event === "play" && r[0].n === 2, JSON.stringify(r));

/* the browser */
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
const fs = await import("node:fs"); const mp3 = fs.readFileSync(`${DIR}/small.mp3`);
async function session(dnt) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (dnt) await ctx.addInitScript(() => Object.defineProperty(navigator, "doNotTrack", { value: "1" }));
  await ctx.route(/\.(mp3|m4a)(\?.*)?$/, route => route.fulfill({ status: 200, headers: { "content-type": "audio/mpeg", "content-length": String(mp3.length), "accept-ranges": "bytes", "access-control-allow-origin": "*" }, body: mp3 }));
  await ctx.route(/youtube|ytimg/, route => route.abort());
  const p = await ctx.newPage(); const events = [];
  p.on("request", q => { if (q.url().endsWith("/api/event")) events.push(q.postData()); });
  return { ctx, p, events };
}
let s = await session(false);
await s.p.goto(`${BASE}/lesson/${AUDIO}/`);
await s.p.waitForSelector("#aud");
await s.p.evaluate(() => { const a = document.getElementById("aud"); a.playbackRate = 8; a.play(); });
await s.p.waitForFunction(() => document.getElementById("aud").currentTime > 1, null, { timeout: 15000 });
check("no play event before 30 s are really listened", s.events.length === 0, s.events.join());
await s.p.evaluate(() => { const a = document.getElementById("aud"); a.currentTime = 40; });   // a jump forward must not count as listening
await s.p.waitForTimeout(1500);
check("seeking forward does not count as listening", s.events.length === 0, s.events.join());
await s.p.evaluate(() => { const a = document.getElementById("aud"); a.currentTime = 2; });
await s.p.waitForFunction(() => document.getElementById("aud").currentTime > 25, null, { timeout: 20000 }).catch(() => {});
await s.p.waitForTimeout(3000);
check("play event sent once after 30 s of listening", s.events.length === 1 && JSON.parse(s.events[0]).e === "play" && JSON.parse(s.events[0]).id === AUDIO, s.events.join());
await s.p.waitForTimeout(2500);
check("and never twice for the same page", s.events.length === 1, s.events.join());
await s.p.click("a[data-dl]");
await s.p.waitForTimeout(800);
check("download click sends a download event", s.events.some(x => JSON.parse(x).e === "download" && JSON.parse(x).id === AUDIO), s.events.join());
await s.ctx.close();

if (VIDEO) {
  s = await session(false);
  await s.p.goto(`${BASE}/lesson/${VIDEO}/`);
  await s.p.click(".lite-play");
  await s.p.waitForTimeout(800);
  check("video play button sends a watch event", s.events.length === 1 && JSON.parse(s.events[0]).e === "watch" && JSON.parse(s.events[0]).id === VIDEO, s.events.join());
  await s.ctx.close();
}

s = await session(true);
await s.p.goto(`${BASE}/lesson/${AUDIO}/`); await s.p.waitForSelector("#aud");
await s.p.click("a[data-dl]"); await s.p.waitForTimeout(800);
check("Do Not Track: nothing is sent", s.events.length === 0, s.events.join());
await s.ctx.close(); await browser.close();

r = rows();
const get = (id, e) => (r.find(x => x.lesson_id === id && x.event === e) || {}).n;
check("stored counts: play 3 (2 direct + 1 browser), download 1", get(AUDIO, "play") === 3 && get(AUDIO, "download") === 1, JSON.stringify(r));
if (VIDEO) check("stored: watch 1", get(VIDEO, "watch") === 1, JSON.stringify(r));
if (bad) { console.error(`!! ${bad} failed`); process.exit(1); }
console.log("all analytics checks passed");
