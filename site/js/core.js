/* Shared by the browser app and the Node pre-renderer: constants, helpers, data model. No DOM access here. */
import { ICONS } from "./icons.js";

export const SITE = "https://drwasiullah.com";
export const NAME = "الشيخ وصي الله بن محمد عباس";
export const NAME_FULL = `${NAME} حفظه الله`;
export const YT_CHANNEL = "https://www.youtube.com/@wahatsunnah12";
export const WP_SITE = "https://wasiullahabbas.wordpress.com/";

/* ───────── Site structure ─────────  Every series belongs to one section (series.sec). Books are their own collection. */
export const SECTIONS = [
  { id: "duroos",   title: "الدروس المرئية",  icon: "video",       desc: "شروح الكتب والسلاسل العلمية مرئيةً، من قناة الشيخ على يوتيوب." },
  { id: "audio",    title: "الدروس الصوتية",  icon: "headphones",  desc: "سلاسل علمية صوتية للاستماع والتحميل." },
  { id: "lectures", title: "المحاضرات",       icon: "mic-vocal",   desc: "محاضرات وكلمات وفتاوى ولقاءات منفردة." },
  { id: "khutab",   title: "الخطب",           icon: "scroll-text", desc: "خطب الجمعة والمناسبات." },
  { id: "urdu",     title: "الدروس بالأردية", icon: "languages",   desc: "دروس ومحاضرات باللغة الأردية." },
  { id: "books",    title: "الكتب",           icon: "book-open",   desc: "مؤلفات الشيخ وتحقيقاته للقراءة والتحميل." },
];
const UNIT = { muslim: "المجلس", "fadail-sahabah": "المجلس", nasai: "المجلس" };   // numbered-lesson label per series
export const SPINE = { muslim: "#1d5a47", "ibn-majah": "#7d2a1d", "fadail-sahabah": "#1f3556", jami: "#8a5a16", nuzhat: "#52305f", nasai: "#175561", misc: "#3b3630" };
export const SPINE_PALETTE = ["#1d5a47", "#7d2a1d", "#1f3556", "#8a5a16", "#52305f", "#175561", "#3b3630", "#5a3d1c", "#2f4a2a"];
export const SPINE_H = [318, 284, 300, 262, 292, 248, 276];
export const PAGE = 60;

/* ───────── Data (filled by init) ─────────  lookup tables have no prototype: "__proto__" is not an id */
export const state = { DB: null, bio: null };
export const byId = Object.create(null), seriesById = Object.create(null), secById = Object.create(null);

export function init(cat, lib = {}, bio = null, media = null) {
  const mm = media && typeof media === "object" ? media : {};   // source URL -> our own copy (tools/mirror_media.py); the original stays as the fallback
  const mine = u => { const m = Object.prototype.hasOwnProperty.call(mm, u) ? mm[u] : null; return m && typeof m.url === "string" && m.url.startsWith("https://") ? m.url : ""; };
  SECTIONS.forEach(s => secById[s.id] = s);
  const DB = {
    series: [...cat.series, ...(lib.series || [])].map(s => ({ ...s, sec: s.sec || "duroos", unit: s.unit || UNIT[s.id] })),
    lessons: [...cat.lessons, ...(lib.lessons || [])].map((l, o) => ({ ...l, ...(l.src && mine(l.src) ? { src: mine(l.src), src_alt: l.src } : {}), kind: l.kind || "video", date: l.date || "", duration: l.duration || 0, o })),
    books: (lib.books || []).map(b => ({ ...b, files: b.files.map(f => mine(f.url) ? { ...f, url: mine(f.url), url_alt: f.url } : f) })), updated: cat.updated,
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
  state.bio = bio && typeof bio === "object" && (bio.summary || (Array.isArray(bio.sections) && bio.sections.length)) ? bio : null;   // optional: supplied by the Sheikh's team
  return DB;
}

/* ───────── Helpers ───────── */
export const ic = (n, s = 20, cls = "") => `<svg class="ic ${cls}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[n] || ""}</svg>`;
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Arabic-insensitive search: drop tashkeel/tatweel, unify alef/ya/ta-marbuta, Arabic digits -> latin
export const norm = s => String(s || "").toLowerCase()
  .replace(/[ً-ٰٟـ]/g, "")
  .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
  .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
const nf = new Intl.NumberFormat("ar-EG", { useGrouping: false });
export const fmtNum = n => nf.format(n);
// Dates are shown in the Hijri (Umm al-Qura) calendar only. Input: YYYY-MM-DD.
const HIJRI = "ar-SA-u-ca-islamic-umalqura-nu-arab";
const hijriFull = new Intl.DateTimeFormat(HIJRI, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const hijriYear = new Intl.DateTimeFormat(HIJRI, { year: "numeric", timeZone: "UTC" });
const at = d => new Date(d + "T12:00:00Z");
export const fmtDate = d => d ? hijriFull.format(at(d)) : "";
const HM = ["محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"];
// `hd` = Hijri date taken from the source ("1433-3-2", "1427-3" or just "1426"); otherwise convert the Gregorian `date`.
const fmtHijri = hd => { const [y, m, d] = hd.split("-").map(Number); return [d ? fmtNum(d) : "", m ? HM[m - 1] : "", fmtNum(y), "هـ"].filter(Boolean).join(" "); };
export const ldate = l => l.hd ? fmtHijri(l.hd) : l.date ? fmtDate(l.date) : "";
export const fmtYear = d => d ? hijriYear.format(at(d)).replace(/\s*هـ$/, "") : "";
export const dur = s => { if (!s) return ""; const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };
export const isoDur = s => s ? `PT${Math.floor(s / 3600)}H${Math.floor(s % 3600 / 60)}M${s % 60}S` : "";
export const hours = s => { const h = Math.round(s / 3600); return h ? fmtNum(h) + " ساعة" : ""; };
export const dg = s => String(s ?? "").replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]);   // Arabic-Indic digits for titles from any source

/* ───────── Input sanitising ─────────  Everything that comes from the user (search boxes, URL) or from data files goes through these. */
export const MAXQ = 100, MAXTOKENS = 8;
// strip invisible/bidi-control characters (RLO tricks etc.) and control chars; keep ZWNJ/ZWJ used in Persian/Urdu
export const cleanQuery = s => String(s ?? "").normalize("NFC")
  .replace(/[­؜​‎‏‪-‮⁠-⁯﻿]/g, "")
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
export const label = l => `${seriesById[l.series].unit || "الدرس"} ${fmtNum(l.n)}`;
export const mainTitle = (l, withBook = true) => useLabel(l) ? `${label(l)}${withBook && l.section ? " — " + l.section : ""}` : dg(l.title);
export const fullTitle = l => { const s = seriesById[l.series]; return useLabel(l) ? `${label(l)} — ${s.title}` : s.ordered ? `${dg(l.title)} — ${s.title}` : dg(l.title); };
export const secOfSeries = s => secById[s.sec] || secById.duroos;
export const secOfLesson = l => secOfSeries(seriesById[l.series]);
export const seriesOrder = (a, b) => (a.n ?? 1e9) - (b.n ?? 1e9) || (a.o - b.o);
export const lang = l => secOfLesson(l).id === "urdu" ? ' lang="ur"' : "";
export const thumb = id => `https://i.ytimg.com/vi/${safeYt(id)}/mqdefault.jpg`;
export const STAR = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 0l2.6 5.4L20.5 3.5l-1.9 5.9L24 12l-5.4 2.6 1.9 5.9-5.9-1.9L12 24l-2.6-5.4-5.9 1.9 1.9-5.9L0 12l5.4-2.6-1.9-5.9 5.9 1.9z"/></svg>`;

export function match(l, q) {
  if (!q) return true;
  const s = seriesById[l.series];
  const hay = l._h || (l._h = norm(`${l.title} ${s.title} ${secOfSeries(s).title} ${l.section || ""} ${l.n != null ? "المجلس الدرس " + l.n : ""} ${fmtYear(l.date)}`));
  return norm(q).split(/\s+/).filter(Boolean).every(t => hay.includes(t));
}

const seriesIn = id => state.DB.series.filter(s => s.sec === id);
export const sectionCount = id => id === "books" ? state.DB.books.length : state.DB.lessons.filter(l => secOfLesson(l).id === id).length;
export const visible = () => SECTIONS.filter(s => sectionCount(s.id) > 0);
export const isFlat = secId => seriesIn(secId).length === 1;   // a section with one series has no page of its own: it links to that series

/* ───────── URLs (real paths, root-relative) ───────── */
export const href = {
  home: () => "/", library: () => "/library/", books: () => "/books/", about: () => "/about/",
  series: id => `/series/${encodeURIComponent(id)}/`,
  lesson: id => `/lesson/${encodeURIComponent(id)}/`,
  search: (qs = "") => "/search/" + qs,
  section: sec => sec.id === "books" ? "/books/" : isFlat(sec.id) ? href.series(seriesIn(sec.id)[0].id) : `/section/${encodeURIComponent(sec.id)}/`,
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
