/* Phase 7: the analytics dashboard (admin only). Reads the anonymous daily counters (`stats_daily`, written by the public Worker).
   Server-rendered like every portal page: filters are a GET form, the chart is inline SVG with a table behind it, no scripts. */
import { esc, layout, hijri, num } from "./html.mjs";
import { makkahToday } from "./timeutil.mjs";

const all = (db, sql, ...a) => db.prepare(sql).bind(...a).all().then(r => r.results);
const RANGES = { "7": 7, "30": 30, "90": 90, "365": 365, all: 0 };
const RANGE_AR = { "7": "٧ أيام", "30": "٣٠ يومًا", "90": "٩٠ يومًا", "365": "سنة", all: "كل المدة" };
const EVENTS = [["play", "استماع"], ["download", "تحميل"], ["watch", "مشاهدة"]];
const EV_AR = { play: "استماع", download: "تحميل", watch: "مشاهدة", all: "الكل" };
const DAY = 864e5, iso = ms => new Date(ms).toISOString().slice(0, 10), ms = d => Date.parse(d + "T00:00:00Z");
const arDigits = s => String(s).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]);

/* the filters, whitelisted */
export async function parseParams(db, q) {
  const range = Object.hasOwn(RANGES, q.get("range")) ? q.get("range") : "30";
  const event = ["play", "download", "watch", "all"].includes(q.get("event")) ? q.get("event") : "play";
  let series = String(q.get("series") ?? "").slice(0, 120);
  if (series && !await db.prepare("SELECT 1 FROM series WHERE id = ?").bind(series).first()) series = "";
  return { range, event, series };
}
const qs = (p, o = {}) => { const m = { ...p, ...o }; return "?" + Object.entries(m).filter(([k, v]) => v && !(k === "range" && v === "30") && !(k === "event" && v === "play")).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&"); };

/* the period: [start, end] in Makkah days; "all" starts at the first recorded day */
async function period(db, p) {
  const end = makkahToday();
  if (p.range === "all") {
    const f = await db.prepare(`SELECT MIN(s.day) d FROM stats_daily s ${p.series ? "JOIN lessons l ON l.id = s.lesson_id WHERE l.series_id = ?" : ""}`).bind(...(p.series ? [p.series] : [])).first();
    return { start: f && f.d ? f.d : end, end, days: null };
  }
  const days = RANGES[p.range];
  return { start: iso(ms(end) - (days - 1) * DAY), end, days };
}
const where = (p, a, b) => ({ sql: `s.day >= ? AND s.day <= ?${p.series ? " AND l.series_id = ?" : ""}`, args: [a, b, ...(p.series ? [p.series] : [])] });
const FROM = "FROM stats_daily s JOIN lessons l ON l.id = s.lesson_id LEFT JOIN series ser ON ser.id = l.series_id";

function bucketOf(per) {                                                   // day up to 90 days, then weeks, then months
  const span = (ms(per.end) - ms(per.start)) / DAY + 1;
  if (span <= 91) return { kind: "day", sql: "s.day", next: d => iso(ms(d) + DAY), first: d => d };
  if (span <= 400) return { kind: "week", sql: "date(s.day,'weekday 0','-6 days')", next: d => iso(ms(d) + 7 * DAY), first: d => iso(ms(d) - ((new Date(ms(d)).getUTCDay() + 6) % 7) * DAY) };
  return { kind: "month", sql: "substr(s.day,1,7) || '-01'", next: d => { const x = new Date(ms(d)); return iso(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 1)); }, first: d => d.slice(0, 7) + "-01" };
}
const KIND_AR = { day: "يوميًا", week: "أسبوعيًا", month: "شهريًا" };

const niceMax = v => { if (v <= 4) return 4; const p = 10 ** Math.floor(Math.log10(v)), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
const pct = (cur, prev) => prev === 0 ? (cur === 0 ? "—" : "جديد") : (cur >= prev ? "+" : "−") + arDigits(Math.round(Math.abs(cur - prev) / prev * 100)) + "٪";

function chart(buckets, kindAr) {
  const W = 720, H = 240, L = 8, R = 52, T = 14, B = 26, iw = W - L - R, ih = H - T - B;
  const max = niceMax(Math.max(1, ...buckets.map(b => b.play + b.download + b.watch)));
  const slot = iw / buckets.length, bw = Math.max(2, Math.min(28, slot - 2));
  const y = v => T + ih - v / max * ih;
  const grid = [0, 1, 2, 3, 4].map(i => { const v = max / 4 * i, yy = y(v); return `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" class="gl"/><text x="${W - R + 6}" y="${yy + 4}" class="ax">${esc(arDigits(Math.round(v)))}</text>`; }).join("");
  const bars = buckets.map((b, i) => {                                      // oldest on the right, as the page reads
    const x = W - R - (i + 1) * slot + (slot - bw) / 2; let acc = 0;
    const segs = EVENTS.map(([k, name]) => { const v = b[k]; if (!v) return ""; const y1 = y(acc + v), h = y(acc) - y1; acc += v; return `<rect x="${x.toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" rx="2" class="seg s-${k}"/>`; }).join("");
    const tip = `${b.label} — ${EVENTS.map(([k, n]) => `${n} ${arDigits(b[k])}`).join(" · ")}`;
    return `<g><title>${esc(tip)}</title><rect x="${(W - R - (i + 1) * slot).toFixed(1)}" y="${T}" width="${slot.toFixed(1)}" height="${ih}" class="hit"/>${segs}</g>`;
  }).join("");
  const first = buckets[0], last = buckets[buckets.length - 1];
  const axis = `<text x="${W - R}" y="${H - 6}" text-anchor="start" class="ax">${esc(first.label)}</text>${buckets.length > 1 ? `<text x="${L}" y="${H - 6}" text-anchor="end" class="ax">${esc(last.label)}</text>` : ""}`;
  const total = buckets.reduce((a, b) => a + b.play + b.download + b.watch, 0);
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(`مخطط أعمدة ${kindAr}: ${arDigits(total)} حدثًا في ${arDigits(buckets.length)} فترة. التفاصيل في الجدول أدناه.`)}">${grid}${bars}${axis}</svg>`;
}

export async function analyticsPage(db, user, query) {
  const p = await parseParams(db, query), per = await period(db, p), bk = bucketOf(per);
  const cur = where(p, per.start, per.end);
  const prevStart = per.days ? iso(ms(per.start) - per.days * DAY) : null, prevEnd = per.days ? iso(ms(per.start) - DAY) : null;
  const [curTot, prevTot, raw, top, bySeries, seriesList] = await Promise.all([
    all(db, `SELECT s.event e, SUM(s.n) n ${FROM} WHERE ${cur.sql} GROUP BY s.event`, ...cur.args),
    prevStart ? (w => all(db, `SELECT s.event e, SUM(s.n) n ${FROM} WHERE ${w.sql} GROUP BY s.event`, ...w.args))(where(p, prevStart, prevEnd)) : Promise.resolve([]),
    all(db, `SELECT ${bk.sql} b, s.event e, SUM(s.n) n ${FROM} WHERE ${cur.sql} GROUP BY b, s.event`, ...cur.args),
    all(db, `SELECT s.lesson_id id, json_extract(l.data,'$.title') title, ser.title series, l.series_id sid,
        SUM(CASE WHEN s.event='play' THEN s.n END) p, SUM(CASE WHEN s.event='download' THEN s.n END) d, SUM(CASE WHEN s.event='watch' THEN s.n END) w, SUM(s.n) t
      ${FROM} WHERE ${cur.sql}${p.event === "all" ? "" : ` AND s.event = '${p.event}'`} GROUP BY s.lesson_id ORDER BY ${p.event === "all" ? "t" : { play: "p", download: "d", watch: "w" }[p.event]} DESC, s.lesson_id LIMIT 25`, ...cur.args),
    p.series ? Promise.resolve([]) : all(db, `SELECT ser.id, ser.title, SUM(CASE WHEN s.event='play' THEN s.n END) p, SUM(CASE WHEN s.event='download' THEN s.n END) d, SUM(CASE WHEN s.event='watch' THEN s.n END) w, SUM(s.n) t
      ${FROM} WHERE ${cur.sql} AND ser.id IS NOT NULL GROUP BY ser.id ORDER BY t DESC LIMIT 25`, ...cur.args),
    all(db, "SELECT id, title FROM series WHERE status = 'published' ORDER BY sec, origin, pos"),
  ]);
  const tot = Object.fromEntries(EVENTS.map(([k]) => [k, 0])), prev = { ...tot };
  curTot.forEach(r => tot[r.e] = r.n); prevTot.forEach(r => prev[r.e] = r.n);

  /* zero-filled buckets from the start to today */
  const byB = new Map(); raw.forEach(r => { const o = byB.get(r.b) || { play: 0, download: 0, watch: 0 }; o[r.e] = r.n; byB.set(r.b, o); });
  const buckets = []; for (let d = bk.first(per.start), n = 0; d <= per.end && n < 400; d = bk.next(d), n++) buckets.push({ day: d, label: bk.kind === "month" ? hijri(null, d) : hijri(null, d), ...(byB.get(d) || { play: 0, download: 0, watch: 0 }) });
  const any = tot.play + tot.download + tot.watch > 0;

  const sel = (name, cur, opts) => `<label>${name} <select name="${name === "الفترة" ? "range" : name === "السلسلة" ? "series" : "event"}">${opts.map(([v, t]) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
  const filters = `<form method="get" action="/analytics" class="inline" aria-label="تصفية الإحصاءات">${sel("الفترة", p.range, Object.entries(RANGE_AR))}
${sel("السلسلة", p.series, [["", "كل السلاسل"], ...seriesList.map(s => [s.id, s.title])])}${sel("ترتيب الدروس بحسب", p.event, Object.entries(EV_AR))} <button>تطبيق</button> <a href="/analytics.csv${qs({ range: p.range, series: p.series })}">تنزيل CSV</a></form>`;
  const cards = EVENTS.map(([k, name]) => `<div class="card"><b>${num(tot[k])}</b><span>${name}${per.days ? ` · ${pct(tot[k], prev[k])} عن الفترة السابقة` : ""}</span></div>`).join("");
  const legend = `<ul class="legend" aria-label="دليل الألوان">${EVENTS.map(([k, name]) => `<li><span class="sw s-${k}" aria-hidden="true"></span>${name}</li>`).join("")}</ul>`;
  const T = (label, head, rows) => `<div class="scroll" tabindex="0" role="region" aria-label="${esc(label)}"><table><thead><tr>${head.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows || `<tr><td colspan="${head.length}" class="muted">لا بيانات في هذه الفترة.</td></tr>`}</tbody></table></div>`;
  const share = t => tot.play + tot.download + tot.watch ? arDigits(Math.round(t / (tot.play + tot.download + tot.watch) * 100)) + "٪" : "—";
  const body = `<p class="muted">أعداد مجهولة الهوية: لا تُحفظ أي بيانات عن الزائر (يُرسل رقم الدرس ونوع الحدث فقط). «استماع» = ٣٠ ثانية استماع فعلية في الصفحة الواحدة، «مشاهدة» = ضغط زر تشغيل الفيديو. الأيام بتوقيت مكة المكرمة.</p>
${filters}
<div class="cards">${cards}</div>
<h2>النشاط ${KIND_AR[bk.kind]} — ${esc(RANGE_AR[p.range])}</h2>
${any ? `${legend}<div class="chartbox" tabindex="0" role="region" aria-label="مخطط النشاط">${chart(buckets, KIND_AR[bk.kind])}</div>
<details><summary>عرض الجدول</summary>${T("النشاط بحسب الفترة", ["الفترة", "استماع", "تحميل", "مشاهدة"], buckets.slice().reverse().map(b => `<tr><td>${esc(b.label)}</td><td>${num(b.play)}</td><td>${num(b.download)}</td><td>${num(b.watch)}</td></tr>`).join(""))}</details>` : '<p class="muted">لا بيانات في هذه الفترة بعد.</p>'}
<h2>أكثر الدروس (${esc(EV_AR[p.event])})</h2>${T("أكثر الدروس", ["الدرس", "السلسلة", "استماع", "تحميل", "مشاهدة"], top.map(r => `<tr><td><a href="/lessons/${encodeURIComponent(r.id)}">${esc(r.title ?? r.id)}</a></td><td><a href="/series/${encodeURIComponent(r.sid)}">${esc(r.series || "")}</a></td><td>${num(r.p)}</td><td>${num(r.d)}</td><td>${num(r.w)}</td></tr>`).join(""))}
${p.series ? "" : `<h2>حسب السلسلة</h2>${T("حسب السلسلة", ["السلسلة", "استماع", "تحميل", "مشاهدة", "الحصة"], bySeries.map(r => `<tr><td><a href="/analytics${qs(p, { series: r.id })}">${esc(r.title)}</a></td><td>${num(r.p)}</td><td>${num(r.d)}</td><td>${num(r.w)}</td><td>${share(r.t)}</td></tr>`).join(""))}`}`;
  return layout({ title: "الإحصاءات", user, path: "/analytics", body });
}

/* CSV of per-lesson totals for the chosen period (Excel-friendly: UTF-8 with BOM; cells that could run as formulas are neutralised) */
export const cell = v => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export async function analyticsCsv(db, query) {
  const p = await parseParams(db, query), per = await period(db, p), w = where(p, per.start, per.end);
  const rows = await all(db, `SELECT s.lesson_id id, json_extract(l.data,'$.title') title, l.series_id sid, ser.title series,
      SUM(CASE WHEN s.event='play' THEN s.n ELSE 0 END) p, SUM(CASE WHEN s.event='download' THEN s.n ELSE 0 END) d, SUM(CASE WHEN s.event='watch' THEN s.n ELSE 0 END) w
    ${FROM} WHERE ${w.sql} GROUP BY s.lesson_id ORDER BY SUM(s.n) DESC, s.lesson_id`, ...w.args);
  const lines = [["lesson_id", "title", "series_id", "series", "plays", "downloads", "watches", "from", "to"], ...rows.map(r => [r.id, r.title, r.sid, r.series, r.p, r.d, r.w, per.start, per.end])];
  return new Response("﻿" + lines.map(l => l.map(cell).join(",")).join("\r\n") + "\r\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="analytics-${per.start}_${per.end}.csv"` } });
}
