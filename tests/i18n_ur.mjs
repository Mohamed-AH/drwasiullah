/* NEEDS THE DRAFT TRANSLATIONS, which are NOT in the repository while the site is Arabic only (docs/i18n-plan.md «Resuming»): restore the private archive first. */
/* Urdu edition checks (same method as tests/i18n_en.mjs). Builds SOFT (ur built, not indexed = the launch state) and LIVE (ur indexed) into temp folders.
   static: language/direction, soft-launch hiding, hreflang + sitemap, no Arabic-only letters in Urdu chrome (Arabic data text must sit in lang="ar" runs),
   Western digits, Hijri format, composed titles; browser: banner, saved choice, switcher, client-side navigation, Urdu + Arabic search, Nastaliq loaded, axe, no h-scroll.
   usage: node tests/i18n_ur.mjs   (Playwright + axe-core resolvable; ~3 minutes) */
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "i18nu-"));
const build = (name, env) => { const d = path.join(tmp, name); execFileSync("node", ["scripts/build.mjs"], { env: { ...process.env, DIST: d, ...env }, stdio: "pipe" }); return d; };
const SOFT = build("soft", { LANGS: "ar,ur", LANGS_INDEXED: "ar" }), LIVE = build("live", { LANGS: "ar,ur", LANGS_INDEXED: "ar,ur" });
const read = (d, p) => fs.readFileSync(path.join(d, p.replace(/^\//, ""), p.endsWith(".xml") ? "" : "index.html"), "utf8");
const ARONLY = /[يكةىأإ]/;
const strip = h => h.replace(/<html[^>]*>/, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<(\w+)\b[^>]*\blang="(?:ar|ur)"[^>]*>[\s\S]*?<\/\1>/g, "").replace(/<[^>]+>/g, " ");

{
  const h = read(SOFT, "/ur/");
  check("soft: /ur/ has lang=ur dir=rtl", /<html lang="ur" dir="rtl"/.test(h));
  check("soft: /ur/ is noindex, no hreflang, no switcher, no redirect script", /name="robots" content="noindex/.test(h) && !/hreflang|class="langs|lang-init/.test(h));
  check("soft: sitemap has no /ur/ URLs", !/\/ur\//.test(read(SOFT, "/sitemap.xml")));
}
{
  const ar = read(LIVE, "/series/muslim/"), ur = read(LIVE, "/ur/series/muslim/");
  const alt = h => [...h.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map(m => m[1] + "=" + m[2]).sort().join(" ");
  check("live: hreflang sets identical, ur + x-default present", alt(ar) === alt(ur) && /ur=https:\/\/drwasiullah\.com\/ur\/series\/muslim\//.test(alt(ur)) && /x-default=https:\/\/drwasiullah\.com\/series\/muslim\//.test(alt(ur)), alt(ur));
  check("live: Urdu page is indexable and canonical to itself", !/content="noindex/.test(ur) && /rel="canonical" href="https:\/\/drwasiullah\.com\/ur\/series\/muslim\/"/.test(ur));
  check("live: sitemap lists /ur/ with alternates", /<loc>https:\/\/drwasiullah\.com\/ur\/<\/loc><xhtml:link/.test(read(LIVE, "/sitemap.xml")));
  check("live: switcher shows «اردو»", /data-lang="ur" aria-current="true">اردو<\/a>/.test(ur));
  check("live: Urdu page preloads Nastaliq, not Aref Ruqaa", /noto-nastaliq-urdu-arabic-400/.test(ur) && !/preload" href="\/fonts\/aref/.test(ur));
}
{
  const files = ["/ur/", "/ur/library/", "/ur/books/", "/ur/about/", "/ur/schedule/", "/ur/search/", "/ur/news/", "/ur/section/audio/", "/ur/series/muslim/", "/ur/series/ibn-majah/", "/ur/series/nuzhat/", "/ur/series/nasai/", "/ur/series/fadail-sahabah/", "/ur/series/abu-dawud/", "/ur/lesson/tirmidhi-0003/", "/ur/lesson/sahih-muslim-0171/"];
  const leaks = [];
  for (const f of files) { const t = strip(read(LIVE, f)); const m = t.match(/\S*[يكةىأإ]\S*/); if (m) leaks.push(`${f}: ${m[0]}`); }
  check(`Urdu pages: no Arabic-only letters outside lang="ar"/"ur" runs (${files.length} pages)`, leaks.length === 0, leaks.join(" | "));
  const dir = path.join(LIVE, "ur/lesson"); let n = 0, unmarked = 0, ex = "";
  for (const id of fs.readdirSync(dir)) { const h = fs.readFileSync(path.join(dir, id, "index.html"), "utf8"), m = /<h1 class="w-title"([^>]*)>([\s\S]*?)<\/h1>/.exec(h); if (!m) continue; n++; if (!/lang="ur"/.test(m[1]) && ARONLY.test(m[2].replace(/<span lang="ar"[\s\S]*?<\/span>/g, ""))) { unmarked++; ex = ex || id; } }
  check(`lesson headings: Arabic runs marked lang=ar (${n} lessons)`, unmarked === 0, `${unmarked} e.g. ${ex}`);
  const home = read(LIVE, "/ur/"), lp = read(LIVE, "/ur/lesson/tirmidhi-0003/");
  check("digits: Western only, grouped counts", />3,\d{3}<\/b>/.test(home) && !/[٠-٩۰-۹]/.test(strip(home) + strip(lp)));
  check("Hijri dates in Urdu with ھ", /\d{1,2} [^\d<]+ 14\d\dھ/.test(strip(lp)), strip(lp).slice(0, 300));
  check("title composer: «حدیث 8 سے»", /حدیث \d+ سے/.test(lp));
  check("<title> Urdu with the name", /<title>[^<]*\| شیخ وصی اللہ بن محمد عباس<\/title>/.test(lp));
  check("basmala marked Arabic; hero names", /<p class="bism" lang="ar">/.test(home) && /وصی اللہ/.test(home) && /حفظہ اللہ/.test(home));
  check("books/schedule/about in Urdu", /تحقیق شدہ کتب/.test(read(LIVE, "/ur/books/")) && /بدھ/.test(read(LIVE, "/ur/schedule/")) && /ابتدائی زندگی/.test(read(LIVE, "/ur/about/")) && !/lang-note/.test(read(LIVE, "/ur/about/")));
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".xml": "application/xml" };
const srv = http.createServer((req, rs) => {
  try {
    const p = decodeURIComponent(new URL(req.url, "http://x").pathname); let f = path.join(LIVE, p); if (!f.startsWith(LIVE)) throw 0;
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, "index.html");
    if (!fs.existsSync(f)) { rs.writeHead(404, { "content-type": "text/html" }); return rs.end(fs.readFileSync(path.join(LIVE, "404.html"))); }
    rs.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); rs.end(fs.readFileSync(f));
  } catch { rs.writeHead(400); rs.end(); }
});
await new Promise(r => srv.listen(0, r)); const BASE = `http://localhost:${srv.address().port}`;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const mkctx = async (o = {}, langs) => { const c = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce", ...o }); if (langs) await c.addInitScript(l => { Object.defineProperty(navigator, "languages", { get: () => l }); Object.defineProperty(navigator, "language", { get: () => l[0] }); }, langs); await c.route(/youtube|ytimg|\/api\//, r => r.abort()); return c; };
const open = async (c, url, ref) => { const p = await c.newPage(), errs = []; p.on("pageerror", e => errs.push(String(e))); p.on("console", m => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push(m.text())); p.errs = errs; await p.goto(BASE + url, { waitUntil: "networkidle", referer: ref }); return p; };

for (const [langs, expect, why] of [[["ar-SA"], "", "Arabic browser"], [["ur-PK"], "ur", "Urdu browser"], [["ur-PK", "ar"], "", "Arabic anywhere wins"], [["en-US", "ur"], "ur", "English is not live here, so Urdu is the first available"], [["en-US"], "", "English not live in this build"]]) {
  const c = await mkctx({}, langs), p = await open(c, "/");
  const got = await p.evaluate(() => { const b = document.querySelector(".lang-hint"); return b ? b.lang + "/" + b.dir : ""; });
  check(`banner: ${why} -> ${expect || "none"}`, got === (expect ? expect + "/rtl" : ""), got);
  if (expect) check("banner text in Urdu", /اردو میں دیکھیں/.test(await p.textContent(".lang-hint")));
  await c.close();
}
{
  const c = await mkctx({}, ["ur-PK"]), p = await open(c, "/series/muslim/");
  await p.click(".lang-hint a"); await p.waitForURL(/\/ur\/series\/muslim\/$/);
  check("banner link: same page in Urdu, choice remembered", (await p.evaluate(() => [localStorage.getItem("lang"), document.documentElement.lang].join())) === "ur,ur");
  const q = await open(c, "/library/");
  check("saved Urdu: arriving from outside on an Arabic URL lands on the Urdu page", /\/ur\/library\/$/.test(q.url()), q.url());
  await c.close();
}
{
  const c = await mkctx(), p = await open(c, "/ur/");
  check("Urdu page boots without console errors", p.errs.length === 0, p.errs.join(" | "));
  check("html lang/dir", (await p.evaluate(() => [document.documentElement.lang, document.documentElement.dir].join())) === "ur,rtl");
  await p.goto(BASE + "/ur/series/muslim/", { waitUntil: "networkidle" });
  await (await p.$(".row")).click(); await p.waitForURL(/\/ur\/lesson\//);
  check("client-side navigation stays Urdu", (await p.evaluate(() => [document.documentElement.lang, location.pathname.startsWith("/ur/")].join())) === "ur,true" && /\| شیخ وصی اللہ/.test(await p.title()), await p.title());
  const sw = await p.evaluate(() => [...document.querySelectorAll(".langs.in-top a")].map(a => a.getAttribute("href")).join(","));
  check("switcher follows the page", /^\/lesson\/.*\/,\/ur\/lesson\/.*\/$/.test(sw), sw);
  await p.goto(BASE + "/ur/series/muslim/", { waitUntil: "networkidle" });
  await p.fill("#q", "حج"); await p.waitForTimeout(500);
  check("series filter in Urdu: «حج» finds lessons", /^\d+ (دروس|درس)$/.test((await p.textContent("#count")).trim()) && !/^0 /.test((await p.textContent("#count")).trim()), await p.textContent("#count"));
  for (const [q, why] of [["صحیح مسلم", "Urdu spelling"], ["صحيح مسلم", "Arabic spelling"], ["Sahih", "—"]]) {
    await p.goto(BASE + "/ur/search/?q=" + encodeURIComponent(q), { waitUntil: "networkidle" });
    const n = (await p.textContent("#count")).trim();
    if (why !== "—") check(`search «${q}» (${why}) finds results`, /^\d[\d,]* (نتائج|نتیجہ)$/.test(n), n);
  }
  await p.goto(BASE + "/ur/search/?q=zzzzqq", { waitUntil: "networkidle" });
  check("empty search says so in Urdu", /کوئی مطابق نتیجہ/.test(await p.textContent("#out")));
  await p.goto(BASE + "/ur/", { waitUntil: "networkidle" });
  await p.click('.langs.in-top a[data-lang="ar"]'); await p.waitForURL(u => !/\/ur\//.test(u.pathname));
  check("switcher: «عربي» loads Arabic and remembers it", (await p.evaluate(() => [document.documentElement.lang, localStorage.getItem("lang")].join())) === "ar,ar");
  await c.close();
}
{
  const c = await mkctx(), p = await c.newPage(), bad404 = []; p.on("response", r => { if (r.status() >= 400 && /\/fonts\//.test(r.url())) bad404.push(r.url()); });
  await p.goto(BASE + "/ur/series/muslim/", { waitUntil: "networkidle" });
  const ok = await p.evaluate(async () => { await document.fonts.load("400 19px 'Noto Nastaliq Urdu'", "شرح صحیح مسلم 12"); return [document.fonts.check("400 19px 'Noto Nastaliq Urdu'", "شرح صحیح مسلم 12"), getComputedStyle(document.querySelector("h1")).fontFamily.startsWith('"Noto Nastaliq Urdu"'), getComputedStyle(document.querySelector(".tag, .pill, .count")).fontFamily.startsWith('"Noto Naskh Arabic"')].join(); });
  check("fonts: Nastaliq for headings/reading, Naskh for small UI", ok === "true,true,true", ok);
  check("fonts: no failed font requests", bad404.length === 0, bad404.join());
  await c.close();
}
{
  const pages = ["/ur/", "/ur/library/", "/ur/books/", "/ur/about/", "/ur/schedule/", "/ur/search/?q=%D8%AD%D8%AC", "/ur/series/muslim/", "/ur/series/fath-bari/", "/ur/lesson/tirmidhi-0003/", "/ur/lesson/fath-bari-2621/", "/ur/section/audio/"];
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
await browser.close(); srv.close(); fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `\n${bad} FAILED` : "\nall Urdu checks passed");
process.exit(bad ? 1 : 0);
