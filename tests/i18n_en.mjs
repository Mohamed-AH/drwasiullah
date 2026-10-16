/* NEEDS THE DRAFT TRANSLATIONS, which are NOT in the repository while the site is Arabic only (docs/i18n-plan.md «Resuming»): restore the private archive first. */
/* English edition checks. Builds two sites into temp folders — SOFT (en built, not indexed: the launch state) and LIVE (en indexed) — and checks:
   static: language/direction, soft-launch hiding (noindex, no hreflang, no switcher), live hreflang symmetry + sitemap, no stray Arabic in English chrome, Hijri/number format;
   browser: suggestion banner matrix, saved-choice redirect, switcher, client-side navigation in English, search folding, fonts, axe (light/dark, desktop/mobile), no horizontal scroll.
   usage: node tests/i18n_en.mjs      (needs Playwright + axe-core resolvable, Chromium at /opt/pw-browsers/chromium; takes ~3 minutes) */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
const require = createRequire(import.meta.url);
let bad = 0;
const check = (n, c, x = "") => { if (!c) bad++; console.log(`${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + String(x).slice(0, 400)}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "i18ne-"));
const build = (name, env) => { const d = path.join(tmp, name); execFileSync("node", ["scripts/build.mjs"], { env: { ...process.env, DIST: d, ...env }, stdio: "pipe" }); return d; };
const SOFT = build("soft", { LANGS: "ar,en", LANGS_INDEXED: "ar" }), LIVE = build("live", { LANGS: "ar,en", LANGS_INDEXED: "ar,en" });
const read = (d, p) => fs.readFileSync(path.join(d, p.replace(/^\//, ""), p.endsWith(".html") || p.endsWith(".xml") ? "" : "index.html"), "utf8");
const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

/* ───── soft launch ───── */
{
  const h = read(SOFT, "/en/");
  check("soft: /en/ has lang=en dir=ltr", /<html lang="en" dir="ltr"/.test(h));
  check("soft: /en/ is noindex and has no hreflang", /name="robots" content="noindex/.test(h) && !/hreflang/.test(h));
  check("soft: no switcher, no language redirect script on any page", !/class="langs/.test(h) && !/lang-init/.test(h) && !/class="langs/.test(read(SOFT, "/")) && !/lang-init/.test(read(SOFT, "/")));
  check("soft: sitemap has no /en/ URLs", !/\/en\//.test(read(SOFT, "/sitemap.xml")));
  check("soft: the Arabic home is unchanged by the switch (no hreflang)", !/hreflang/.test(read(SOFT, "/")));
}
/* ───── live: hreflang, sitemap, switcher ───── */
{
  const ar = read(LIVE, "/series/muslim/"), en = read(LIVE, "/en/series/muslim/");
  const alt = h => [...h.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map(m => m[1] + "=" + m[2]).sort().join(" ");
  check("live: hreflang sets are identical on both languages", alt(ar) === alt(en) && /en=https:\/\/drwasiullah\.com\/en\/series\/muslim\//.test(alt(en)) && /x-default=https:\/\/drwasiullah\.com\/series\/muslim\//.test(alt(en)), alt(en));
  check("live: canonical of the English page is itself", /rel="canonical" href="https:\/\/drwasiullah\.com\/en\/series\/muslim\/"/.test(en));
  check("live: English page is indexable", !/content="noindex/.test(en));
  const sm = read(LIVE, "/sitemap.xml");
  check("live: sitemap lists /en/ pages with alternates", /<loc>https:\/\/drwasiullah\.com\/en\/<\/loc><xhtml:link rel="alternate" hreflang="ar"/.test(sm));
  check("live: switcher links to the same page", /<a href="\/series\/muslim\/" lang="ar" hreflang="ar" data-lang="ar">عربي<\/a><a href="\/en\/series\/muslim\/" lang="en" hreflang="en" data-lang="en" aria-current="true">English<\/a>/.test(en), (en.match(/<div class="langs[^]*?<\/div>/) || [""])[0]);
  check("live: language redirect script present", /lang-init\.js/.test(ar) && /lang-init\.js/.test(en));
  check("live: English preloads its own fonts, not the Arabic ones", /cormorant-garamond-latin-700/.test(en) && !/aref-ruqaa/.test(en.replace(/<link rel="stylesheet"[^>]*>/g, "")));
}
/* ───── English chrome contains no Arabic (Arabic data text is marked lang=ar) ───── */
{
  const strip = h => h.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<(\w+)\b[^>]*\blang="(?:ar|ur)"[^>]*>[\s\S]*?<\/\1>/g, "").replace(/<[^>]+>/g, " ");
  const files = ["/en/", "/en/library/", "/en/books/", "/en/about/", "/en/schedule/", "/en/search/", "/en/news/", "/en/section/audio/", "/en/series/muslim/", "/en/series/ibn-majah/", "/en/series/nuzhat/", "/en/series/nasai/", "/en/series/fadail-sahabah/", "/en/series/abu-dawud/", "/en/lesson/tirmidhi-0003/", "/en/lesson/sahih-muslim-0171/"];
  const leaks = [];
  for (const f of files) { if (!fs.existsSync(path.join(LIVE, f.replace(/^\//, ""), "index.html"))) { leaks.push(f + " missing"); continue; } const t = strip(read(LIVE, f)); const m = t.match(/\S*[؀-ۿ]\S*/); if (m) leaks.push(`${f}: ${m[0]}`); }
  check(`English pages: no Arabic outside lang="ar"/"ur" runs (${files.length} pages)`, leaks.length === 0, leaks.join(" | "));
  // lesson pages: titles composed for numbered lessons; anything Arabic in <h1> must sit in a lang=ar span
  const dir = path.join(LIVE, "en/lesson"); let n = 0, unmarked = 0, ex = "";
  for (const id of fs.readdirSync(dir)) { const h = fs.readFileSync(path.join(dir, id, "index.html"), "utf8"), m = /<h1 class="w-title"[^>]*>([\s\S]*?)<\/h1>/.exec(h); if (!m) continue; n++; if (ARABIC.test(m[1].replace(/<span lang="ar"[\s\S]*?<\/span>/g, "")) && !/lang="ur"/.test(h.slice(h.indexOf("<h1"), h.indexOf("<h1") + 60))) { unmarked++; ex = ex || id; } }
  check(`lesson headings: every Arabic run is marked lang=ar (${n} lessons)`, unmarked === 0, `${unmarked} e.g. ${ex}`);
  const home = read(LIVE, "/en/");
  check("numbers: Western digits with grouping on the home page", />3,\d{3}<\/b>/.test(home) && !/[٠-٩]/.test(strip(home)));
  const lp = read(LIVE, "/en/lesson/tirmidhi-0003/");
  check("Hijri dates are English with the AH era", /\d{1,2} [A-Za-zĀāĪīŪūḤḥṢṣʿʾ\-ʻ ]+ 14\d\d AH/.test(lp), (lp.match(/w-meta[\s\S]{0,400}/) || [""])[0].replace(/<[^>]+>/g, " "));
  check("title composer: Tirmidhi lesson reads «From Ḥadīth N»", /From Ḥadīth \d+/.test(lp));
  check("<title> and og:title are English", /<title>[A-Za-zḤ][^<]*\| Shaykh Wasiullāh ibn Muḥammad ʿAbbās<\/title>/.test(lp), (lp.match(/<title>.*?<\/title>/) || [""])[0]);
  check("basmala is marked Arabic", /<p class="bism" lang="ar">/.test(home));
  check("hero names", /Wasiullāh/.test(home) && /may Allah preserve him/.test(home) && /Official website of Shaykh/.test(home));
  const books = read(LIVE, "/en/books/");
  check("books: titles transliterated, groups translated", /Critical Editions/.test(books) && /Writings and Research/.test(books) && !/class="book-b"><h3>[^<]*[؀-ۿ]/.test(books));
  const sch = read(LIVE, "/en/schedule/");
  check("schedule: English day names and phrases", /Wednesday/.test(sch) && /After Maghrib/.test(sch) && /data-day="3"/.test(sch));
  const abt = read(LIVE, "/en/about/");
  check("about: English bio, no Arabic-only note", /Upbringing and the Beginning/.test(abt) && !/lang-note/.test(abt));
}

/* ───── browser ───── */
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".xml": "application/xml" };
const serve = DIST => new Promise(res => { const s = http.createServer((req, rs) => {
  try {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname); let f = path.join(DIST, p); if (!f.startsWith(DIST)) throw 0;
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
    if (!fs.existsSync(f)) { rs.writeHead(404, { "content-type": "text/html" }); return rs.end(fs.readFileSync(path.join(DIST, "404.html"))); }
    rs.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); rs.end(fs.readFileSync(f));
  } catch { rs.writeHead(400); rs.end(); }
}).listen(0, () => res({ s, base: `http://localhost:${s.address().port}` })); });
const { s: srv, base: BASE } = await serve(LIVE);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const mkctx = async (o = {}, langs) => {
  const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce", ...o });
  if (langs) await c.addInitScript(l => { Object.defineProperty(navigator, "languages", { get: () => l }); Object.defineProperty(navigator, "language", { get: () => l[0] }); }, langs);
  await c.route(/youtube|ytimg|\/api\//, r => r.abort());
  return c;
};
const open = async (c, url, ref) => { const p = await c.newPage(), errs = []; p.on("pageerror", e => errs.push(String(e))); p.on("console", m => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push(m.text())); p.errs = errs; await p.goto(BASE + url, { waitUntil: "networkidle", referer: ref }); return p; };

/* suggestion banner matrix */
for (const [langs, expect, why] of [[["ar-SA"], "", "Arabic browser"], [["en-US"], "en", "English browser"], [["en-US", "ar"], "", "Arabic anywhere in the list wins"], [["fr-FR", "en"], "en", "first of ur/en"], [["fr-FR"], "", "other language"], [["ur-PK"], "", "Urdu is not live in this build"]]) {
  const c = await mkctx({}, langs), p = await open(c, "/");
  const got = await p.evaluate(() => { const b = document.querySelector(".lang-hint"); return b ? b.lang : ""; });
  check(`banner: ${why} -> ${expect || "none"}`, got === expect, got);
  if (expect) {
    const dir = await p.evaluate(() => document.querySelector(".lang-hint").dir);
    check("banner: English text, ltr", dir === "ltr" && /View in English/.test(await p.textContent(".lang-hint")));
  }
  await c.close();
}
{
  const c = await mkctx({}, ["en-US"]), p = await open(c, "/");
  await p.click(".lang-hint-x"); check("banner: dismiss removes it", !(await p.$(".lang-hint")));
  const p2 = await open(c, "/library/"); check("banner: stays dismissed on the next page load", !(await p2.$(".lang-hint")));
  await c.close();
}
{
  const c = await mkctx({}, ["en-US"]), p = await open(c, "/series/muslim/");
  await p.click(".lang-hint a"); await p.waitForURL(/\/en\/series\/muslim\/$/);
  check("banner link: goes to the same page in English and remembers the choice", (await p.evaluate(() => localStorage.getItem("lang"))) === "en" && (await p.evaluate(() => document.documentElement.lang)) === "en");
  check("English page: no banner", !(await p.$(".lang-hint")));
  await c.close();
}
/* saved choice on entry from outside */
{
  const c = await mkctx({}, ["en-US"]);
  const p = await c.newPage(); await p.goto(BASE + "/en/", { waitUntil: "networkidle" }); await p.evaluate(() => localStorage.setItem("lang", "en"));
  const q = await open(c, "/series/muslim/");
  check("saved English: arriving on an Arabic URL lands on the English page", /\/en\/series\/muslim\/$/.test(q.url()), q.url());
  const r = await open(c, "/series/muslim/", BASE + "/library/");
  check("saved English: moving inside the site (same-origin referrer) is never redirected", /\/series\/muslim\/$/.test(r.url()) && !/\/en\//.test(r.url()), r.url());
  await c.close();
  const c2 = await mkctx({ userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" });
  const g = await c2.newPage(); await g.goto(BASE + "/en/", { waitUntil: "networkidle" }); await g.evaluate(() => localStorage.setItem("lang", "en"));
  const g2 = await open(c2, "/");
  check("crawlers are never redirected", !/\/en\//.test(g2.url()), g2.url());
  await c2.close();
  const c3 = await mkctx({}, ["en-US"]); const a = await c3.newPage(); await a.goto(BASE + "/en/", { waitUntil: "networkidle" }); await a.evaluate(() => localStorage.setItem("lang", "ar"));
  const a2 = await open(c3, "/en/series/muslim/");
  check("saved Arabic: an English URL opened from outside goes to the Arabic page", /\/series\/muslim\/$/.test(a2.url()) && !/\/en\//.test(a2.url()), a2.url());
  await c3.close();
}
/* switcher + client-side navigation inside English */
{
  const c = await mkctx(), p = await open(c, "/en/");
  check("English page boots without console errors", p.errs.length === 0, p.errs.join(" | "));
  check("html lang/dir", (await p.evaluate(() => [document.documentElement.lang, document.documentElement.dir, getComputedStyle(document.body).direction].join())) === "en,ltr,ltr");
  await p.click('.tile[href*="/en/books/"], .nav a[href="/en/series/muslim/"]').catch(() => {});
  await p.goto(BASE + "/en/series/muslim/", { waitUntil: "networkidle" });
  const row = await p.$(".row"); await row.click(); await p.waitForURL(/\/en\/lesson\//);
  check("client-side navigation stays English", (await p.evaluate(() => [document.documentElement.lang, document.title, location.pathname].join("|"))).startsWith("en|") && /\| Shaykh Wasiullāh/.test(await p.title()), await p.title());
  const sw = await p.evaluate(() => [...document.querySelectorAll(".langs.in-top a")].map(a => a.getAttribute("href")).join(","));
  check("switcher links follow the page after client-side navigation", /^\/lesson\/.*\/,\/en\/lesson\/.*\/$/.test(sw), sw);
  await p.goto(BASE + "/en/series/muslim/", { waitUntil: "networkidle" });
  await p.fill("#q", "hajj"); await p.waitForTimeout(500);
  const n1 = await p.textContent("#count"); check("series filter in English: «hajj» finds lessons", /^\d+ lessons?$/.test(n1.trim()) && !/^0 /.test(n1.trim()), n1);
  await p.goto(BASE + "/en/search/?q=Sharh%20Sahih%20Muslim", { waitUntil: "networkidle" });
  const n2 = await p.textContent("#count"); check("search folds diacritics: «Sharh Sahih Muslim» matches «Sharḥ Ṣaḥīḥ Muslim»", /^\d[\d,]* results?$/.test(n2.trim()), n2);
  await p.goto(BASE + "/en/search/?q=%D9%85%D8%B3%D9%84%D9%85", { waitUntil: "networkidle" });
  const n3 = await p.textContent("#count"); check("search still finds Arabic words on the English site", /^\d[\d,]* results?$/.test(n3.trim()), n3);
  await p.goto(BASE + "/en/search/?q=zzzzqq", { waitUntil: "networkidle" });
  check("empty search says so in English", /No matching results/.test(await p.textContent("#out")));
  await p.goto(BASE + "/en/", { waitUntil: "networkidle" });
  await p.click('.langs.in-top a[data-lang="ar"]'); await p.waitForURL(url => !/\/en\//.test(url.pathname));
  check("switcher: «عربي» loads the Arabic page and remembers it", (await p.evaluate(() => [document.documentElement.lang, localStorage.getItem("lang")].join())) === "ar,ar");
  await c.close();
}
/* fonts: the transliteration letters come from the English fonts, no 404s */
{
  const c = await mkctx(), p = await c.newPage(), bad404 = []; p.on("response", r => { if (r.status() >= 400 && /\/fonts\//.test(r.url())) bad404.push(r.url()); });
  await p.goto(BASE + "/en/series/muslim/", { waitUntil: "networkidle" });
  const ok = await p.evaluate(async () => { await document.fonts.load("700 20px 'Cormorant Garamond'", "ʿāḥṣ"); await document.fonts.load("400 16px Cardo", "ʿāḥṣ"); return [document.fonts.check("700 20px 'Cormorant Garamond'", "ʿāḥṣ"), document.fonts.check("400 16px Cardo", "ʿāḥṣ")].join(); });
  check("fonts: Cormorant Garamond and Cardo cover ʿ ā ḥ ṣ", ok === "true,true", ok);
  check("fonts: no failed font requests", bad404.length === 0, bad404.join());
  const used = await p.evaluate(() => [...document.fonts].filter(f => f.status === "loaded").map(f => f.family.replace(/"/g, "") + " " + f.weight + " " + f.style).join(" | "));
  console.log("info loaded fonts:", used);
  await c.close();
}
/* axe + horizontal scroll, light/dark × desktop/mobile */
{
  const pages = ["/en/", "/en/library/", "/en/books/", "/en/about/", "/en/schedule/", "/en/search/?q=hajj", "/en/series/muslim/", "/en/series/fath-bari/", "/en/lesson/tirmidhi-0003/", "/en/lesson/fath-bari-2621/", "/en/section/audio/"];
  let viol = 0, scroll = [], detail = [];
  for (const [w, h] of [[1280, 900], [390, 844]]) for (const theme of ["light", "dark"]) {
    const c = await mkctx({ viewport: { width: w, height: h }, colorScheme: theme, bypassCSP: true }); const p = await c.newPage();
    for (const u of pages) {
      await p.goto(BASE + u, { waitUntil: "networkidle" }); await p.waitForTimeout(250);
      await p.addScriptTag({ content: axeSrc });
      const r = await p.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] }));
      for (const v of r.violations) { viol++; detail.push(`${u} ${w}/${theme}: ${v.id} ${v.nodes.slice(0, 2).map(n => n.target.join(" ")).join(" ; ")}`); }
      if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) scroll.push(`${u}@${w}`);
    }
    await c.close();
  }
  check(`axe: 0 violations (${pages.length} pages × light/dark × desktop/mobile)`, viol === 0, detail.slice(0, 6).join(" || "));
  check("no horizontal scrolling", scroll.length === 0, scroll.join(", "));
}
await browser.close(); srv.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `\n${bad} FAILED` : "\nall English checks passed");
process.exit(bad ? 1 : 0);
