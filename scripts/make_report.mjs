#!/usr/bin/env node
/* Content report of the site -> two PDFs (full report, short summary). Uses the SAME data and date code as the site (core.js), so the numbers match.
     node scripts/make_report.mjs [outDir]          (default outDir: docs/)
   Needs Playwright with Chromium (PDF printing) and `pdftotext` (poppler) to fill the table of contents with page numbers.
   Output: <outDir>/site-content-report.pdf (everything, by series) and <outDir>/site-content-summary.pdf (the summary pages only). */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { init, applyMedia, mergeLibraries, state, seriesById, SECTIONS, secOfSeries, seriesOrder, fmtNum, fmtDate, ldate, dur, hours, dg, OFFICIAL_NAME } from "../site/js/core.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "site");
const OUT = path.resolve(process.argv[2] || path.join(ROOT, "docs"));
const readJSON = (f, optional = false) => { try { return JSON.parse(fs.readFileSync(path.join(SRC, f), "utf8")); } catch (e) { if (optional) return null; throw e; } };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ───────── data (same merge as scripts/build.mjs) ───────── */
const LIB = mergeLibraries(readJSON("data/library.json", true), readJSON("data/makkah.json", true), readJSON("data/haram.json", true));
init(readJSON("catalogue.json"), LIB, readJSON("data/bio.json", true), readJSON("data/media.json", true), readJSON("data/schedule.json", true));
const DB = state.DB;

/* a sortable key (YYYYMMDD in the Hijri calendar) for any lesson: from the source's Hijri date, else converted from the Gregorian one */
const hij = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC" });
const key = l => {
  if (l.hd) { const [y, m = 0, d = 0] = l.hd.split("-").map(Number); return y * 10000 + m * 100 + d; }
  if (l.date) { const p = Object.fromEntries(hij.formatToParts(new Date(l.date + "T12:00:00Z")).map(x => [x.type, x.value])); return +p.year * 10000 + +p.month * 100 + +p.day; }
  return 0;
};
const HM = ["محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"];
const showKey = k => { const y = Math.floor(k / 10000), m = Math.floor(k / 100) % 100, d = k % 100; return [d ? fmtNum(d) : "", m ? HM[m - 1] : "", fmtNum(y), "هـ"].filter(Boolean).join(" "); };
const upload = l => l.kind === "video" && !l.hd && !!l.date;     // YouTube lessons known only by their upload date

const sectionsOrder = [...SECTIONS.filter(s => s.id !== "books").map(s => s.id), ...["khutab", "urdu"].filter(id => !SECTIONS.some(s => s.id === id))];
const secTitle = { duroos: "الدروس المرئية", audio: "الدروس الصوتية", lectures: "المحاضرات", khutab: "الخطب", urdu: "الدروس بالأردية" };
SECTIONS.forEach(s => { secTitle[s.id] = s.title; });

const groups = sectionsOrder.map(id => {
  const series = DB.series.filter(s => (secOfSeries(s).id) === id).map(s => {
    const ls = DB.lessons.filter(l => l.series === s.id);
    const ordered = !!s.ordered || ls.some(l => l.n != null);
    ls.sort(ordered ? seriesOrder : (a, b) => (key(a) || 9e9) - (key(b) || 9e9) || a.o - b.o);
    const keys = ls.map(key).filter(Boolean);
    // "unnumbered" is reported only for series that are numbered (most lessons have a number) and miss it on a few
    const kind = ls.every(l => l.kind === "video") ? "مرئي" : ls.every(l => l.kind === "audio") ? "صوتي" : "صوتي ومرئي";
    return { s, ls, kind, min: keys.length ? Math.min(...keys) : 0, max: keys.length ? Math.max(...keys) : 0, undated: ls.filter(l => !key(l)).length, unnumbered: ls.filter(l => l.n != null).length >= ls.length / 2 ? ls.filter(l => l.n == null).length : 0, seconds: ls.reduce((a, l) => a + (l.kind === "video" ? l.duration || 0 : 0), 0), allVideo: ls.every(l => l.kind === "video") };
  }).sort((a, b) => b.ls.length - a.ls.length);
  return { id, title: secTitle[id], series };
}).filter(g => g.series.length);
groups.forEach(g => { g.count = g.series.reduce((a, x) => a + x.ls.length, 0); g.min = Math.min(...g.series.map(x => x.min).filter(Boolean)); g.max = Math.max(...g.series.map(x => x.max)); g.videoSeconds = g.series.reduce((a, x) => a + x.seconds, 0); });
const all = groups.flatMap(g => g.series);
const totals = { lessons: all.reduce((a, x) => a + x.ls.length, 0), series: all.length, books: DB.books.length, files: DB.books.reduce((a, b) => a + (b.files || []).length, 0), videoSeconds: all.reduce((a, x) => a + x.seconds, 0), undated: all.reduce((a, x) => a + x.undated, 0) };
if (totals.lessons !== DB.lessons.length || totals.series !== DB.series.length) { console.error("!! totals do not match the site", totals, DB.lessons.length, DB.series.length); process.exit(1); }
const today = fmtDate(new Date().toISOString().slice(0, 10));
const period = x => x.min ? (x.min === x.max ? showKey(x.min) : `${showKey(x.min)} — ${showKey(x.max)}`) : "غير مؤرَّخة";
const kmin = Math.min(...all.map(x => x.min).filter(Boolean)), kmax = Math.max(...all.map(x => x.max));
const yearOf = k => fmtNum(Math.floor(k / 10000));

/* ───────── HTML ───────── */
const F = path.join(SRC, "fonts") + "/";
const css = `
@font-face{font-family:"Naskh";src:url(file://${F}noto-naskh-arabic-arabic-400-normal.woff2);font-weight:400}
@font-face{font-family:"Naskh";src:url(file://${F}noto-naskh-arabic-arabic-700-normal.woff2);font-weight:700}
@font-face{font-family:"Ruqaa";src:url(file://${F}aref-ruqaa-arabic-700-normal.woff2);font-weight:700}
@page{size:A4;margin:18mm 15mm 18mm 15mm}
:root{--ink:#1e1710;--ink2:#5b4630;--rubric:#7a2417;--gold:#a8791c;--rule:#d8c9a1;--paper:#f8f0dc}
*{box-sizing:border-box}
body{font-family:"Naskh",serif;font-size:11pt;line-height:1.8;color:var(--ink);margin:0}
h1{font-family:"Ruqaa","Naskh",serif;font-size:25pt;line-height:1.6;color:var(--rubric);margin:0;text-align:center;text-wrap:balance}
h2{font-family:"Ruqaa","Naskh",serif;font-size:19pt;color:var(--rubric);margin:0 0 6pt;line-height:1.6;break-after:avoid}
h3{font-family:"Ruqaa","Naskh",serif;font-size:15pt;color:var(--ink);margin:0;line-height:1.6;break-after:avoid}
.page-break{break-before:page}
.sub{text-align:center;color:var(--ink2);font-size:12.5pt;margin:2pt 0}
.rule{border:0;border-top:1.5px solid var(--gold);margin:10pt 0 14pt}
.boxes{display:grid;grid-template-columns:repeat(4,1fr);gap:8pt;margin:10pt 0 16pt}
.box{border:1px solid var(--rule);background:var(--paper);padding:8pt 6pt;text-align:center;border-radius:2px}
.box b{display:block;font-family:"Ruqaa","Naskh",serif;font-size:22pt;color:var(--rubric);line-height:1.5}
.box span{font-size:10.5pt;color:var(--ink2)}
table{width:100%;border-collapse:collapse}
th{background:var(--rubric);color:#fff;font-weight:700;text-align:right;padding:3pt 7pt;font-size:10.5pt}
td{padding:2.5pt 7pt;border-bottom:1px solid var(--rule);vertical-align:top;font-size:10.5pt}
tbody tr:nth-child(even) td{background:#fbf6e8}
thead{display:table-header-group}tr{break-inside:avoid}
td.n{width:9%;color:var(--ink2);white-space:nowrap}td.d{width:21%;white-space:nowrap}td.t{width:12%;white-space:nowrap;color:var(--ink2)}
td.c{text-align:center}th.c{text-align:center}
.note{font-size:10.5pt;color:var(--ink2);margin:8pt 0}
.note li{margin:2pt 0}
.bars{margin-top:4pt}
.bar{display:grid;grid-template-columns:40% 1fr;align-items:center;gap:8pt;margin:0 0 3.2pt;font-size:10pt;break-inside:avoid}
.bar .lab{text-align:right;line-height:1.5}
.bar .trk{display:flex;align-items:center;gap:6pt;height:11pt}
.bar .fill{display:block;height:9pt;background:var(--rubric);border-radius:4px 0 0 4px;flex:none}
.bar .val{color:var(--ink);font-size:10pt;flex:none}
.toc{margin:0;padding:0;list-style:none}
.toc li{display:flex;gap:6pt;align-items:baseline;padding:1.8pt 0;border-bottom:1px dotted var(--rule);font-size:10.5pt}
.toc .tt{flex:1}.toc .pg{color:var(--ink2);min-width:2.5em;text-align:left}
.toc .sec{font-weight:700;color:var(--rubric);border-bottom:1px solid var(--gold);margin-top:7pt;padding-top:5pt;font-size:12pt}
.serhead{margin:16pt 0 5pt;padding:6pt 10pt;background:var(--paper);border-inline-start:4px solid var(--gold);break-after:avoid}
.serhead .meta{font-size:10.5pt;color:var(--ink2)}
.sechead{margin-top:10pt;font-weight:700;color:var(--rubric);font-size:11.5pt;padding:5pt 0 1pt;break-after:avoid}
.secpage{padding-top:20mm;text-align:center}
.mk{font-size:2px;line-height:1;color:#fff;position:absolute}
`;
const doc = (title, body) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${body}</body></html>`;

const summaryHtml = () => {
  const max = Math.max(...all.map(x => x.ls.length));
  const bars = all.slice().sort((a, b) => b.ls.length - a.ls.length).map(x => `<div class="bar"><span class="lab">${esc(x.s.title)}</span><span class="trk"><span class="fill" style="width:${Math.max(1.5, x.ls.length / max * 86).toFixed(1)}%"></span><span class="val">${fmtNum(x.ls.length)}</span></span></div>`).join("");
  return `
<h1>تقرير محتوى الموقع</h1>
<p class="sub">${esc(OFFICIAL_NAME)} حفظه الله</p>
<p class="sub">drwasiullah.com — بتاريخ ${esc(today)}</p>
<hr class="rule">
<div class="boxes">
  <div class="box"><b>${fmtNum(totals.lessons)}</b><span>مادة علمية (دروس ومحاضرات وخطب)</span></div>
  <div class="box"><b>${fmtNum(totals.series)}</b><span>سلسلة علمية</span></div>
  <div class="box"><b>${fmtNum(totals.books)}</b><span>كتابًا (${fmtNum(totals.files)} ملف PDF)</span></div>
  <div class="box"><b>${fmtNum(Math.round(totals.videoSeconds / 3600))}</b><span>ساعة من الدروس المرئية</span></div>
</div>
<h2>المحتوى بحسب الأقسام</h2>
<table><thead><tr><th>القسم</th><th class="c">السلاسل</th><th class="c">المواد</th><th>الفترة (هجري)</th></tr></thead><tbody>
${groups.map(g => `<tr><td>${esc(g.title)}</td><td class="c">${fmtNum(g.series.length)}</td><td class="c">${fmtNum(g.count)}</td><td>${g.min ? `${yearOf(g.min)} — ${yearOf(g.max)} هـ` : "—"}</td></tr>`).join("")}
${totals.books ? `<tr><td>الكتب</td><td class="c">—</td><td class="c">${fmtNum(totals.books)}</td><td>—</td></tr>` : ""}
</tbody></table>
<p class="note">تغطي المواد المؤرَّخة الفترة من ${esc(showKey(kmin))} إلى ${esc(showKey(kmax))}.</p>
<h2 style="margin-top:14pt">كيف تُقرأ التواريخ</h2>
<ul class="note">
  <li>كل التواريخ بالتقويم الهجري (أم القرى).</li>
  <li>الدروس الصوتية والخطب: التاريخ كما ورد في مصدر المادة.</li>
  <li>الدروس المرئية على قناة يوتيوب: التاريخ هو <b>تاريخ نشر المقطع</b>، وقد يتأخر عن يوم الدرس.</li>
  <li>الشرطة (—) تعني أن تاريخ المادة غير متوفر في المصدر؛ عددها ${fmtNum(totals.undated)} مادة.</li>
</ul>

<div class="page-break"></div>
<h2>السلاسل العلمية</h2>
<table style="table-layout:fixed"><colgroup><col style="width:5%"><col style="width:31%"><col style="width:9%"><col style="width:8%"><col style="width:38%"><col style="width:9%"></colgroup><thead><tr><th class="c">م</th><th>السلسلة</th><th>النوع</th><th class="c">المواد</th><th>الفترة (هجري)</th><th class="c">بلا تاريخ</th></tr></thead><tbody>
${groups.map(g => `<tr><td colspan="6" style="background:#efe3bf;font-weight:700;color:var(--rubric)">${esc(g.title)}</td></tr>` + g.series.map((x, i) => `<tr><td class="c">${fmtNum(i + 1)}</td><td>${esc(x.s.title)}</td><td>${x.kind}</td><td class="c">${fmtNum(x.ls.length)}</td><td style="font-size:9pt;white-space:nowrap">${esc(period(x))}</td><td class="c">${x.undated ? fmtNum(x.undated) : "—"}</td></tr>`).join("")).join("")}
</tbody></table>

<div class="page-break"></div>
<h2>عدد المواد في كل سلسلة</h2>
<div class="bars">${bars}</div>`;
};

const dateCell = l => { const t = ldate(l); return t ? esc(t) : "—"; };
const rows = (x, ls, video) => ls.map((l, i) => `<tr><td class="n">${fmtNum(l.n ?? "") || fmtNum(i + 1)}</td><td>${esc(dg(l.title))}</td><td class="d">${dateCell(l)}</td>${video ? `<td class="t">${l.duration ? esc(dg(dur(l.duration))) : "—"}</td>` : ""}</tr>`).join("");

const seriesHtml = (x, idx) => {
  const video = x.ls.every(l => l.kind === "video");
  const head = `<tr><th>الرقم</th><th>العنوان</th><th>التاريخ</th>${video ? "<th>المدة</th>" : ""}</tr>`;
  const bySec = new Map();
  x.ls.forEach(l => { const k = l.section || ""; if (!bySec.has(k)) bySec.set(k, []); bySec.get(k).push(l); });
  const secs = [...bySec.entries()];
  const useSec = secs.some(([k]) => k);
  if (useSec) secs.sort((a, b) => { const ka = Math.min(...a[1].map(key).filter(Boolean), 9e9), kb = Math.min(...b[1].map(key).filter(Boolean), 9e9); return ka - kb; });
  const body = useSec
    ? secs.map(([k, ls]) => `<div class="sechead">${esc(k || "مواد أخرى")} <span style="font-weight:400;color:var(--ink2)">(${fmtNum(ls.length)})</span></div><table><thead>${head}</thead><tbody>${rows(x, ls, video)}</tbody></table>`).join("")
    : `<table><thead>${head}</thead><tbody>${rows(x, x.ls, video)}</tbody></table>`;
  return `<div style="height:0"><span class="mk">SERIES${idx}</span></div><div class="serhead" id="s${idx}"><h3>${esc(x.s.title)}</h3><div class="meta">${x.kind} · ${fmtNum(x.ls.length)} ${x.ls.length > 10 ? "مادة" : "مواد"}${x.allVideo && x.seconds ? ` · ${hours(x.seconds)}` : ""} · ${esc(period(x))}${x.undated ? ` · بلا تاريخ: ${fmtNum(x.undated)}` : ""}</div></div>${body}`;
};

const booksHtml = idx => `<div style="height:0"><span class="mk">SERIES${idx}</span></div><div class="serhead" id="s${idx}"><h3>الكتب</h3><div class="meta">${fmtNum(DB.books.length)} كتابًا · ${fmtNum(totals.files)} ملف PDF</div></div>
<table><thead><tr><th>م</th><th>العنوان</th><th>المجموعة</th><th class="c">الملفات</th></tr></thead><tbody>
${DB.books.map((b, i) => `<tr><td class="n">${fmtNum(i + 1)}</td><td>${esc(b.title)}</td><td style="white-space:nowrap">${esc(b.group || "")}</td><td class="c">${fmtNum((b.files || []).length)}</td></tr>`).join("")}</tbody></table>`;

const notesHtml = () => {
  const und = all.filter(x => x.undated).map(x => `<li>${esc(x.s.title)}: ${fmtNum(x.undated)} من ${fmtNum(x.ls.length)} مادة بلا تاريخ.</li>`).join("");
  const unn = all.filter(x => x.unnumbered).map(x => `<li>${esc(x.s.title)}: ${fmtNum(x.unnumbered)} مادة بلا رقم درس.</li>`).join("");
  return `<h2>ملاحظات على البيانات</h2>
<p class="note">ما يلي ليس خطأً في الموقع بل نقص في معلومات المصدر، ويمكن استكماله إذا توفرت البيانات:</p>
<h3>مواد بلا تاريخ</h3><ul class="note">${und || "<li>لا يوجد.</li>"}</ul>
<h3 style="margin-top:10pt">مواد بلا رقم درس</h3><ul class="note">${unn || "<li>لا يوجد.</li>"}</ul>
<h3 style="margin-top:10pt">تنبيه</h3><ul class="note"><li>تاريخ الدروس المرئية على قناة يوتيوب هو تاريخ نشر المقطع، وليس بالضرورة تاريخ الدرس.</li></ul>`;
};

const fullHtml = pages => {
  let idx = 0, toc = "";
  const bodyParts = [];
  groups.forEach(g => {
    toc += `<li class="sec"><span class="tt">${esc(g.title)}</span></li>`;
    bodyParts.push(`<div class="page-break secpage"><h2 style="font-size:26pt">${esc(g.title)}</h2><p class="sub">${fmtNum(g.series.length)} ${g.series.length > 2 ? "سلاسل" : "سلسلتان"} · ${fmtNum(g.count)} مادة</p></div>`);
    g.series.forEach(x => {
      idx++; toc += `<li><span class="tt">${esc(x.s.title)}</span><span class="pg">${pages ? fmtNum(pages[idx]) : ""}</span></li>`;
      bodyParts.push(seriesHtml(x, idx).replace('class="serhead"', idx === 1 ? 'class="serhead"' : 'class="serhead"'));
    });
  });
  if (DB.books.length) { idx++; toc += `<li class="sec"><span class="tt">الكتب</span></li><li><span class="tt">الكتب (${fmtNum(DB.books.length)})</span><span class="pg">${pages ? fmtNum(pages[idx]) : ""}</span></li>`; bodyParts.push(`<div class="page-break"></div>${booksHtml(idx)}`); }
  toc += `<li class="sec"><span class="tt">ملاحظات على البيانات</span><span class="pg">${pages ? fmtNum(pages.notes) : ""}</span></li>`;
  bodyParts.push(`<div class="page-break"></div><span class="mk">SERIESNOTES</span>${notesHtml()}`);
  return doc("تقرير محتوى الموقع", `${summaryHtml()}<div class="page-break"></div><h2>الفهرس</h2><ul class="toc">${toc}</ul>${bodyParts.join("")}`);
};

/* ───────── PDF (Chromium) ───────── */
const { chromium } = await import("playwright");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium" });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "report-"));
const toPdf = async (html, file) => {
  const h = path.join(tmp, path.basename(file) + ".html"); fs.writeFileSync(h, html);
  const p = await browser.newPage(); await p.goto("file://" + h); await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: file, format: "A4", printBackground: true, displayHeaderFooter: true, headerTemplate: "<span></span>",
    footerTemplate: '<div style="width:100%;text-align:center;font-size:9px;color:#777"><span class="pageNumber"></span> / <span class="totalPages"></span></div>', margin: { top: "18mm", bottom: "18mm", left: "15mm", right: "15mm" } });
  await p.close();
};
const pdfPages = f => +execFileSync("pdfinfo", [f]).toString().match(/Pages:\s+(\d+)/)[1];
const markerPages = f => { // page of every SERIESn marker (the marker is invisible ASCII text in the heading)
  const n = pdfPages(f), found = {};
  for (let p = 1; p <= n; p++) {
    const t = execFileSync("pdftotext", ["-f", String(p), "-l", String(p), f, "-"]).toString();
    for (const m of t.matchAll(/SERIES(\d+|NOTES)/g)) if (!(m[1] in found)) found[m[1]] = p;
  }
  return found;
};

fs.mkdirSync(OUT, { recursive: true });
const full = path.join(OUT, "site-content-report.pdf"), summary = path.join(OUT, "site-content-summary.pdf");
await toPdf(fullHtml(null), full);                       // pass 1: find the pages
const f1 = markerPages(full), pages = { notes: f1.NOTES };
for (const k of Object.keys(f1)) if (k !== "NOTES") pages[+k] = f1[k];
const n1 = pdfPages(full);
await toPdf(fullHtml(pages), full);                      // pass 2: with the page numbers in the table of contents (same length)
if (pdfPages(full) !== n1) { console.error("!! page count changed between passes"); process.exit(1); }
await toPdf(doc("ملخص محتوى الموقع", summaryHtml()), summary);
await browser.close();
console.log(`${totals.lessons} lessons, ${totals.series} series, ${totals.books} books -> ${full} (${pdfPages(full)} pages), ${summary} (${pdfPages(summary)} pages)`);
