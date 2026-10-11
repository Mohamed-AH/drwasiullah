/* Phase 8: reports from the database (admin only): a printable content summary, a printable lesson list per series, a data-quality checklist,
   and CSV exports. Same rules as scripts/make_report.mjs (published lessons of published series; Hijri dates only), computed from D1 so they
   reflect the portal's latest edits, published or not. Server-rendered; the only script is the print button (admin.js). */
import { esc, layout, hijri, num, statusTag } from "./html.mjs";
import { SERIES_EFF, SERIES_FROM } from "./pages.mjs";
import { cell } from "./analytics.mjs";

const all = (db, sql, ...a) => db.prepare(sql).bind(...a).all().then(r => r.results);
const SEC_AR = { duroos: "الدروس المرئية", audio: "الدروس الصوتية", lectures: "المحاضرات", khutab: "الخطب", urdu: "الدروس بالأردية" };
const SEC_ORDER = ["duroos", "audio", "lectures", "khutab", "urdu"];
const HM = ["محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"];
const AR = s => String(s).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]);
const G2H = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC" });
const keyOfHd = hd => { const m = /^(\d{3,4})-(\d{1,2})-(\d{1,2})$/.exec(hd || ""); return m ? +m[1] * 10000 + +m[2] * 100 + +m[3] : 0; };
const keyOfDate = d => { if (!/^\d{4}-\d{2}-\d{2}$/.test(d || "")) return 0; const p = Object.fromEntries(G2H.formatToParts(new Date(d + "T12:00:00Z")).map(x => [x.type, x.value])); return +p.year * 10000 + +p.month * 100 + +p.day; };
const showKey = k => { const y = Math.floor(k / 10000), m = Math.floor(k / 100) % 100, d = k % 100; return [d ? AR(d) : "", m ? HM[m - 1] : "", AR(y), "هـ"].filter(Boolean).join(" "); };
const kindAr = k => k === "video" ? "مرئي" : k === "audio" ? "صوتي" : "صوتي ومرئي";

/* everything the summary and the quality report need, in two light queries */
async function load(db) {
  const [series, ls, books] = await Promise.all([
    all(db, `SELECT ${SERIES_EFF} FROM ${SERIES_FROM}`),
    all(db, `SELECT e.id, e.series_id sid, e.n, e.kind, e.hd, e.date, e.status, e.title, json_extract(l.data,'$.duration') dur FROM lessons_eff e JOIN lessons l ON l.id = e.id`),
    all(db, `SELECT id, title, status, json_extract(data,'$.group') grp, COALESCE(json_array_length(data,'$.files'),0) files FROM books ORDER BY origin, pos`),
  ]);
  const by = new Map(); for (const s of series) by.set(s.id, { s, ls: [] });
  for (const l of ls) { const x = by.get(l.sid); if (x) x.ls.push(l); }
  return { by, ls, books, series };
}
function statsOf(x) {                                      // published lessons only
  const pub = x.ls.filter(l => l.status === "published"), hdKeys = pub.map(l => keyOfHd(l.hd)).filter(Boolean), dates = pub.filter(l => !keyOfHd(l.hd) && l.date).map(l => l.date).sort();
  const keys = [...hdKeys, ...(dates.length ? [keyOfDate(dates[0]), keyOfDate(dates[dates.length - 1])] : [])].filter(Boolean);
  const numbered = pub.filter(l => l.n != null).length;
  return { pub, count: pub.length, secs: pub.reduce((a, l) => a + (l.dur || 0), 0), min: keys.length ? Math.min(...keys) : 0, max: keys.length ? Math.max(...keys) : 0,
    undated: pub.filter(l => !keyOfHd(l.hd) && !l.date).length, unnumbered: numbered * 2 >= pub.length && numbered < pub.length ? pub.length - numbered : 0,
    kind: pub.every(l => l.kind === "video") ? "video" : pub.every(l => l.kind === "audio") ? "audio" : "mixed", video: pub.filter(l => l.kind === "video").reduce((a, l) => a + (l.dur || 0), 0) };
}
const period = x => x.min ? (x.min === x.max ? showKey(x.min) : `${showKey(x.min)} — ${showKey(x.max)}`) : "غير مؤرَّخة";
const T = (label, head, rows, cls = "") => `<div class="scroll ${cls}" tabindex="0" role="region" aria-label="${esc(label)}"><table><thead><tr>${head.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
const printBar = (csv = "") => `<p class="noprint"><button type="button" data-print>طباعة / حفظ PDF</button>${csv ? ` <a href="${csv}">تنزيل CSV</a>` : ""} <a href="/reports">كل التقارير</a></p>`;
const stampLine = () => `<p class="muted">أُعدّ في ${esc(hijri(null, new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 10)))} من قاعدة بيانات لوحة التحرير (يشمل ما لم يُنشر بعد في الموقع).</p>`;

export async function reportsIndex(db, user) {
  const series = await all(db, `SELECT ${SERIES_EFF} FROM ${SERIES_FROM} ORDER BY s.sec, s.origin, s.pos`);
  const body = `<ul class="rlist">
<li><a href="/reports/summary"><b>ملخص المحتوى</b></a> — الأعداد الكلية والأقسام والسلاسل (للطباعة). <a href="/reports/series.csv">CSV</a></li>
<li><a href="/reports/quality"><b>جودة البيانات</b></a> — دروس بلا تاريخ أو رقم أو مدة، أرقام مكررة، سلاسل فارغة، مواد غير منشورة.</li>
<li><a href="/reports/lessons.csv"><b>كل الدروس (CSV)</b></a> — جدول كامل للدروس بحالتها الفعلية. <a href="/reports/books.csv">الكتب (CSV)</a></li>
<li><a href="/analytics">الإحصاءات</a> — الاستماع والتحميل (فيها تنزيل CSV).</li></ul>
<form method="get" action="/reports/series" class="inline"><label>قائمة دروس سلسلة (للطباعة) <select name="id">${series.map(s => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join("")}</select></label> <label><input type="checkbox" name="all" value="1"> مع غير المنشور</label> <button>عرض</button></form>
<form method="get" action="/reports/quality" class="inline"><label>جودة بيانات سلسلة واحدة <select name="series">${series.map(s => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join("")}</select></label> <button>عرض</button></form>`;
  return layout({ title: "التقارير", user, path: "/reports", body });
}

export async function summaryReport(db, user) {
  const { by, books } = await load(db), pubSeries = [...by.values()].map(x => ({ ...x, st: statsOf(x) })).filter(x => x.s.status === "published" && x.st.count > 0);
  const secOf = x => x.s.sec || "duroos", groups = [...SEC_ORDER, ...new Set(pubSeries.map(secOf).filter(s => !SEC_ORDER.includes(s)))].map(id => ({ id, series: pubSeries.filter(x => secOf(x) === id).sort((a, b) => b.st.count - a.st.count) })).filter(g => g.series.length);
  const pubBooks = books.filter(b => b.status === "published"), tot = { lessons: pubSeries.reduce((a, x) => a + x.st.count, 0), series: pubSeries.length, books: pubBooks.length, files: pubBooks.reduce((a, b) => a + b.files, 0), video: pubSeries.reduce((a, x) => a + x.st.video, 0) };
  const mm = list => { const k = list.filter(Boolean); return k.length ? k : [0]; };
  const secRows = groups.map(g => { const mn = Math.min(...mm(g.series.map(x => x.st.min))), mx = Math.max(...g.series.map(x => x.st.max)); return `<tr><td>${esc(SEC_AR[g.id] || g.id)}</td><td>${num(g.series.length)}</td><td>${num(g.series.reduce((a, x) => a + x.st.count, 0))}</td><td>${mn ? `${AR(Math.floor(mn / 10000))} — ${AR(Math.floor(mx / 10000))} هـ` : "—"}</td></tr>`; }).join("") + (tot.books ? `<tr><td>الكتب</td><td>—</td><td>${num(tot.books)}</td><td>—</td></tr>` : "");
  const serRows = groups.map(g => `<tr class="grp"><td colspan="7">${esc(SEC_AR[g.id] || g.id)}</td></tr>` + g.series.map((x, i) => `<tr><td>${num(i + 1)}</td><td>${esc(x.s.title)}</td><td>${kindAr(x.st.kind)}</td><td>${num(x.st.count)}</td><td>${x.st.video ? num(Math.round(x.st.video / 3600)) : "—"}</td><td>${esc(period(x.st))}</td><td>${[x.st.undated ? `${num(x.st.undated)} بلا تاريخ` : "", x.st.unnumbered ? `${num(x.st.unnumbered)} بلا رقم` : ""].filter(Boolean).join("، ") || "—"}</td></tr>`).join("")).join("");
  const body = `${printBar("/reports/series.csv")}${stampLine()}
<div class="cards"><div class="card"><b>${num(tot.lessons)}</b><span>مادة علمية منشورة</span></div><div class="card"><b>${num(tot.series)}</b><span>سلسلة</span></div><div class="card"><b>${num(tot.books)}</b><span>كتاب (${num(tot.files)} ملف)</span></div><div class="card"><b>${num(Math.round(tot.video / 3600))}</b><span>ساعة مرئية</span></div></div>
<h2>المحتوى بحسب الأقسام</h2>${T("الأقسام", ["القسم", "السلاسل", "المواد", "الفترة (هجري)"], secRows)}
<h2>السلاسل العلمية</h2>${T("السلاسل", ["#", "السلسلة", "النوع", "المواد", "ساعات الفيديو", "الفترة (هجري)", "ملاحظات"], serRows)}
<h2>كيف تُقرأ التواريخ</h2><ul class="note"><li>كل التواريخ بالتقويم الهجري (أم القرى).</li><li>الدروس الصوتية والخطب: التاريخ كما ورد في مصدر المادة.</li><li>الدروس المرئية على يوتيوب: التاريخ هو <b>تاريخ نشر المقطع</b> وقد يتأخر عن يوم الدرس.</li></ul>`;
  return layout({ title: "ملخص المحتوى", user, path: "/reports", body, scripts: true });
}

export async function seriesReport(db, user, id, withAll) {
  const s = (await all(db, `SELECT ${SERIES_EFF} FROM ${SERIES_FROM} WHERE s.id = ?`, id))[0];
  if (!s) return null;
  const [rows, ord] = await Promise.all([
    all(db, `SELECT e.id, e.n, e.section, e.kind, e.status, e.title, e.hd, e.date, json_extract(l.data,'$.duration') dur FROM lessons_eff e JOIN lessons l ON l.id = e.id WHERE e.series_id = ? ${withAll ? "" : "AND e.status = 'published'"} ORDER BY (e.n IS NULL), e.n, e.pos`, id),
    db.prepare("SELECT ids FROM series_order WHERE series_id = ?").bind(id).first(),
  ]);
  if (ord) { const at = new Map(JSON.parse(ord.ids).map((x, i) => [x, i])); rows.sort((a, b) => (at.has(a.id) ? at.get(a.id) : 1e9) - (at.has(b.id) ? at.get(b.id) : 1e9)); }   // the saved display order first (stable for the rest)
  const hrs = rows.reduce((a, l) => a + (l.dur || 0), 0), dur = d => d ? AR(`${Math.floor(d / 3600) ? Math.floor(d / 3600) + ":" : ""}${String(Math.floor(d / 60) % 60).padStart(Math.floor(d / 3600) ? 2 : 1, "0")}:${String(Math.round(d % 60)).padStart(2, "0")}`) : "";
  const hasDur = rows.some(l => l.dur), hasSec = rows.some(l => l.section);
  const body = `${printBar(`/reports/lessons.csv?series=${encodeURIComponent(id)}`)}${stampLine()}
<p class="muted">${esc(SEC_AR[s.sec || "duroos"] || s.sec || "")} · ${num(rows.length)} درسًا${hrs ? ` · ${num(Math.round(hrs / 3600))} ساعة` : ""}${withAll ? " · يشمل غير المنشور" : ""}${ord ? " · بالترتيب المحفوظ في اللوحة" : ""}</p>
${T("دروس السلسلة", ["الرقم", "العنوان", ...(hasSec ? ["الباب"] : []), "التاريخ (هجري)", ...(hasDur ? ["المدة"] : []), ...(withAll ? ["الحالة"] : [])], rows.map(l => `<tr><td>${l.n == null ? "—" : num(l.n)}</td><td>${esc(l.title)}</td>${hasSec ? `<td>${esc(l.section || "")}</td>` : ""}<td>${esc(hijri(l.hd, l.date))}</td>${hasDur ? `<td>${dur(l.dur)}</td>` : ""}${withAll ? `<td>${statusTag(l.status)}</td>` : ""}</tr>`).join("") || `<tr><td colspan="4" class="muted">لا دروس.</td></tr>`)}`;
  return layout({ title: s.title, user, path: "/reports", body, scripts: true });
}

const CAP = 500;
export async function qualityReport(db, user, only) {
  const data = await load(db), by = data.by, only_ = only && by.has(only) ? only : "", books = only_ ? [] : data.books, ls = only_ ? data.ls.filter(l => l.sid === only_) : data.ls;
  const pub = ls.filter(l => l.status === "published" && by.get(l.sid) && by.get(l.sid).s.status === "published");
  const title = id => (by.get(id) ? by.get(id).s.title : id);
  const link = l => `<a href="/lessons/${encodeURIComponent(l.id)}">${esc(l.title || l.id)}</a> <span class="muted">(${esc(title(l.sid))})</span>`;
  const list = (items, fmt) => items.length ? `<ul>${items.slice(0, CAP).map(x => `<li>${fmt(x)}</li>`).join("")}</ul>${items.length > CAP ? `<p class="muted">… و${num(items.length - CAP)} غيرها (يحتويها ملف الدروس CSV).</p>` : ""}` : '<p class="ok-line">لا شيء — ممتاز.</p>';
  const sec = (h, hint, items, fmt) => `<h2>${h} <span class="count">${num(items.length)}</span></h2><p class="muted">${hint}</p>${list(items, fmt)}`;
  const undated = pub.filter(l => !keyOfHd(l.hd) && !l.date);
  const numberedSeries = new Set([...by.values()].filter(x => { const p = x.ls.filter(l => l.status === "published"); return p.length && p.filter(l => l.n != null).length * 2 >= p.length; }).map(x => x.s.id));
  const unnumbered = pub.filter(l => l.n == null && numberedSeries.has(l.sid));
  const seen = new Map(); pub.forEach(l => { if (l.n != null) { const k = l.sid + "#" + l.n; (seen.get(k) || seen.set(k, []).get(k)).push(l); } });
  const dups = [...seen.values()].filter(x => x.length > 1);
  const audioNoDur = pub.filter(l => l.kind === "audio" && !l.dur);
  const notPub = ls.filter(l => l.status !== "published");
  const emptySeries = only_ ? [] : [...by.values()].filter(x => x.s.status === "published" && !x.ls.some(l => l.status === "published")).map(x => x.s);
  const noFiles = books.filter(b => b.status === "published" && !b.files);
  const sections = [
    sec("أرقام دروس مكررة", "الرقم نفسه لأكثر من درس في السلسلة (إلا أن تكون أجزاء مقصودة).", dups, g => `${esc(title(g[0].sid))} — الرقم ${num(g[0].n)}: ${g.map(link).join("، ")}`),
    sec("دروس بلا رقم في سلسلة مرقّمة", "تظهر في آخر القائمة.", unnumbered, link),
    sec("دروس بلا تاريخ", "لا يظهر لها تاريخ في الموقع.", undated, link),
    sec("دروس صوتية بلا مدة", "تُحسب المدة من الملف عند الرفع؛ الدروس القديمة قد لا تحملها.", audioNoDur, link),
    sec("مواد غير منشورة (مسودة أو مخفية)", "لا تظهر في الموقع.", notPub, l => `${link(l)} ${statusTag(l.status)}`),
    sec("سلاسل منشورة بلا دروس منشورة", "تختفي من الموقع حتى يُنشر فيها درس.", emptySeries, s => `<a href="/series/${encodeURIComponent(s.id)}">${esc(s.title)}</a>`),
    sec("كتب بلا ملفات", "كتاب منشور بلا ملف PDF.", noFiles, b => `<a href="/books/${encodeURIComponent(b.id)}">${esc(b.title)}</a>`),
  ];
  const body = `${printBar("/reports/lessons.csv" + (only_ ? `?series=${encodeURIComponent(only_)}` : ""))}${stampLine()}${only_ ? `<p>سلسلة: <b>${esc(title(only_))}</b> — <a href="/reports/quality">كل السلاسل</a></p>` : ""}<p>الأرقام هنا أمور تحتاج مراجعة بشرية؛ كثير منها نقص في مصدر المادة وليس خطأً في الموقع.</p>${sections.join("")}`;
  return layout({ title: "جودة البيانات", user, path: "/reports", body, scripts: true });
}

/* CSV (UTF-8 with BOM for Excel). Lessons: every status, effective values (editors' patches applied). */
const csv = (name, lines) => new Response("﻿" + lines.map(l => l.map(cell).join(",")).join("\r\n") + "\r\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"` } });
export async function lessonsCsv(db, seriesId) {
  const rows = await all(db, `SELECT e.id, e.series_id sid, ser.title series, e.n, e.section, e.kind, e.status, e.title, e.hd, e.date, e.origin, json_extract(l.data,'$.duration') dur
    FROM lessons_eff e JOIN lessons l ON l.id = e.id LEFT JOIN series ser ON ser.id = e.series_id ${seriesId ? "WHERE e.series_id = ?" : ""} ORDER BY e.series_id, (e.n IS NULL), e.n, e.pos`, ...(seriesId ? [seriesId] : []));
  return csv(`lessons${seriesId ? "-" + seriesId.replace(/[^\w-]/g, "") : ""}.csv`, [["id", "series_id", "series", "n", "section", "kind", "status", "title", "hijri_date", "gregorian_date", "origin", "duration_seconds"], ...rows.map(r => [r.id, r.sid, r.series, r.n, r.section, r.kind, r.status, r.title, r.hd, r.date, r.origin, r.dur])]);
}
export async function seriesCsv(db) {
  const { by } = await load(db);
  return csv("series.csv", [["id", "title", "section", "status", "lessons_published", "lessons_total", "video_hours", "first_hijri", "last_hijri"], ...[...by.values()].map(x => { const st = statsOf(x); return [x.s.id, x.s.title, x.s.sec || "duroos", x.s.status, st.count, x.ls.length, st.video ? Math.round(st.video / 3600) : "", st.min ? showKey(st.min) : "", st.max ? showKey(st.max) : ""]; })]);
}
export async function booksCsv(db) {
  const rows = await all(db, "SELECT id, title, status, json_extract(data,'$.group') grp, COALESCE(json_array_length(data,'$.files'),0) files FROM books ORDER BY origin, pos");
  return csv("books.csv", [["id", "title", "group", "status", "files"], ...rows.map(r => [r.id, r.title, r.grp, r.status, r.files])]);
}
