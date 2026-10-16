/* Shared by the browser app and the Node pre-renderer: constants, helpers, data model. No DOM access here. */
import { ICONS } from "./icons.js";
import { t, AR, getLang, setLang, langPrefix, LANG_META } from "./i18n.js";
import { unitName, seriesTitle, seriesDesc, sectionName, composeLesson, markArabicDoc } from "./titles.js";
export { t, getLang, setLang, langPrefix, LANG_META, registerDict, registerGlossary } from "./i18n.js";
export { sectionName, bookTitle, groupName, phrase, markArabic, markArabicDoc, hasArabic } from "./titles.js";

export const SITE = "https://drwasiullah.com";
export const NAME = AR["brand.name"];
export const NAME_FULL = `${NAME} ${AR["brand.dua"]}`;
// Wording supplied by the Sheikh's team (2026-10-04): the site's official name, his full name and his posts.
export const OFFICIAL_PRE = AR["brand.officialPre"];
export const FULL_NAME = AR["brand.fullName"];
export const ROLE = AR["brand.role"];
export const OFFICIAL_NAME = `${OFFICIAL_PRE} ${FULL_NAME}`;
export const YT_CHANNEL = "https://www.youtube.com/@wahatsunnah12";
export const WP_SITE = "https://wasiullahabbas.wordpress.com/";

/* ───────── Site structure ─────────  Every series belongs to one section (series.sec). Books are their own collection. */
export const SECTIONS = [
  { id: "duroos",   icon: "video" },
  { id: "audio",    icon: "headphones" },
  { id: "lectures", icon: "mic-vocal" },
  { id: "khutab",   icon: "scroll-text" },
  { id: "urdu",     icon: "languages" },
  { id: "books",    icon: "book-open" },
].map(s => Object.defineProperties(s, { title: { get: () => t(`sec.${s.id}.title`), enumerable: true }, desc: { get: () => t(`sec.${s.id}.desc`), enumerable: true } }));   // text follows the page language
const UNIT = { muslim: AR["unit.majlis"], "fadail-sahabah": AR["unit.majlis"], nasai: AR["unit.majlis"] };   // numbered-lesson label per series
export const SPINE = { muslim: "#1d5a47", "ibn-majah": "#7d2a1d", "fadail-sahabah": "#1f3556", jami: "#8a5a16", nuzhat: "#52305f", nasai: "#175561", misc: "#3b3630" };
export const SPINE_PALETTE = ["#1d5a47", "#7d2a1d", "#1f3556", "#8a5a16", "#52305f", "#175561", "#3b3630", "#5a3d1c", "#2f4a2a"];
export const SPINE_H = [318, 284, 300, 262, 292, 248, 276];
export const PAGE = 60;

/* ───────── Data (filled by init) ─────────  lookup tables have no prototype: "__proto__" is not an id */
export const state = { DB: null, bio: null, bioLang: "ar", schedule: null, home: null, homeCustom: false };
export const byId = Object.create(null), seriesById = Object.create(null), secById = Object.create(null);

/* Make our own R2 copy (tools/mirror_media.py -> data/media.json) the primary link and keep the original as src_alt / url_alt.
   The build applies this once and writes the merged library to dist/, so browsers never download the (large) manifest. */
export function applyMedia(lib = {}, media = null) {
  const mm = media && typeof media === "object" ? media : null;
  if (!mm) return lib;
  const mine = u => { const m = Object.prototype.hasOwnProperty.call(mm, u) ? mm[u] : null; return m && typeof m.url === "string" && m.url.startsWith("https://") ? m.url : ""; };
  return { ...lib,
    lessons: (lib.lessons || []).map(l => l.src && mine(l.src) ? { ...l, src: mine(l.src), src_alt: l.src } : l),
    books: (lib.books || []).map(b => ({ ...b, files: b.files.map(f => mine(f.url) ? { ...f, url: mine(f.url), url_alt: f.url } : f) })) };
}

/* Editors' patches on top of the YouTube catalogue (site/data/overrides.json, written by the admin portal's Publish; see db/migrations/0003_overrides.sql).
   { lessons: { id: {title, n, section, series, hd, date: value | null (= remove), hidden: true} }, series: { id: {title, description, sec, hidden: true} } }
   Only known fields with the right type are applied; anything else is ignored, so a bad patch can never break the build. */
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const LESSON_PATCH = { title: v => typeof v === "string" && v.length > 0 && v.length <= 300, n: v => Number.isInteger(v) && v > 0 && v < 10000, section: v => typeof v === "string" && v.length <= 200,
  series: v => typeof v === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(v), hd: v => typeof v === "string" && /^\d{3,4}-\d{1,2}-\d{1,2}$/.test(v), date: v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) };
const SERIES_PATCH = { title: v => typeof v === "string" && v.length > 0 && v.length <= 200, description: v => typeof v === "string" && v.length <= 400, sec: v => typeof v === "string" && /^[a-z]{3,12}$/.test(v) };
function patched(item, patch, rules) {
  const out = { ...item };
  for (const k of Object.keys(rules)) {
    if (!own(patch, k)) continue;
    if (patch[k] === null) delete out[k]; else if (rules[k](patch[k])) out[k] = patch[k];
  }
  return out;
}
export function applyOverrides(cat, ov) {
  if (!ov || typeof ov !== "object") return cat;
  const L = ov.lessons && typeof ov.lessons === "object" ? ov.lessons : {}, S = ov.series && typeof ov.series === "object" ? ov.series : {};
  const hidden = new Set();
  const series = [];
  for (const s of cat.series) {
    const p = own(S, s.id) && S[s.id] && typeof S[s.id] === "object" ? S[s.id] : null;
    if (p && p.hidden === true) { hidden.add(s.id); continue; }
    series.push(p ? patched(s, p, SERIES_PATCH) : s);
  }
  const lessons = [];
  for (const l of cat.lessons) {
    const p = own(L, l.id) && L[l.id] && typeof L[l.id] === "object" ? L[l.id] : null;
    if (p && p.hidden === true) continue;
    const x = p ? patched(l, p, LESSON_PATCH) : l;
    if (!hidden.has(x.series)) lessons.push(x);
  }
  return { ...cat, series, lessons };
}

/* Editors' saved display order (site/data/order.json, written by the admin portal's Publish): { seriesId: [lessonId, ...] } first lesson first.
   Gives the lessons of those series an `ord` (1..n) and flags the series `manual`; lessons missing from a list (new uploads, new videos) go AFTER the listed ones
   in the default order (number, then original position); ids that are not in the series (moved, removed, bad) are ignored. Series without a list are untouched.
   Returns copies; the inputs are not modified. Works on the catalogue and the merged library together. */
export function applyOrder(cat, lib, order) {
  if (!order || typeof order !== "object") return { cat, lib };
  const lessons = [...cat.lessons.map((l, i) => ({ l, c: 0, i })), ...(lib.lessons || []).map((l, i) => ({ l, c: 1, i }))];
  const bySeries = new Map();
  lessons.forEach((x, o) => { (bySeries.get(x.l.series) || bySeries.set(x.l.series, []).get(x.l.series)).push({ ...x, o }); });
  const ord = new Map();   // lesson object -> position
  const manual = new Set();
  for (const sid of Object.keys(order)) {
    const list = Array.isArray(order[sid]) ? order[sid] : null, mine = bySeries.get(sid);
    if (!list || !mine || !own(order, sid)) continue;
    const byId = new Map(mine.map(x => [x.l.id, x]));
    const seen = new Set(), listed = [];
    for (const id of list) if (typeof id === "string" && byId.has(id) && !seen.has(id)) { seen.add(id); listed.push(byId.get(id)); }
    const rest = mine.filter(x => !seen.has(x.l.id)).sort((a, b) => (a.l.n ?? 1e9) - (b.l.n ?? 1e9) || a.o - b.o);
    [...listed, ...rest].forEach((x, k) => ord.set(x.l, k + 1));
    manual.add(sid);
  }
  if (!manual.size) return { cat, lib };
  const mapL = ls => (ls || []).map(l => ord.has(l) ? { ...l, ord: ord.get(l) } : l);
  const mapS = ss => (ss || []).map(s => manual.has(s.id) ? { ...s, manual: true } : s);
  return { cat: { ...cat, lessons: mapL(cat.lessons), series: mapS(cat.series) }, lib: { ...lib, lessons: mapL(lib.lessons), series: mapS(lib.series) } };
}

/* Library files that add to library.json (lessons imported from other sources, e.g. data/makkah.json). */
export const mergeLibraries = (...libs) => libs.filter(Boolean).reduce((a, b) => ({ ...a, ...b, series: [...(a.series || []), ...(b.series || [])], lessons: [...(a.lessons || []), ...(b.lessons || [])], books: [...(a.books || []), ...(b.books || [])] }), {});

export function init(cat, lib = {}, bio = null, media = null, schedule = null, home = null) {
  lib = applyMedia(lib, media);
  SECTIONS.forEach(s => secById[s.id] = s);
  const DB = {
    series: [...cat.series, ...(lib.series || [])].map(s => localised({ ...s, sec: s.sec || "duroos", unit: s.unit || UNIT[s.id] })),
    lessons: [...cat.lessons, ...(lib.lessons || [])].map((l, o) => ({ ...l, kind: l.kind || "video", date: l.date || "", duration: l.duration || 0, o })),
    books: lib.books || [], updated: cat.updated,
  };
  DB.series.forEach(s => seriesById[s.id] = s);
  DB.lessons = DB.lessons.filter(l => seriesById[l.series]).sort((a, b) => b.date.localeCompare(a.date) || a.o - b.o);   // dated newest-first, undated last
  DB.lessons.forEach(l => byId[l.id] = l);
  DB.series.forEach(s => {   // uniform per-series stats, whatever the source
    const ls = DB.lessons.filter(l => l.series === s.id), ds = ls.map(l => l.date).filter(Boolean).sort();
    s.count = ls.length; s.seconds = ls.every(l => l.duration) ? ls.reduce((a, l) => a + l.duration, 0) : 0; s.first = ds[0] || ""; s.last = ds[ds.length - 1] || "";
  });
  DB.series = DB.series.filter(s => s.count > 0);
  state.DB = DB;
  state.schedule = cleanSchedule(schedule);   // optional: the weekly timetable (data/schedule.json)
  state.home = cleanHome(home); state.homeCustom = !!home;               // optional: order/visibility of the home page blocks (data/home.json); without it the default layout
  setBio(bio);
  return DB;
}
/* optional bio (supplied by the Sheikh's team); `lang` = the language the text is in, so a page in another language can say when it shows the Arabic one */
export function setBio(bio, lang = "ar") {
  state.bio = bio && typeof bio === "object" && (bio.summary || (Array.isArray(bio.sections) && bio.sections.length)) ? bio : null;
  state.bioLang = lang;
}
/* a series keeps its Arabic text (`title_ar`, `description_ar`); `title` / `description` follow the language of the page being rendered (glossary, else the Arabic) */
function localised(o) {
  const t0 = o.title, d0 = o.description;
  Object.defineProperties(o, {
    title_ar: { value: t0, enumerable: false }, description_ar: { value: d0, enumerable: false },
    title: { get() { return getLang() === "ar" ? t0 : seriesTitle(this) || t0; }, set(v) { Object.defineProperty(this, "title", { value: v, writable: true, enumerable: true, configurable: true }); }, enumerable: true, configurable: true },
    description: { get() { return getLang() === "ar" || !d0 ? d0 : seriesDesc(this) || d0; }, set(v) { Object.defineProperty(this, "description", { value: v, writable: true, enumerable: true, configurable: true }); }, enumerable: true, configurable: true },
  });
  return o;
}

/* ───────── Home layout ─────────  data/home.json -> { blocks: [{ id, on, title?, count?, series? }] }. The hero stays first and fixed.
   A fixed palette of blocks (not a page builder): unknown ids are dropped, missing ones are appended with their defaults, everything else is clamped. */
export const HOME_BLOCKS = [
  { id: "news", name: AR["home.news"] }, { id: "schedule", name: AR["home.schedule"] }, { id: "about", name: AR["home.about"] },
  { id: "sections", name: AR["home.sections"] }, { id: "shelf", name: AR["home.shelf"], count: 10, min: 3, max: 16 }, { id: "latest", name: AR["home.latest"], count: 8, min: 4, max: 24 },
];
export function cleanHome(raw) {
  const given = raw && typeof raw === "object" && Array.isArray(raw.blocks) ? raw.blocks : [], seen = new Set(), out = [];
  const clip = (v, n) => String(v ?? "").replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim().slice(0, n);
  const one = (def, x) => {
    const b = { id: def.id, on: x ? x.on !== false : true };
    const title = clip(x && x.title, 60); if (title) b.title = title;
    if (def.count) { const c = Number.parseInt(x && x.count, 10); b.count = Number.isInteger(c) ? Math.min(def.max, Math.max(def.min, c)) : def.count; }
    if (def.id === "shelf") { const ids = Array.isArray(x && x.series) ? x.series.filter(i => typeof i === "string" && seriesById[i]) : []; b.series = [...new Set(ids)].slice(0, def.max); }
    return b;
  };
  for (const x of given) { const def = x && HOME_BLOCKS.find(d => d.id === x.id); if (!def || seen.has(def.id)) continue; seen.add(def.id); out.push(one(def, x)); }
  for (const def of HOME_BLOCKS) if (!seen.has(def.id)) out.push(one(def, null));
  return { blocks: out };
}

/* ───────── Weekly schedule ─────────  data/schedule.json -> { note, days: [{ i, day, slots: [{ time, title, series?, lang, note? }] }] } or null.
   Everything is whitelisted: days by name, language by value, series must exist, strings are length-capped; slots marked "pending" never show. */
export const WEEKDAYS = AR["weekdays"];   // index = Date#getDay(); these Arabic names are also the keys used in schedule.json
export function cleanSchedule(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.slots)) return null;
  const str = (x, n) => typeof x === "string" ? x.replace(/[\u0000-\u001f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim().slice(0, n) : "";
  const idx = d => WEEKDAYS.indexOf(str(d, 20).replace("الاثنين", "الإثنين")  /* i18n-allow */);
  const byDay = WEEKDAYS.map(() => []);
  raw.slots.forEach((x, k) => {
    if (!x || typeof x !== "object" || x.pending) return;
    const title = str(x.title, 120), time = str(x.time, 60); if (!title) return;
    const slot = { id: /^[a-z0-9-]{1,20}$/.test(String(x.id ?? "")) ? String(x.id) : "s" + (k + 1), time, title, lang: x.lang === "ur" ? "ur" : "ar", note: str(x.note, 160), series: typeof x.series === "string" && seriesById[x.series] ? x.series : "", order: Number.isFinite(x.order) ? x.order : 50, k };
    (Array.isArray(x.days) ? x.days : []).map(idx).filter(i => i >= 0).forEach(i => byDay[i].push(slot));
  });
  const days = byDay.map((slots, i) => ({ i, day: WEEKDAYS[i], slots: slots.sort((a, b) => a.order - b.order || a.k - b.k) })).filter(d => d.slots.length);
  let live = null;   // optional live-stream button: https link on mixlr.com only
  if (raw.live && typeof raw.live === "object") { try { const u = new URL(String(raw.live.url)); if (u.protocol === "https:" && /^(www\.)?mixlr\.com$/.test(u.hostname)) live = { url: u.href, label: str(raw.live.label, 40) || AR["sched.liveDefault"], sub: str(raw.live.sub, 60) }; } catch {} }
  return days.length ? { note: str(raw.note, 300), days, live } : null;
}

/* ───────── Helpers ───────── */
export const isLtr = () => LANG_META[getLang()].dir === "ltr";
/* the chevrons are drawn for right-to-left pages ("chevron-left" = forward); in a left-to-right page forward points right */
export const ic = (n, s = 20, cls = "") => `<svg class="ic ${cls}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[n === "chevron-left" && isLtr() ? "chevron-right" : n] || ""}</svg>`;
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Arabic-insensitive search: drop tashkeel/tatweel, unify alef/ya/ta-marbuta, Arabic digits -> latin
export const norm = s => String(s || "").toLowerCase()
  .replace(/[ً-ٰٟـ]/g, "")  /* i18n-allow */
  .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")  /* i18n-allow */
  .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))  /* i18n-allow */
  .replace(/[\u06cc\u06d2]/g, "\u064a").replace(/\u06a9/g, "\u0643").replace(/[\u06c1\u06be\u06c3]/g, "\u0647").replace(/\u06ba/g, "\u0646")   // Urdu letters -> the Arabic ones (ی ے ک ہ ھ ۃ ں): an Urdu query finds Arabic titles and the other way round
  .replace(/[\p{Script=Latin}\u02b0-\u02ff\u0300-\u036f’']+/gu, r => r.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[ʿʾʻʼ’']/g, ""));   // Latin: ā ḥ ṣ … -> a h s …, the apostrophe-like letters (ʿayn, hamza) dropped
const nf = new Intl.NumberFormat("ar-EG", { useGrouping: false }), nfWest = new Intl.NumberFormat("en-US");
export const fmtNum = n => getLang() === "ar" ? nf.format(n) : nfWest.format(n);                 // other languages: Western digits (docs/i18n-plan.md)
const N = x => getLang() === "ar" ? nf.format(x) : String(x);                                    // years and day numbers: never grouped
// Dates are shown in the Hijri (Umm al-Qura) calendar only. Input: YYYY-MM-DD.
const HIJRI = "ar-SA-u-ca-islamic-umalqura-nu-arab";
const hijriFull = new Intl.DateTimeFormat(HIJRI, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const hijriYear = new Intl.DateTimeFormat(HIJRI, { year: "numeric", timeZone: "UTC" });
const at = d => new Date(d + "T12:00:00Z");
const hijriEn = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" });
const hijriParts = d => { const o = {}; for (const p of hijriEn.formatToParts(at(d))) o[p.type === "relatedYear" ? "year" : p.type] = p.value; return o; };
export const fmtDate = d => {
  if (!d) return "";
  if (getLang() === "ar") return hijriFull.format(at(d));
  const o = hijriParts(d); return t("date.fmt", { d: String(+o.day), m: t("hijri.months")[o.month - 1], y: String(+o.year), era: t("hijri.era") });
};
// `hd` = Hijri date taken from the source ("1433-3-2", "1427-3" or just "1426"); otherwise convert the Gregorian `date`.
const fmtHijri = hd => { const [y, m, d] = hd.split("-").map(Number); return t("date.fmt", { d: d ? N(d) : "", m: m ? t("hijri.months")[m - 1] : "", y: N(y), era: t("hijri.era") }); };
export const ldate = l => l.hd ? fmtHijri(l.hd) : l.date ? fmtDate(l.date) : "";
export const fmtYear = d => d ? (getLang() === "ar" ? hijriYear.format(at(d)).replace(/\s*هـ$/, "") : String(+hijriParts(d).year)) : "";  /* i18n-allow */
export const dur = s => { if (!s) return ""; const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };
export const isoDur = s => s ? `PT${Math.floor(s / 3600)}H${Math.floor(s % 3600 / 60)}M${s % 60}S` : "";
export const hours = s => { const h = Math.round(s / 3600); return h ? t("hours", { n: fmtNum(h) }) : ""; };
export const dg = s => getLang() === "ar" ? String(s ?? "").replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]) : String(s ?? "");  /* i18n-allow */   // Arabic-Indic digits for titles from any source

/* ───────── Input sanitising ─────────  Everything that comes from the user (search boxes, URL) or from data files goes through these. */
export const MAXQ = 100, MAXTOKENS = 8;
// strip invisible/bidi-control characters (RLO tricks etc.) and control chars; keep ZWNJ/ZWJ used in Persian/Urdu
export const cleanQuery = s => String(s ?? "").normalize("NFC")
  .replace(/[­؜​‎‏‪-‮⁠-⁯﻿]/g, "")  /* i18n-allow */
  .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ").replace(/\s+/g, " ").trim()
  .slice(0, MAXQ).split(" ").slice(0, MAXTOKENS).join(" ");
export const safeDecode = s => { try { return decodeURIComponent(s); } catch { return ""; } };   // malformed %-sequences must not crash routing
export const oneOf = (v, allowed, dflt = "") => allowed.includes(v) ? v : dflt;                   // whitelist URL parameters
export const safeUrl = u => { try { const x = new URL(String(u)); return x.protocol === "https:" ? x.href : "#"; } catch { return "#"; } };   // https only: no javascript:/data:
export const safeYt = id => /^[\w-]{11}$/.test(String(id)) ? String(id) : "";                       // YouTube ids are exactly 11 chars
export const safeLang = l => /^[a-z]{2,3}$/.test(String(l)) ? String(l) : "";
export const jsonLd = o => JSON.stringify(o).replace(/</g, "\\u003c");                              // safe inside <script type="application/ld+json">

/* ───────── Model helpers ───────── */
export const kindIcon = l => l.kind === "audio" ? "headphones" : "video";
export const useLabel = l => l.kind === "video" && l.n != null && l.series !== "misc";   // YouTube titles are long; show "المجلس N" instead
export const label = l => `${unitName(seriesById[l.series].unit) || t("unit.lesson")} ${fmtNum(l.n)}`;
/* other languages: titles of numbered lessons are composed from their Arabic template (titles.js composeLesson); free text stays Arabic (null here) */
let knownTitles = null;
function composed(l) {
  const L = getLang(); if (L === "ar") return null;
  const key = "_c" + L; if (own(l, key)) return l[key];
  const s = seriesById[l.series], P = (k, n) => t(k, { n: fmtNum(n) });
  if (!knownTitles) knownTitles = new Set(Object.values(seriesById).map(x => norm(x.title_ar)));
  let r = null;
  try {
    r = composeLesson(l, s, { unit: () => unitName(s.unit || AR["unit.lesson"]), unitOf: u => unitName(u), sectionEn: l.section && sectionName(l.section) !== l.section ? sectionName(l.section) : "", seriesAr: s.title_ar, sec: sectionName,
      knownSeriesText: x => knownTitles.has(norm(x)), part: n => P("cx.part", n), hadith: n => P("cx.hadith", n), no: n => P("cx.no", n), fromHadith: n => P("cx.fromHadith", n), more: t("cx.more"), a: t("cx.a"), b: t("cx.b") });
  } catch { r = null; }
  Object.defineProperty(l, key, { value: r, enumerable: false, configurable: true, writable: true });
  return r;
}
export const mainTitle = (l, withBook = true) => useLabel(l) ? `${label(l)}${withBook && l.section ? " — " + sectionName(l.section) : ""}` : composed(l) || dg(l.title);
export const fullTitle = l => { const s = seriesById[l.series], c = useLabel(l) ? null : composed(l); return useLabel(l) ? `${label(l)} — ${s.title}` : c ? `${c} — ${s.title}` : s.ordered ? `${dg(l.title)} — ${s.title}` : dg(l.title); };
export const secOfSeries = s => secById[s.sec] || secById.duroos;
export const secOfLesson = l => secOfSeries(seriesById[l.series]);
export const seriesOrder = (a, b) => (a.ord ?? 1e9) - (b.ord ?? 1e9) || (a.n ?? 1e9) - (b.n ?? 1e9) || (a.o - b.o);   // ord = the editors' saved display order (see applyOrder), else number, else original position
export const lang = l => secOfLesson(l).id === "urdu" ? ' lang="ur"' : "";
export const thumb = id => `https://i.ytimg.com/vi/${safeYt(id)}/mqdefault.jpg`;
export const STAR = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 0l2.6 5.4L20.5 3.5l-1.9 5.9L24 12l-5.4 2.6 1.9 5.9-5.9-1.9L12 24l-2.6-5.4-5.9 1.9 1.9-5.9L0 12l5.4-2.6-1.9-5.9 5.9 1.9z"/></svg>`;

export function match(l, q) {
  if (!q) return true;
  const s = seriesById[l.series];
  const L = getLang();
  if (l._hl !== L) {   // cached per language: the build renders several languages in one process
    l._hl = L;
    l._h = norm(`${l.title} ${s.title} ${secOfSeries(s).title} ${l.section || ""} ${l.n != null ? "المجلس الدرس " + l.n : ""} ${fmtYear(l.date)}`  /* i18n-allow */
      + (L === "ar" ? "" : ` ${s.title_ar} ${secOfSeries(s).title} ${l.section ? sectionName(l.section) : ""} ${l.n != null ? t("search.words", { n: l.n }) : ""} ${mainTitle(l)} ${fullTitle(l)}`));
  }
  const hay = l._h;
  return norm(q).split(/\s+/).filter(Boolean).every(t => hay.includes(t));
}

const seriesIn = id => state.DB.series.filter(s => s.sec === id);
export const sectionCount = id => id === "books" ? state.DB.books.length : state.DB.lessons.filter(l => secOfLesson(l).id === id).length;
export const visible = () => SECTIONS.filter(s => sectionCount(s.id) > 0);
export const isFlat = secId => seriesIn(secId).length === 1;   // a section with one series has no page of its own: it links to that series

/* ───────── URLs (real paths, root-relative) ───────── */
/* every internal link goes through here: the language prefix ("" for Arabic, "/en", "/ur") comes from the page being rendered */
export const href = {
  home: () => langPrefix() + "/", library: () => langPrefix() + "/library/", books: () => langPrefix() + "/books/", about: () => langPrefix() + "/about/",
  schedule: () => langPrefix() + "/schedule/", news: () => langPrefix() + "/news/",
  series: id => `${langPrefix()}/series/${encodeURIComponent(id)}/`,
  lesson: id => `${langPrefix()}/lesson/${encodeURIComponent(id)}/`,
  search: (qs = "") => langPrefix() + "/search/" + qs,
  section: sec => sec.id === "books" ? href.books() : isFlat(sec.id) ? href.series(seriesIn(sec.id)[0].id) : `${langPrefix()}/section/${encodeURIComponent(sec.id)}/`,
};
/* languages that exist in this build (the pre-renderer sets it; the browser adds the language of the page it is on) */
export const LANGS = { enabled: ["ar"], indexed: ["ar"] };   // enabled = built; indexed = also in the sitemap / hreflang (a language can be built but not yet public)
export const splitLang = pathname => {                       // "/en/series/x/" -> { lang: "en", path: "/series/x/" }; Arabic paths have no prefix
  const m = /^\/([a-z]{2})(\/.*)?$/.exec(String(pathname));
  return m && m[1] !== "ar" && LANGS.enabled.includes(m[1]) ? { lang: m[1], path: m[2] || "/" } : { lang: "ar", path: String(pathname) };
};
export { seriesIn };

/* old hash URLs (#/watch/ID …) -> new paths, used to keep shared links alive */
export function hashToPath(hash) {
  const [path, qs] = String(hash).replace(/^#/, "").split("?");
  const [, a, b0] = path.split("/"), b = b0 ? safeDecode(b0).slice(0, 80) : "";
  if (!a) return "/";
  if (a === "series" && b) return href.series(b);
  if (a === "watch" && b) return href.lesson(b);
  if (a === "section" && b) return secById[b] ? href.section(secById[b]) : "/library/";
  if (a === "books" || a === "library") return `/${a}/`;
  if (a === "search" || a === "lessons") return "/search/" + (qs ? "?" + qs : "");
  return "/";
}
