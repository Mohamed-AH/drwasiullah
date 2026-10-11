/* The live layer on the PUBLIC site: GET /api/live and what the browser shows (banner strip, announcements, "no lesson tonight" badges).
   Run through tests/live_run.sh (local public dev server with LIVE_TTL=0 and a seeded local D1). Needs Playwright + axe-core. */
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";

const BASE = process.env.BASE || "http://localhost:8788", PERSIST = process.env.PERSIST;
const axeSrc = fs.readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
let bad = 0;
const check = (name, cond, extra = "") => { if (!cond) bad++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + JSON.stringify(extra)}`); };
const sql = text => { const f = `${PERSIST}/fixtures-${Date.now()}.sql`; fs.writeFileSync(f, text); execSync(`npx wrangler@4 d1 execute drwasiullah -c wrangler.jsonc --local --persist-to ${PERSIST} --file ${f}`, { stdio: "ignore" }); };
const q = s => "'" + s.replace(/'/g, "''") + "'";
const utc = ms => new Date(Date.now() + ms).toISOString().slice(0, 19).replace("T", " ");
const DAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/* the schedule slot we attach notices to: the first slot of the published schedule file, on its first weekday, within the next 7 days */
const sched = JSON.parse(fs.readFileSync("site/data/schedule.json", "utf8"));
const slotIdx = sched.slots.findIndex(s => !s.pending), slot = sched.slots[slotIdx], slotId = /^[a-z0-9-]{1,20}$/.test(slot.id || "") ? slot.id : "s" + (slotIdx + 1);
const wd = DAYS.indexOf(slot.days[0].replace("الاثنين", "الإثنين"));
let notice = null;
for (let i = 0; i < 8 && !notice; i++) { const d = new Date(Date.now() + 3 * 3600e3 + i * 864e5); if (d.getUTCDay() === wd) notice = d.toISOString().slice(0, 10); }
const past = new Date(Date.now() + 3 * 3600e3 - 3 * 864e5).toISOString().slice(0, 10);
const XSS = `<img src=x onerror="window.__x=1">`;

sql(`
INSERT INTO banners (text, link, kind, starts_at, ends_at, dismissible, active) VALUES
 (${q("بانر نشط")}, ${q("https://example.org/b")}, 'info', NULL, NULL, 1, 1),
 (${q("بانر منتهٍ")}, NULL, 'info', ${q(utc(-2 * 864e5))}, ${q(utc(-864e5))}, 1, 1),
 (${q("بانر قادم")}, NULL, 'info', ${q(utc(864e5))}, NULL, 1, 1),
 (${q("بانر متوقف")}, NULL, 'info', NULL, NULL, 1, 0),
 (${q("عاجل " + XSS)}, ${q("javascript:alert(1)")}, 'urgent', NULL, NULL, 0, 1);
INSERT INTO announcements (title, body, link, link_label, pinned, status, publish_at, created_at) VALUES
 (${q("إعلان قديم")}, ${q("نص قديم")}, NULL, NULL, 0, 'published', NULL, ${q(utc(-5 * 864e5))}),
 (${q("إعلان حديث")}, ${q("السطر الأول\nالسطر الثاني")}, ${q("https://example.org/n")}, ${q("اقرأ المزيد")}, 0, 'published', NULL, ${q(utc(-3600e3))}),
 (${q("إعلان مثبّت")}, ${q("نص")}, NULL, NULL, 1, 'published', NULL, ${q(utc(-9 * 864e5))}),
 (${q("مسودة لا تظهر")}, ${q("x")}, NULL, NULL, 0, 'draft', NULL, ${q(utc(-3600e3))}),
 (${q("مجدول لا يظهر")}, ${q("x")}, NULL, NULL, 0, 'published', ${q(utc(2 * 864e5))}, ${q(utc(-3600e3))}),
 (${q("حقن " + XSS)}, ${q("نص " + XSS)}, ${q("javascript:alert(2)")}, ${q("زر")}, 0, 'published', NULL, ${q(utc(-7200e3))}),
 (${q("إعلان رابع")}, ${q("نص")}, NULL, NULL, 0, 'published', NULL, ${q(utc(-4 * 864e5))});
INSERT INTO schedule_notices (slot, day, kind, note) VALUES (${q(slotId)}, ${q(notice)}, 'cancelled', ${q("لعذر طارئ")}), (${q(slotId)}, ${q(past)}, 'cancelled', ${q("قديم")}), ('zzz', ${q(notice)}, 'cancelled', NULL);
`);

/* ---- the endpoint ---- */
const res = await fetch(BASE + "/api/live"), doc = await res.json();
check("GET /api/live answers JSON with the three lists", res.status === 200 && /json/.test(res.headers.get("content-type")) && ["banners", "announcements", "notices"].every(k => Array.isArray(doc[k])));
check("only active banners within their dates (expired, future and stopped are left out)", doc.banners.map(b => b.text).sort().join("|") === ["بانر نشط", "عاجل " + XSS].sort().join("|"), doc.banners.map(b => b.text));
check("banner fields are only what the site needs", Object.keys(doc.banners[0]).sort().join() === "dismissible,id,kind,link,text");
check("announcements: published and already due only, pinned first, then newest", doc.announcements.map(a => a.title).join("|") === ["إعلان مثبّت", "إعلان حديث", "حقن " + XSS, "إعلان رابع", "إعلان قديم"].join("|"), doc.announcements.map(a => a.title));
check("notices: today and later only (past ones dropped)", doc.notices.some(n => n.day === notice && n.slot === slotId) && !doc.notices.some(n => n.day === past));
check("cache headers: public, max-age (0 in this test run)", /public, max-age=\d+/.test(res.headers.get("cache-control")) && /noindex/.test(res.headers.get("x-robots-tag")));
check("POST is refused (405)", (await fetch(BASE + "/api/live", { method: "POST" })).status === 405);
check("HEAD works", (await fetch(BASE + "/api/live", { method: "HEAD" })).status === 200);

/* ---- the browser ---- */
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage(); const errs = [];
p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !/Failed to load resource|net::|ERR_/.test(m.text()) && errs.push(m.text()));
await p.goto(BASE + "/");
await p.waitForSelector("#live-banner .banner");
const bans = await p.$$eval("#live-banner .banner", l => l.map(x => ({ t: x.textContent, k: x.className, hasImg: !!x.querySelector("img"), x: !!x.querySelector(".b-x"), href: x.querySelector("a")?.getAttribute("href") ?? null })));
check("two banners shown (the newest first), text is text (the markup in it is not executed)", bans.length === 2 && bans.some(x => x.t.includes("بانر نشط")) && bans.some(x => x.t.includes("<img") && !x.hasImg) && !(await p.evaluate(() => window.__x)), bans);
check("the javascript: link of a banner is not rendered, the https one is", bans.find(x => x.t.includes("<img")).href === null && bans.find(x => x.t.includes("بانر نشط")).href === "https://example.org/b", bans);
check("a banner that is not dismissible has no close button; a dismissible one has", !bans.find(x => x.t.includes("<img")).x && bans.find(x => x.t.includes("بانر نشط")).x);
await p.click("#live-banner .b-x");
check("closing a banner removes it", (await p.$$("#live-banner .banner")).length === 1);
await p.reload(); await p.waitForSelector("#live-banner .banner");
check("a closed banner stays closed after a reload (this browser only)", (await p.$$eval("#live-banner .banner", l => l.map(x => x.textContent))).every(t => !t.includes("بانر نشط")));
await p.waitForSelector("#live-news:not([hidden])");
const news = await p.$$eval("#live-news article", l => l.map(x => ({ h: x.querySelector("h3").textContent, pinned: x.classList.contains("pinned"), img: !!x.querySelector("img"), href: x.querySelector("a")?.getAttribute("href") ?? null })));
check("home: the newest three announcements, the pinned one first", news.length === 3 && news[0].h === "إعلان مثبّت" && news[0].pinned && news[1].h === "إعلان حديث", news);
check("home: markup in a title or body is shown as text; javascript: links are dropped; https links kept", !news.some(n => n.img) && news.find(n => n.h.startsWith("حقن")) && news.find(n => n.h.startsWith("حقن")).href === null && news[1].href === "https://example.org/n" && !(await p.evaluate(() => window.__x)), news);
check("home: the body keeps its two lines", /السطر الأول\s*\n?\s*السطر الثاني/.test(await p.$eval("#live-news article:nth-child(2) .news-body", e => e.textContent)));
check("home: a Hijri date is shown", /هـ|١٤/.test(await p.$eval("#live-news article time", e => e.textContent)));

/* all announcements page, reached by a client-side navigation (the banner strip must survive it) */
await p.click('a[href="/news/"]');
await p.waitForURL(/\/news\/$/);
await p.waitForSelector("#live-news-all article");
check("/news/: all five published announcements", (await p.$$("#live-news-all article")).length === 5);
check("the banner strip is still there after navigating", (await p.$$("#live-banner .banner")).length >= 1);
check("/news/ is not offered to search engines (noindex)", /noindex/.test(await p.getAttribute("#m-robots", "content")));

/* schedule notice badge */
await p.goto(BASE + "/schedule/");
await p.waitForSelector(".notice-badge", { timeout: 8000 }).catch(() => {});
const badges = await p.$$eval(".notice-badge", l => l.map(x => ({ t: x.textContent, off: x.closest("li").classList.contains("slot-off"), day: x.closest(".sched-day").dataset.day, slot: x.closest("li").dataset.slot })));
check("schedule: exactly one badge, on the right slot and weekday, with the note", badges.length === 1 && badges[0].slot === slotId && badges[0].day === String(wd) && /ملغى/.test(badges[0].t) && /لعذر طارئ/.test(badges[0].t) && badges[0].off, badges);

/* when the live endpoint is down or empty the site is exactly as before */
for (const [name, fulfil] of [["500", { status: 500, body: "x" }], ["empty document", { status: 200, contentType: "application/json", body: "{}" }], ["not JSON", { status: 200, contentType: "text/html", body: "<p>hi</p>" }]]) {
  const c2 = await b.newContext(); const q2 = await c2.newPage(); const e2 = [];
  q2.on("pageerror", e => e2.push(e.message));
  await q2.route("**/api/live", r => r.fulfill(fulfil));
  await q2.goto(BASE + "/"); await q2.waitForTimeout(700);
  check(`live endpoint ${name}: no banner, announcements block stays hidden, no errors`, (await q2.$$("#live-banner .banner")).length === 0 && await q2.$eval("#live-news", e => e.hidden) && e2.length === 0, e2);
  await c2.close();
}

/* accessibility with banners and announcements showing */
let axeBad = 0;
for (const scheme of ["light", "dark"]) for (const w of [1280, 390]) {
  const c3 = await b.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme, reducedMotion: "reduce" }); const q3 = await c3.newPage();   // no entrance animation while axe measures contrast const q3 = await c3.newPage();
  for (const path of ["/", "/news/", "/schedule/"]) {
    await q3.goto(BASE + path); await q3.waitForSelector("#live-banner .banner"); await q3.waitForTimeout(400);
    await q3.evaluate(axeSrc); const r = await q3.evaluate(() => axe.run());
    for (const v of r.violations) { axeBad++; console.log("   axe", scheme, w, path, v.id, v.nodes.length, v.nodes[0].target.join(" "), JSON.stringify(v.nodes[0].any.map(a => a.message))); }
  }
  await c3.close();
}
check("axe: 0 violations on home, /news/ and /schedule/ with banners (light/dark, desktop/mobile)", axeBad === 0, axeBad);
check("no console or page errors", errs.length === 0, errs);
await b.close();
if (bad) { console.error(`!! ${bad} failed`); process.exit(1); }
console.log("all live-layer checks passed");
