/* Titles in other languages: curated glossary lookups (series, sections, books, units, fixed phrases) and the lesson-title composer.
   Principle (docs/i18n-plan.md §3.3): structured titles are transliterated from our glossary; free text (chapter headings, YouTube titles, sermons) stays in
   Arabic script and is marked lang="ar". Nothing here changes Arabic output: every function returns its input when the page language is Arabic.
   Glossaries are registered by site/i18n/<lang>.js (registerGlossary). */
import { getLang, getGlossary } from "./i18n.js";

const G = () => getGlossary();
const stripMarks = s => String(s ?? "").replace(/[ً-ٰـ]/g, "").trim();     // tashkeel and tatweel: lookups ignore them

export const unitName = unit => { const g = G(); return g && g.units && g.units[unit] ? g.units[unit] : unit; };
export const seriesTitle = s => { const g = G(); return g && g.series && g.series[s.id] && g.series[s.id].title || null; };
export const seriesDesc = s => { const g = G(); return g && g.series && g.series[s.id] && g.series[s.id].desc || null; };
export const sectionName = raw => { if (!raw || getLang() === "ar") return raw; const g = G(); return g && g.sections && g.sections[raw] || g && g.sections && g.sections[stripMarks(raw)] || raw; };
export const bookTitle = k => { if (getLang() === "ar") return k.title; const g = G(); return g && g.books && g.books[k.id] || k.title; };
export const groupName = raw => { if (getLang() === "ar") return raw; const g = G(); return g && g.groups && g.groups[raw] || raw; };
/* fixed phrases of editor-entered data (schedule slots, book file labels, notes); volumes "ج2" -> "Vol. 2" */
export const phrase = raw => {
  if (!raw || getLang() === "ar") return raw;
  const g = G(), p = g && g.phrases;
  if (p && Object.hasOwn(p, raw)) return p[raw];
  const v = /^ج\s*(\d+)$/.exec(raw); if (v && g && g.vol) return g.vol.replace("{n}", v[1]);
  return raw;
};

/* Arabic-script runs inside text of another language get their own language and direction (screen readers, bidi). `html` is already escaped. */
const AR_RUN = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿](?:[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿‌‍ ,.:;()«»\-–—،؛؟0-9٠-٩]*[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿‌‍0-9٠-٩)»])?/g;
export const hasArabic = s => /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(String(s));
const ARABIC_ONLY = /[يكةىأإ]/;   // letters Urdu spelling does not use: a run without them on an Urdu page is Urdu, not Arabic
export const markArabic = html => getLang() === "ar" ? html : String(html).replace(AR_RUN, m => getLang() === "ur" && !ARABIC_ONLY.test(m) ? m : `<span lang="ar" dir="rtl">${m}</span>`);

/* A whole rendered page/fragment: wraps Arabic runs in the TEXT of the markup only (never inside tags/attributes), and leaves text alone that already sits
   inside an element with its own lang (lang="ar" spans, Urdu lessons). */
const VOID = new Set(["img", "input", "br", "hr", "meta", "link", "path", "circle", "rect", "line", "polyline", "polygon", "source", "col"]);
export function markArabicDoc(html) {
  if (getLang() === "ar") return html;
  const stack = [];
  return String(html).replace(/<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>|[^<]+|</g, tok => {
    if (tok[0] !== "<" || tok === "<") return !stack.some(Boolean) && hasArabic(tok) ? markArabic(tok) : tok;
    const m = /^<(\/?)([A-Za-z0-9]+)/.exec(tok); if (!m) return tok;
    const name = m[2].toLowerCase();
    if (m[1]) { stack.pop(); return tok; }
    if (VOID.has(name) || /\/>$/.test(tok)) return tok;
    stack.push(/\slang="/.test(tok));
    return tok;
  });
}

/* ───────── lesson titles ─────────  Arabic titles of numbered lessons are templates (unit + number + series + book + part). The composer reads the template
   and returns the English text, or null when the title is free text (then the caller shows the Arabic original). */
const ORD = { "الأول": 1, "الاول": 1, "الثاني": 2, "الثالث": 3, "الرابع": 4, "الخامس": 5, "السادس": 6, "السابع": 7, "الثامن": 8, "التاسع": 9, "العاشر": 10 };
const num = s => String(s).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
const UNIT_WORD = "(?:الدرس|المجلس|مجلس|المحاضرة|الخطبة)";
export function composeLesson(l, s, cx) {          // cx = { unit(en), sectionEn, series(en title), seriesAr, part: fn, hadith: fn, no: fn, more: fn, a, b }
  let T = stripMarks(String(l.title ?? "")).replace(/\s+/g, " "), part = "", sfx = "", m;
  if ((m = /\s*[—–-]\s*الجزء\s+(\S+)\s*$/.exec(T))) { const n = ORD[m[1]] || (/^\d+$/.test(num(m[1])) ? num(m[1]) : 0); if (n) { part = cx.part(n); T = T.slice(0, m.index).trim(); } }
  if ((m = /\s*\((أ|ب)\)\s*$/.exec(T))) { sfx = m[1] === "أ" ? cx.a : cx.b; T = T.slice(0, m.index).trim(); }
  const tail = x => [x, sfx, part].filter(Boolean).join(" ");
  const unit = cx.unit(l);
  const rm = x => T.replace(x, "").replace(/[\s—–\-()"«»]+/g, " ").trim();
  if ((m = /^من الحديث\s*(\d+)$/.exec(T))) return tail(cx.fromHadith(num(m[1])));                                       // Tirmidhi, Abu Dawud
  if ((m = new RegExp(`^${UNIT_WORD}\\s*\\(?\\s*(\\d+)\\s*\\)?$`).exec(T))) return tail(`${unit} ${num(m[1])}`);          // «الدرس 12»
  if ((m = /^(?:تابع\s+)?المجلس\s*\(?(\d+)\)?\s+من مجالس سماع سنن النسائي وتعليق$/.exec(T))) return tail(`${cx.unitOf("المجلس")} ${num(m[1])}` + (T.startsWith("تابع") ? ` ${cx.more}` : ""));   // Nasa'i
  if ((m = /^مجلس السماع والتعليق على كتاب فضائل الصحابة\s*\((\d+)\)$/.exec(T))) return tail(`${cx.unitOf("المجلس")} ${num(m[1])}`);
  if ((m = /^المجلس\s*\((\d+)\)\s+شرح صحيح مسلم\s*"\s*(.+?)\s*"\s*(?:الدرس\s*)?\(?(\d+)\)?$/.exec(T))) return tail([`${cx.unitOf("المجلس")} ${num(m[1])}`, cx.sectionEn || cx.sec(m[2]), cx.no(num(m[3]))].join(" · "));   // Muslim
  if ((m = /^الدرس\s*\((\d+)\)\s+شرح سنن ابن ماجه?\s*-?\s*رحمه الله-?\s*(كتاب .+?)(?:\s+ح)?\s*(\d+)?$/.exec(T))) return tail([`${unit} ${num(m[1])}`, cx.sectionEn || cx.sec(m[2]), m[3] ? (/\sح\s*\d+$/.test(T) ? cx.hadith(num(m[3])) : cx.no(num(m[3]))) : ""].filter(Boolean).join(" · "));   // Ibn Majah
  if ((m = /^كتاب (?:الديات|الحدود) من سنن ابن ماجه(?:\s*\((\d+)\))?$/.exec(T))) return tail([cx.sectionEn || cx.sec(T.replace(/ من سنن ابن ماجه.*/, "")), m[1] ? num(m[1]) : ""].filter(Boolean).join(" · "));
  if ((m = /^(كتاب .+?)\s*(?:[-–]\s*)?(باب .*)$/.exec(T)) && l.section) return tail([cx.sectionEn || cx.sec(m[1]), m[2]].join(" · "));  // Fath al-Bari: book + chapter heading (kept in Arabic)
  if ((m = new RegExp(`^${UNIT_WORD}\\s*\\(?\\s*(\\d+)\\s*\\)?\\s+(.+)$`).exec(T)) && rm(m[2]) === "" ) return tail(`${unit} ${num(m[1])}`);
  if ((m = new RegExp(`^${UNIT_WORD}\\s*\\(?\\s*(\\d+)\\s*\\)?\\s+(.+)$`).exec(T)) && cx.seriesAr && stripMarks(m[2]) === stripMarks(cx.seriesAr)) return tail(`${unit} ${num(m[1])}`);   // «الدرس 51 + series title»
  if ((m = new RegExp(`^(.+?)\\s*[—–-]\\s*${UNIT_WORD}\\s*(\\d+)$`).exec(T)) && cx.seriesAr && (stripMarks(m[1]) === stripMarks(cx.seriesAr) || cx.knownSeriesText(m[1]))) return tail(`${unit} ${num(m[2])}`);   // «series — الدرس N»
  if ((m = new RegExp(`^${UNIT_WORD}\\s*(\\d+)\\s*\\((.+)\\)$`).exec(T)) && cx.knownSeriesText(m[2])) return tail(`${unit} ${num(m[1])}`);                                                              // «الدرس 16 (سنن الترمذي)»
  if ((m = /^شرح .+?[-—–]\s*(?:المجلس\s+)?(الأول|الثاني|الثالث|الرابع|الخامس|السادس|السابع|الثامن|التاسع|العاشر)$/.exec(T)) && ORD[m[1]]) return tail(`${cx.unitOf("المجلس")} ${ORD[m[1]]}`);   // Nuzhat sessions
  if ((m = /^(?:شرح .+?)\s*[—–-]\s*(\d+)$/.exec(T))) return tail(`${unit} ${num(m[1])}`);                                                                                                               // «series — 3»
  return null;
}
