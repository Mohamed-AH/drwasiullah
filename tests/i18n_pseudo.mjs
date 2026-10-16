/* Proves the language plumbing with a pseudo-locale ("xx": every dictionary string wrapped in ⟦ ⟧), without any real translation:
   build A  LANGS=ar,xx  LANGS_INDEXED=ar   (soft launch: xx is built but hidden from search engines)
   build B  LANGS=ar,xx                      (both languages public: hreflang, sitemap alternates)
   usage: node tests/i18n_pseudo.mjs [dirA dirB]   (without arguments it builds into temporary folders) */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { AR } from "../site/js/i18n.js";
let bad = 0;
const check = (n, c, x = "") => { if (!c) bad++; console.log(`${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + String(x).slice(0, 300)}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pseudo-"));
const build = (out, env) => execFileSync("node", ["scripts/build.mjs"], { env: { ...process.env, DIST: out, ...env }, encoding: "utf8" }).trim().split("\n").pop();
const A = process.argv[2] || path.join(tmp, "A"), B = process.argv[3] || path.join(tmp, "B");
if (!process.argv[2]) { console.log("A:", build(A, { LANGS: "ar,xx", LANGS_INDEXED: "ar" })); console.log("B:", build(B, { LANGS: "ar,xx", LANGS_INDEXED: "ar,xx" })); }
const files = d => { const out = []; (function walk(p) { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const f = path.join(p, e.name); e.isDirectory() ? walk(f) : out.push(f); } })(d); return out; };
const read = f => fs.readFileSync(f, "utf8");
const pagesOf = (d, lang) => files(d).filter(f => f.endsWith("index.html")).filter(f => { const r = path.relative(d, f); return lang === "xx" ? r.startsWith("xx" + path.sep) : !r.startsWith("xx" + path.sep); });

/* ---- B: both languages public ---- */
const arB = pagesOf(B, "ar"), xxB = pagesOf(B, "xx");
check("xx has exactly the same pages as Arabic", arB.length === xxB.length && arB.length > 3000, `${arB.length} vs ${xxB.length}`);
const home = read(path.join(B, "index.html")), xhome = read(path.join(B, "xx/index.html"));
check("Arabic pages: lang/dir as before + language list attributes", /^<!doctype html>\n<html lang="ar" dir="rtl" data-langs="ar,xx" data-indexed="ar,xx">/.test(home), home.slice(0, 120));
check("xx pages: lang=xx dir=ltr", /<html lang="xx" dir="ltr" data-langs="ar,xx" data-indexed="ar,xx">/.test(xhome));
check("404.html stays Arabic", /<html lang="ar" dir="rtl"/.test(read(path.join(B, "404.html"))));
check("the pseudo dictionary is shipped for the browser", fs.existsSync(path.join(B, "i18n/xx.js")) && /registerDict|export default/.test(read(path.join(B, "i18n/xx.js"))));

/* hreflang symmetry */
const alts = h => [...h.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="https:\/\/drwasiullah\.com([^"]*)">/g)].map(m => `${m[1]} ${m[2]}`);
const toFile = u => path.join(B, u.replace(/^\//, ""), "index.html");
let asym = 0, noAlt = 0, checked = 0;
for (const f of [...arB, ...xxB]) {
  const h = read(f); if (/name="robots" content="noindex/.test(h)) continue;
  const a = alts(h); checked++;
  if (a.length !== 3) { noAlt++; continue; }
  for (const x of a) { const u = x.split(" ")[1]; if (!fs.existsSync(toFile(u))) { asym++; break; } const b = alts(read(toFile(u))); if (JSON.stringify(b) !== JSON.stringify(a)) { asym++; break; } }
}
check(`hreflang: every indexable page lists ar, xx and x-default; targets exist and list the same set (${checked} pages)`, !asym && !noAlt, `${asym} asymmetric, ${noAlt} without alternates`);
check("x-default points to the Arabic page", /hreflang="x-default" href="https:\/\/drwasiullah\.com\/"/.test(home) && /hreflang="x-default" href="https:\/\/drwasiullah\.com\/"/.test(xhome));
check("canonical of an xx page is its own URL", /rel="canonical" href="https:\/\/drwasiullah\.com\/xx\/"/.test(xhome));
check("og:locale follows the language", /og:locale" content="ar_AR"/.test(home) && /og:locale" content="en_XA"/.test(xhome));
const smB = read(path.join(B, "sitemap.xml")), locs = (smB.match(/<loc>/g) || []).length;
check("sitemap lists both languages with xhtml alternates", /xmlns:xhtml/.test(smB) && smB.includes("<loc>https://drwasiullah.com/xx/series/") && locs === 2 * (locs / 2) && (smB.match(/xhtml:link/g) || []).length === locs * 3, `${locs} locs`);
const redirB = read(path.join(B, "_redirects"));
check("_redirects has the flat-section lines for xx too", /^\/xx\/section\/[a-z]+\/ \/xx\/series\//m.test(redirB) && /^\/section\/[a-z]+\/ \/series\//m.test(redirB));

/* internal links on xx pages never leak to the Arabic URLs */
const ASSET = /^\/(files|og|fonts|js|i18n|data|api)\/|^\/(favicon\.svg|styles\.css|lang-[a-z]+\.css|catalogue\.json|sitemap\.xml|robots\.txt)$/;
let leaks = [], nlinks = 0;
for (const f of xxB) {
  const h = read(f).replace(/<a [^>]*\bdata-lang="[^"]*"[^>]*>/g, "<a>");   // the language switcher links to the other languages on purpose
  for (const m of h.matchAll(/(?:href|action)="(\/[^"]*)"/g)) { const u = m[1]; if (u.startsWith("//") || ASSET.test(u) || u.startsWith("/xx/") || u === "/xx") { nlinks++; continue; } leaks.push(`${path.relative(B, f)} -> ${u}`); }
}
check(`xx pages: all ${nlinks} internal links stay in /xx/ (or are assets)`, !leaks.length, leaks.slice(0, 4).join(" | "));

/* no hard-coded interface text: after removing the ⟦…⟧ wrappers no dictionary sentence may remain */
const dataText = ["schedule", "bio", "home"].map(n => fs.existsSync(`site/data/${n}.json`) ? read(`site/data/${n}.json`) : "").join("\n");   // default texts that the data files also contain are not leaks
const dataLevel = new Set([...read("site/js/core.js").matchAll(/AR\["([^"]+)"\]/g)].map(m => m[1]));
const vals = Object.entries(AR).filter(([k, v]) => typeof v === "string" && v.length >= 12 && !dataLevel.has(k) && !/^(ld|hero\.nm)/.test(k) && !dataText.includes(v))   // names also occur in the data itself (bio, titles).map(([k, v]) => [k, v]);
const sample = ["xx/index.html", "xx/library/index.html", "xx/books/index.html", "xx/about/index.html", "xx/schedule/index.html", "xx/news/index.html", "xx/search/index.html"]
  .concat(["series", "lesson", "section"].map(k => { const dir = path.join(B, "xx", k); const e = fs.existsSync(dir) ? fs.readdirSync(dir)[0] : null; return e ? `xx/${k}/${e}/index.html` : null; }).filter(Boolean)).filter(r => fs.existsSync(path.join(B, r)));
let unwrapped = [];
const unwrap = x => { let p; do { p = x; x = x.replace(/⟦[^⟦⟧]*⟧/g, ""); } while (x !== p); return x.replace(/⟦[^"<]*/g, ""); };   // nested wrappers (a wrapped sentence that contains wrapped words) and descriptions clipped to 160 characters
for (const r of sample) { const h = unwrap(read(path.join(B, r)).replace(/<span lang="ar" dir="rtl">|<\/span>/g, "")); for (const [k, v] of vals) if (h.includes(v)) unwrapped.push(`${r}: ${k}`); }
check(`interface text on ${sample.length} sample xx pages is fully wrapped (no hard-coded string leaks)`, !unwrapped.length, unwrapped.slice(0, 5).join(" | "));
check("xx home page is full of wrapped strings", (xhome.match(/⟦/g) || []).length > 40, (xhome.match(/⟦/g) || []).length);
check("Arabic home page has none", !home.includes("⟦"));

/* ---- A: soft launch (built, not public) ---- */
const xhomeA = read(path.join(A, "xx/index.html")), homeA = read(path.join(A, "index.html"));
check("A: xx pages are noindex", /name="robots" content="noindex, follow"/.test(xhomeA));
check("A: Arabic pages have no hreflang and are still indexable", !/hreflang=/.test(homeA) && /name="robots" content="index, follow/.test(homeA));
const smA = read(path.join(A, "sitemap.xml"));
check("A: sitemap has no xx URLs and no xhtml block", !smA.includes("/xx/") && !/xhtml/.test(smA));
check("A: Arabic page list is the same size as in B", pagesOf(A, "ar").length === arB.length);
console.log(bad ? `${bad} FAILED` : "all pseudo-locale checks passed");
if (!process.argv[2]) fs.rmSync(tmp, { recursive: true, force: true });
process.exit(bad ? 1 : 0);
