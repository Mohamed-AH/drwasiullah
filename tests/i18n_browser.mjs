/* Browser checks of the language plumbing on a pseudo-locale build (LANGS=ar,xx): client-side navigation keeps the language, the dictionary loads
   on demand, text painted by app.js is translated too, Arabic is untouched, and a failing dictionary falls back to Arabic.
   usage: node tests/i18n_browser.mjs [dist built with LANGS=ar,xx]   (builds one into a temp folder when no argument is given) */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
let bad = 0;
const check = (n, c, x = "") => { if (!c) bad++; console.log(`${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + String(x).slice(0, 300)}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "i18nb-"));
let DIST = process.argv[2];
if (!DIST) { DIST = path.join(tmp, "dist"); execFileSync("node", ["scripts/build.mjs"], { env: { ...process.env, DIST, LANGS: "ar,xx" } }); }
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png" };
const server = http.createServer((req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname); let f = path.join(DIST, p); if (!f.startsWith(DIST)) throw 0;
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
    if (!fs.existsSync(f)) { res.writeHead(404, { "content-type": "text/html" }); return res.end(fs.readFileSync(path.join(DIST, "404.html"))); }
    res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); res.end(fs.readFileSync(f));
  } catch { res.writeHead(400); res.end(); }
}).listen(0);
const BASE = `http://localhost:${server.address().port}`;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route(/youtube|ytimg|\/api\//, r => r.abort());
const page = async () => { const p = await ctx.newPage(), errs = []; p.on("pageerror", e => errs.push(String(e))); p.on("console", m => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push(m.text())); return { p, errs }; };
const wrapped = s => /⟦[^⟧]+⟧/.test(s);

/* ---- pseudo-locale ---- */
let { p, errs } = await page();
await p.goto(BASE + "/xx/"); await p.waitForSelector(".hero"); await p.waitForTimeout(600);
check("xx page: lang attribute and wrapped chrome", (await p.evaluate(() => document.documentElement.lang)) === "xx" && wrapped(await p.textContent(".nav")) && wrapped(await p.textContent(".hero-p")));
await p.click('a.tile >> nth=1'); await p.waitForTimeout(500);
check("client-side navigation to a section/series stays under /xx/", new URL(p.url()).pathname.startsWith("/xx/"), p.url());
const link = await p.$('a[href^="/xx/series/"], a[href^="/xx/lesson/"]');
check("links on the new page are /xx/ links", !!link);
await p.goto(BASE + "/xx/series/muslim/"); await p.waitForSelector("#count"); await p.waitForTimeout(500);
await p.selectOption("#sort", "old"); await p.fill("input[name=q]", "1"); await p.waitForTimeout(500);
check("series count painted by app.js is translated", wrapped(await p.textContent("#count")), await p.textContent("#count"));
await p.goto(BASE + "/xx/series/muslim/");
const firstLesson = await p.evaluate(() => (document.querySelector('a.row[href^="/xx/lesson/"]') || {}).href);
check("series rows link to /xx/lesson/…", !!firstLesson, firstLesson);
if (firstLesson) { await p.goto(firstLesson); await p.waitForSelector(".watch"); check("lesson page: buttons use the dictionary", wrapped(await p.textContent(".btns")), await p.textContent(".btns")); }
await p.goto(BASE + "/xx/"); await p.waitForSelector(".search"); await p.fill("input[name=q]", "مسلم"); await p.keyboard.press("Enter"); await p.waitForSelector("#count"); await p.waitForTimeout(600);
check("search form goes to /xx/search/ and the result count is translated", new URL(p.url()).pathname === "/xx/search/" && wrapped(await p.textContent("#count")), p.url() + " | " + await p.textContent("#count"));
check("no script errors on the xx pages", errs.length === 0, errs.join(" | "));
await p.close();

/* ---- Arabic is untouched ---- */
({ p, errs } = await page());
await p.goto(BASE + "/"); await p.waitForSelector(".hero"); await p.waitForTimeout(500);
check("Arabic home: lang ar, no wrappers, links without a prefix", (await p.evaluate(() => document.documentElement.lang)) === "ar" && !(await p.content()).includes("⟦") && !!(await p.$('a.tile[href^="/section/"], a.tile[href^="/series/"]')));
await p.fill("input[name=q]", "مسلم"); await p.keyboard.press("Enter"); await p.waitForSelector("#count"); await p.waitForTimeout(600);
check("Arabic search still works and counts in Arabic", new URL(p.url()).pathname === "/search/" && /نتيجة/.test(await p.textContent("#count")), await p.textContent("#count"));
check("no script errors on Arabic pages", errs.length === 0, errs.join(" | "));
await p.close();

/* ---- the dictionary cannot be fetched: Arabic text is the fallback, nothing breaks ---- */
const ctx2 = await browser.newContext(); await ctx2.route(/youtube|ytimg|\/api\/|\/i18n\/xx\.js/, r => r.abort());
const p2 = await ctx2.newPage(), errs2 = []; p2.on("pageerror", e => errs2.push(String(e)));
await p2.goto(BASE + "/xx/series/muslim/"); await p2.waitForSelector("#count"); await p2.waitForTimeout(800);
check("missing dictionary: page still works, painted counts fall back to Arabic", /درسًا/.test(await p2.textContent("#count")) && errs2.length === 0, (await p2.textContent("#count")) + " " + errs2.join("|"));
await browser.close(); server.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `${bad} FAILED` : "all browser language checks passed");
process.exit(bad ? 1 : 0);
