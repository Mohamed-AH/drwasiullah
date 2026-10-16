/* Guard: the site is ARABIC ONLY until the Sheikh asks otherwise (docs/i18n-plan.md, banner «ON HOLD»).
   Builds with the committed configuration (no env overrides) and proves that nothing of any other language is generated or shipped:
   no language folders, no hreflang, no switcher / hint / redirect script, no sitemap alternates, no assets of other languages — even when decoy files
   of another language sit in site/ (a draft translation must never be downloadable just because its file exists).
   usage: node tests/arabic_only.mjs */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
let bad = 0;
const check = (n, c, x = "") => { if (!c) bad++; console.log(`${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + String(x).slice(0, 300)}`); };
const cfg = JSON.parse(fs.readFileSync("site/i18n/langs.json", "utf8"));
check("site/i18n/langs.json is exactly Arabic only", JSON.stringify(cfg) === JSON.stringify({ enabled: ["ar"], indexed: ["ar"] }), JSON.stringify(cfg));
const decoys = ["site/i18n/qq.js", "site/data/bio.qq.json", "site/lang-qq.css"], made = [];
for (const f of decoys) if (!fs.existsSync(f)) { fs.writeFileSync(f, "DECOY"); made.push(f); }
const dist = fs.mkdtempSync(path.join(os.tmpdir(), "aronly-"));
try {
  const env = { ...process.env, DIST: dist }; delete env.LANGS; delete env.LANGS_INDEXED;
  execFileSync("node", ["scripts/build.mjs"], { env, stdio: "pipe" });
} finally { for (const f of made) fs.rmSync(f, { force: true }); }
const all = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); e.isDirectory() ? walk(f) : all.push(path.relative(dist, f).split(path.sep).join("/")); } })(dist);
const top = fs.readdirSync(dist);
check("no language folders in dist/", !top.some(x => /^(en|ur|xx|i18n)$/.test(x)), top.join());
check("no dictionary, translated bio, language CSS or language fonts in dist/", !all.some(f => /^i18n\/|^data\/bio\.[a-z]{2}\.json$|^lang-.*\.css$|^js\/lang-init\.js$|fonts\/(cardo|cormorant|noto-nastaliq)/.test(f)), all.filter(f => /^i18n\/|bio\.[a-z]{2}\.json|^lang-|lang-init|cardo|cormorant|nastaliq/.test(f)).join());
check("decoy files of another language were not shipped", !all.some(f => /qq/.test(f)));
const html = all.filter(f => f.endsWith(".html")), bodies = html.map(f => fs.readFileSync(path.join(dist, f), "utf8"));
check(`${html.length} pages are Arabic: <html lang="ar" dir="rtl"> and nothing else`, bodies.every(b => /^<!doctype html>\s*<html lang="ar" dir="rtl">/.test(b)));
check("no hreflang, language switcher, language hint or redirect script on any page", !bodies.some(b => /hreflang|class="langs|lang-hint|lang-init|lang-ui|data-langs|data-indexed/.test(b)));
const sm = fs.readFileSync(path.join(dist, "sitemap.xml"), "utf8");
check("sitemap: only Arabic URLs, no alternates", !/xhtml:link|\/(en|ur)\//.test(sm) && /<loc>https:\/\/drwasiullah\.com\/<\/loc>/.test(sm));
check("_redirects has no language prefixes", !/^\/(en|ur)\//m.test(fs.readFileSync(path.join(dist, "_redirects"), "utf8")));
fs.rmSync(dist, { recursive: true, force: true });
console.log(bad ? `\n${bad} FAILED` : "\nthe site is Arabic only");
process.exit(bad ? 1 : 0);
