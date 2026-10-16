#!/usr/bin/env node
/* Pre-renders the site: site/ (+ data) -> dist/ with one real HTML file per page, sitemap.xml, robots.txt, _redirects, 404.html.
   No dependencies. Run:  node scripts/build.mjs   (wrangler.jsonc runs it automatically on every deploy). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { init, applyMedia, applyOverrides, applyOrder, mergeLibraries, state, SITE, byId, seriesById, SECTIONS, secById, isFlat, href, LANGS, LANG_META, setLang, registerDict, registerGlossary, setBio, langPrefix, t } from "../site/js/core.js";
import { AR } from "../site/js/i18n.js";
import { resolve, notFoundPage, chromeTop, chromeBottom, footer, headHtml, alternates } from "../site/js/views.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "site"), OUT = path.resolve(process.env.DIST || path.join(ROOT, "dist"));
const readJSON = (f, optional = false) => { try { return JSON.parse(fs.readFileSync(path.join(SRC, f), "utf8")); } catch (e) { if (optional) return null; throw e; } };

const t0 = Date.now();
const LIB0 = mergeLibraries(readJSON("data/library.json", true), readJSON("data/makkah.json", true), readJSON("data/haram.json", true));   // library.json + lessons imported from makkahscholars.org
const CAT0 = applyOverrides(readJSON("catalogue.json"), readJSON("data/overrides.json", true));   // the YouTube catalogue + the editors' patches (admin portal)
const { cat: CAT, lib: LIB } = applyOrder(CAT0, LIB0, readJSON("data/order.json", true));         // + the editors' saved display order of series (admin portal)
init(CAT, LIB, readJSON("data/bio.json", true), readJSON("data/media.json", true), readJSON("data/schedule.json", true), readJSON("data/home.json", true));
const DB = state.DB;
{ // two series (or lessons) with the same id would silently merge or duplicate: refuse to build
  const dup = (xs, what) => { const seen = new Set(); for (const x of xs) { if (seen.has(x.id)) { console.error(`!! duplicate ${what} id: ${x.id}`); process.exit(1); } seen.add(x.id); } };
  dup(DB.series, "series"); dup(DB.lessons, "lesson");
}

/* languages: site/i18n/langs.json { enabled, indexed } (default Arabic only). `enabled` = pages are built; `indexed` = also in the sitemap and hreflang (a language can be built but still hidden from search engines).
   The env var LANGS (e.g. LANGS=ar,xx) overrides it for tests; "xx" is a pseudo-locale generated here (every UI string wrapped in ⟦ ⟧) to prove no text is hard-coded. */
const langCfg = readJSON("i18n/langs.json", true) || {};
const envLangs = process.env.LANGS ? process.env.LANGS.split(",").map(x => x.trim()).filter(Boolean) : null;
const enabled = envLangs || langCfg.enabled || ["ar"], indexed = envLangs ? (process.env.LANGS_INDEXED ? process.env.LANGS_INDEXED.split(",") : enabled) : (langCfg.indexed || ["ar"]);
if (enabled[0] !== "ar" || !indexed.includes("ar") || enabled.some(l => !Object.hasOwn(LANG_META, l)) || indexed.some(l => !enabled.includes(l))) { console.error("!! bad language configuration:", { enabled, indexed }); process.exit(1); }
LANGS.enabled = enabled; LANGS.indexed = indexed;
const PSEUDO = `import { AR } from "/js/i18n.js";
const w = v => typeof v === "function" ? p => w(v(p)) : Array.isArray(v) ? v.map(w) : typeof v === "string" ? "⟦" + v + "⟧" : v;
export default Object.fromEntries(Object.entries(AR).map(([k, v]) => [k, w(v)]));
`;
for (const l of enabled) {
  if (l === "ar") continue;
  if (l === "xx") { const w = v => typeof v === "function" ? p => w(v(p)) : Array.isArray(v) ? v.map(w) : typeof v === "string" ? "⟦" + v + "⟧" : v; registerDict("xx", Object.fromEntries(Object.entries(AR).map(([k, v]) => [k, w(v)]))); continue; }
  const f = path.join(SRC, "i18n", l + ".js");
  if (!fs.existsSync(f)) { console.error(`!! language ${l} is enabled but site/i18n/${l}.js does not exist`); process.exit(1); }
  const mod = await import(pathToFileURL(f));
  registerDict(l, mod.default); if (mod.glossary) registerGlossary(l, mod.glossary);
}

fs.rmSync(OUT, { recursive: true, force: true });   // every build starts from an empty folder: nothing from an earlier build can linger
/* Assets of languages that are NOT enabled never reach dist/ (a draft translation must not be downloadable just because its file sits in site/):
   dictionaries site/i18n/<l>.js, translated bios data/bio.<l>.json, lang-<l>.css and the language's fonts. lang-ui.css / lang-init.js only exist once they are used. */
const LANG_FONTS = { en: /^fonts\/(cardo|cormorant-garamond)-/, ur: /^fonts\/noto-nastaliq-urdu-/ };
const unused = rel => {
  let m;
  if (rel === "i18n") return enabled.length < 2;                    // the folder itself: an Arabic-only build has none
  if ((m = /^i18n\/([a-z]{2})\.js$/.exec(rel))) return !enabled.includes(m[1]);
  if ((m = /^data\/bio\.([a-z]{2})\.json$/.exec(rel))) return !enabled.includes(m[1]);
  if ((m = /^lang-([a-z]{2})\.css$/.exec(rel))) return !enabled.includes(m[1]);
  if (rel === "lang-ui.css") return enabled.length < 2;
  if (rel === "js/lang-init.js") return indexed.length < 2;
  return Object.entries(LANG_FONTS).some(([l, re]) => re.test(rel) && !enabled.includes(l));
};
fs.cpSync(SRC, OUT, { recursive: true, filter: s => !unused(path.relative(SRC, s).split(path.sep).join("/")) && !/[\\/]shell\.html$/.test(s) && !/[\\/]data[\\/](media|overrides|order)\.json$/.test(s) && !/[\\/]data[\\/](makkah|haram)\.json$/.test(s) && !/[\\/]i18n[\\/]langs\.json$/.test(s) });   // the manifest stays out of dist: the merged library below carries the mirrored links

const shell = fs.readFileSync(path.join(SRC, "shell.html"), "utf8");
const fill = (tpl, map) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => map[k]);   // single pass: page content is never re-scanned for placeholders
const FONTS = {
  ar: `<link rel="preload" href="/fonts/aref-ruqaa-arabic-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/noto-naskh-arabic-arabic-500-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/noto-naskh-arabic-arabic-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/reem-kufi-arabic-600-normal.woff2" as="font" type="font/woff2" crossorigin>`,
  ur: ["noto-nastaliq-urdu-arabic-400-normal", "noto-nastaliq-urdu-arabic-700-normal", "noto-nastaliq-urdu-latin-400-normal"].map(f => `<link rel="preload" href="/fonts/${f}.woff2" as="font" type="font/woff2" crossorigin>`).join("\n"),
  en: ["cormorant-garamond-latin-700-normal", "cormorant-garamond-latin-ext-700-normal", "cardo-latin-400-normal", "cardo-latin-ext-400-normal"].map(f => `<link rel="preload" href="/fonts/${f}.woff2" as="font" type="font/woff2" crossorigin>`).join("\n"),
};
const langHead = l => (enabled.length > 1 ? `\n<link rel="stylesheet" href="/lang-ui.css">` : "") + (fs.existsSync(path.join(SRC, `lang-${l}.css`)) ? `\n<link rel="stylesheet" href="/lang-${l}.css">` : "");   // per-language CSS/fonts; a site with Arabic only gets nothing extra
const htmlAttr = enabled.length > 1 ? ` data-langs="${enabled.join(",")}" data-indexed="${indexed.join(",")}"` : "";
const render = p => { setLang(p.lang); return fill(shell, { LANG: p.lang, DIR: LANG_META[p.lang].dir, HTMLATTR: htmlAttr, LANGINIT: indexed.length > 1 ? `\n<script src="/js/lang-init.js"></script>` : "", FONTS: FONTS[p.lang] || FONTS.ar, LANGHEAD: langHead(p.lang), SKIP: t("skip"),
  HEAD: headHtml(p), TOP: chromeTop(p.nav, p.status === 200 ? p.path : "/"), MAIN: p.html, FOOT: footer(p.status === 200 ? p.path : "/"), BOTTOM: chromeBottom(p.nav), ROUTE: p.path }); };
const write = (rel, html) => { const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html); };
const MEDIA = readJSON("data/media.json", true);
write("data/library.json", JSON.stringify(applyMedia(LIB, MEDIA)));   // the one library file browsers load: all sources merged, mirrored links applied
write("catalogue.json", JSON.stringify(CAT));                           // the one catalogue file browsers load: the editors' patches applied

/* routes */
const routes = ["/", "/library/", "/search/"];
if (DB.books.length) routes.push("/books/");
if (state.bio) routes.push("/about/");
if (state.schedule) routes.push("/schedule/");
routes.push("/news/");                                   // announcements: filled in the browser from /api/live
for (const s of SECTIONS) if (s.id !== "books" && !isFlat(s.id) && DB.series.some(x => x.sec === s.id)) routes.push(`/section/${s.id}/`);
for (const s of DB.series) routes.push(href.series(s.id));
for (const l of DB.lessons) routes.push(href.lesson(l.id));

const BIO_AR = state.bio;
const indexable = [];          // [{ path, alts }]
let bad = 0, total = 0;
for (const L of enabled) {
  const bioL = L === "ar" ? null : readJSON(`data/bio.${L}.json`, true);        // translated bio (draft for review); without it the Arabic bio is shown with a note
  setBio(bioL || BIO_AR, bioL ? L : "ar"); if (L === "ar") setBio(BIO_AR);
  for (const r0 of routes) {
    const r = langPrefix(L) + r0;
    const p = resolve(r);
    if (p.status !== 200 || p.lang !== L) { console.error("!! route did not resolve:", r); bad++; continue; }
    write(r.replace(/^\//, "") + "index.html", render(p)); total++;
    if (!p.noindex) indexable.push({ path: r, alts: alternates(p) });
  }
}
setLang("ar"); setBio(BIO_AR);
write("404.html", render(notFoundPage()));
if (enabled.includes("xx")) write("i18n/xx.js", PSEUDO);

/* sitemap / robots / redirects */
const withAlts = indexable.some(x => x.alts.length);
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${withAlts ? ' xmlns:xhtml="http://www.w3.org/1999/xhtml"' : ""}>\n${indexable.map(x => `  <url><loc>${SITE}${x.path}</loc>${x.alts.map(a => `<xhtml:link rel="alternate" hreflang="${a.hreflang}" href="${a.href}"/>`).join("")}</url>`).join("\n")}\n</urlset>\n`);
write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
const flat = SECTIONS.filter(s => s.id !== "books" && isFlat(s.id) && DB.series.some(x => x.sec === s.id));
const redirects = [];
for (const L of enabled) { setLang(L); for (const s of flat) redirects.push(`${langPrefix(L)}/section/${s.id}/ ${href.section(s)} 301`); }
setLang("ar");
write("_redirects", redirects.join("\n") + (redirects.length ? "\n" : ""));

console.log(`built ${total + 1} pages (${indexable.length} in sitemap) in ${Date.now() - t0} ms -> ${path.relative(ROOT, OUT) || "."}/` + (bad ? `  [${bad} FAILED]` : ""));
process.exit(bad ? 1 : 0);
