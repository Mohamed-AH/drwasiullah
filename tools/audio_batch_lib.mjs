/* Pure logic of tools/audio_batch.mjs (no file, network or process access): file-name parsing, routing, planning, conflict checks, CSV, and the SQL that
   registers lessons in D1. Everything here is covered by tests/audio_batch_check.mjs, including a byte-for-byte comparison with the portal's own addLessons().
   Naming convention of the Sheikh's team: <4-digit number><title text> <day>-<month>-<hijri year>هـ [تكملة].<ext>   e.g. «0149صحيح مسلم30-2-1448هـ تكملة.mp3» */
import { hijriToGregorian } from "../admin/src/hijri.mjs";

export const MEDIA_BASE = "https://media.drwasiullah.com";
export const ACTOR = "script:audio_batch";
export const PART_AR = { a: "الجزء الأول", b: "الجزء الثاني", c: "الجزء الثالث", d: "الجزء الرابع" };
export const SHEIKH = "الشيخ وصي الله بن محمد عباس";
const PARTS = ["a", "b", "c", "d"];
const EXTS = ["mp3", "wav", "m4a", "flac", "ogg", "aac"];

/* name -> series. Anything that matches no route goes to the fallback (misc lectures) and is listed in the warnings so it can be checked. */
export const ROUTES = [
  { match: /صحيح\s*مسلم/, series: "sahih-muslim", numbered: true, weekdays: [3, 4, 6] },   // weekdays = Wed, Thu, Sat (the lesson schedule): anything else is only a warning
];
export const FALLBACK = { series: "misc", numbered: false };

const NFC = s => String(s).normalize("NFC");
const tidy = s => NFC(s).replace(/[‎‏‪-‮⁦-⁩]/g, "").replace(/\s+/g, " ").trim();
const NAME_RE = /^(\d{4})\s*(.*?)\s*(\d{1,2})\s*-\s*(\d{1,2})\s*-\s*(\d{4})\s*ه[ـ]*\s*(?:(تكمل[ةه]|تتمة)\s*)?\.([A-Za-z0-9]{2,5})$/;

/* "0149صحيح مسلم30-2-1448هـ تكملة.mp3" -> { seq: 149, text: "صحيح مسلم", y: 1448, m: 2, d: 30, cont: true, ext: "mp3" }  (null when the name does not follow the convention) */
export function parseName(fileName) {
  const m = NAME_RE.exec(NFC(fileName).trim());
  if (!m) return null;
  const ext = m[7].toLowerCase();
  if (!EXTS.includes(ext)) return null;
  return { seq: +m[1], text: tidy(m[2]), d: +m[3], m: +m[4], y: +m[5], cont: !!m[6], ext };
}

export const routeFor = text => ROUTES.find(r => r.match.test(text)) || null;
export const lessonId = (series, seq, part) => `${series}-${String(seq).padStart(4, "0")}${part}`;
const weekday = date => new Date(date + "T12:00:00Z").getUTCDay();

/* files: [{ file, size }] -> { rows, warnings }. One row per FILE. A lesson with two files («…» + «… تكملة») becomes parts a (the base file) and b (the continuation). */
export function planBatch(files) {
  const rows = [], warnings = [], unmatched = [];
  for (const f of files) {
    const p = parseName(f.file);
    if (!p) { unmatched.push(f.file); continue; }
    const hd = `${p.y}-${p.m}-${p.d}`, date = hijriToGregorian(p.y, p.m, p.d);
    if (!date) { warnings.push(`${f.file}: the Hijri date ${hd} does not exist`); continue; }
    const route = routeFor(p.text), cfg = route || FALLBACK;
    if (!route) warnings.push(`${f.file}: not a known course, routed to «${FALLBACK.series}» (unnumbered) — check the series column`);
    rows.push({ file: f.file, size: f.size || 0, ext: p.ext, series: cfg.series, seq: p.seq, numbered: cfg.numbered, cont: p.cont, part: "", id: "", title: cfg.numbered ? `الدرس ${p.seq}` : p.text,
      hd, date, section: "", trim_start: "", trim_end: "", remove: "", status: "published", weekdays: cfg.weekdays || null });
  }
  const groups = new Map();                                   // parts: group by series + number
  for (const r of rows) { const k = `${r.series}|${r.seq}`; (groups.get(k) || groups.set(k, []).get(k)).push(r); }
  for (const g of groups.values()) {
    g.sort((a, b) => a.cont - b.cont || (a.file < b.file ? -1 : 1));
    if (g.length > PARTS.length) { warnings.push(`${g[0].series} ${g[0].seq}: ${g.length} files for one lesson (maximum ${PARTS.length})`); }
    const bases = g.filter(r => !r.cont).length;
    if (g.length === 1 && g[0].cont) warnings.push(`${g[0].file}: a «تكملة» file without its base file — assigned part b, check it`);
    if (bases > 1) warnings.push(`${g[0].series} ${g[0].seq}: two base files with the same number (${g.map(r => r.file).join(" | ")})`);
    if (new Set(g.map(r => r.hd)).size > 1) warnings.push(`${g[0].series} ${g[0].seq}: the files have different dates (${[...new Set(g.map(r => r.hd))].join(", ")})`);
    g.forEach((r, i) => { r.part = g.length === 1 ? (r.cont ? "b" : "") : PARTS[Math.min(i, PARTS.length - 1)]; });
  }
  for (const r of rows) r.id = lessonId(r.series, r.seq, r.part);
  const seen = new Map();
  for (const r of rows) { if (seen.has(r.id)) warnings.push(`duplicate id ${r.id}: ${seen.get(r.id)} | ${r.file}`); seen.set(r.id, r.file); }
  // sanity of numbering and dates inside each numbered course
  const bySeries = new Map();
  for (const r of rows) if (r.numbered) (bySeries.get(r.series) || bySeries.set(r.series, new Map()).get(r.series)).set(r.seq, r);
  for (const [s, m] of bySeries) {
    const ns = [...m.keys()].sort((a, b) => a - b);
    for (let i = 1; i < ns.length; i++) if (ns[i] !== ns[i - 1] + 1) warnings.push(`${s}: numbers jump from ${ns[i - 1]} to ${ns[i]}`);
    for (let i = 1; i < ns.length; i++) if (m.get(ns[i]).date < m.get(ns[i - 1]).date) warnings.push(`${s}: lesson ${ns[i]} (${m.get(ns[i]).hd}) is dated before lesson ${ns[i - 1]} (${m.get(ns[i - 1]).hd})`);
    for (const n of ns) { const r = m.get(n); if (r.weekdays && !r.weekdays.includes(weekday(r.date))) warnings.push(`${s} ${n}: ${r.hd} is a ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][weekday(r.date)]}, not a usual lesson day`); }
  }
  for (const r of rows) delete r.weekdays;
  rows.sort((a, b) => a.series < b.series ? -1 : a.series > b.series ? 1 : a.seq - b.seq || a.part.localeCompare(b.part));
  return { rows, warnings, unmatched };
}

/* existing = [{ id, series_id, hd, src, status }] already in D1 (origin library). Sets row.action: new | exists | replace | conflict (+ row.note).
   An id that exists with a different date is a mis-numbered record (this is how the first test upload 0171 was found); it may be replaced only when listed in `replace`. */
export function checkExisting(rows, existing, replace = []) {
  const rep = new Set(replace), byId = new Map(existing.map(e => [e.id, e])), notes = [], used = new Set();
  for (const r of rows) {
    r.action = "new"; r.note = "";
    if (r.status === "skip") { r.action = "skip"; continue; }
    const exact = byId.get(r.id);
    if (exact) {
      if (exact.hd === r.hd) { r.action = "exists"; r.note = "already registered"; continue; }
      if (rep.has(exact.id)) { r.action = "replace"; r.note = `replaces ${exact.id} (dated ${exact.hd})`; used.add(exact.id); continue; }
      r.action = "conflict"; r.note = `${exact.id} already exists with date ${exact.hd} (this file is ${r.hd}); use --replace ${exact.id} if the old record is the mis-numbered one`; continue;
    }
    const prefix = `${r.series}-${String(r.seq).padStart(4, "0")}`;       // the same lesson under another part letter, or another lesson with the same date
    const others = existing.filter(e => e.series_id === r.series && ((e.id.startsWith(prefix) && /^[a-d]?$/.test(e.id.slice(prefix.length))) || (e.hd && e.hd === r.hd)));
    const open = others.filter(e => !rep.has(e.id));
    others.filter(e => rep.has(e.id)).forEach(e => used.add(e.id));
    if (open.length) { r.action = "conflict"; r.note = `${open.map(e => e.id).join(", ")} already registered for this lesson or date; use --replace ${open[0].id} if it is the same recording numbered differently`; }
    else if (others.length) r.note = `the same date/number as ${others.map(e => e.id).join(", ")}, which is being replaced`;
  }
  for (const id of rep) if (!used.has(id)) notes.push(`--replace ${id}: nothing in this batch conflicts with it, so it will be left alone`);
  return { replaceExisting: existing.filter(e => used.has(e.id)), notes };
}

/* the JSON stored in lessons.data, exactly as admin/src/upload.mjs addLessons builds it (field order included) */
export function lessonData(r, { key, duration }) {
  const data = { id: r.id, title: (r.title || (r.numbered ? `الدرس ${r.seq}` : "")) + (r.part ? ` — ${PART_AR[r.part]}` : ""), series: r.series, kind: "audio", src: `${MEDIA_BASE}/${key}` };
  if (r.numbered) data.n = r.seq;
  if (r.section) data.section = r.section;
  if (r.hd) data.hd = r.hd;
  if (r.date) data.date = r.date;
  if (duration) data.duration = duration;
  return data;
}

const q = v => v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`;
const AUDIT = "INSERT INTO audit_log (actor, action, entity, entity_id, before, after)";

/* Registration SQL, written to be re-runnable: a record is inserted only if its id is free (INSERT OR IGNORE), an old record is deleted only while it still has the
   wrong date, and an audit row is written only once. rows must carry key + duration. -> string */
export function registerSql(rows, replaceExisting = []) {
  const out = [`-- generated by tools/audio_batch.mjs: ${rows.length} lesson(s), ${replaceExisting.length} replaced. Safe to run again.`];
  for (const e of replaceExisting) {
    const cond = `id = ${q(e.id)} AND json_extract(data, '$.hd') = ${q(e.hd)}`;
    out.push(`${AUDIT} SELECT ${q(ACTOR)}, 'lesson.delete', 'lesson', id, data, NULL FROM lessons WHERE ${cond};`);
    out.push(`DELETE FROM lessons WHERE ${cond};`);
  }
  for (const r of rows) {
    if (r.action === "exists" || r.action === "skip") continue;
    const data = lessonData(r, r);
    out.push(`INSERT OR IGNORE INTO lessons (id, origin, pos, series_id, kind, n, section, status, data) VALUES (${q(r.id)}, 'library', (SELECT COALESCE(MAX(pos), -1) + 1 FROM lessons WHERE origin = 'library'), ${q(r.series)}, 'audio', ${r.numbered ? +r.seq : "NULL"}, ${q(r.section || null)}, ${q(r.status === "draft" ? "draft" : "published")}, ${q(JSON.stringify(data))});`);
    const after = JSON.stringify({ series: r.series, ...(r.numbered ? { n: r.seq } : {}), status: r.status === "draft" ? "draft" : "published", title: data.title });
    out.push(`${AUDIT} SELECT ${q(ACTOR)}, 'lesson.add', 'lesson', ${q(r.id)}, NULL, ${q(after)} WHERE EXISTS (SELECT 1 FROM lessons WHERE id = ${q(r.id)}) AND NOT EXISTS (SELECT 1 FROM audit_log WHERE action = 'lesson.add' AND entity_id = ${q(r.id)} AND actor = ${q(ACTOR)});`);
  }
  return out.join("\n") + "\n";
}

/* ───── the review spreadsheet (UTF-8 with BOM so Excel shows Arabic) ───── */
export const CSV_COLUMNS = ["file", "series", "seq", "part", "id", "numbered", "title", "hd", "date", "section", "trim_start", "trim_end", "remove", "status", "action", "note"];
const csvCell = v => { const s = String(v ?? ""); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const toCsv = rows => "﻿" + [CSV_COLUMNS.join(","), ...rows.map(r => CSV_COLUMNS.map(c => csvCell(c === "numbered" ? (r.numbered ? "yes" : "no") : r[c])).join(","))].join("\r\n") + "\r\n";
export function fromCsv(text) {
  const rows = [], t = String(text).replace(/^﻿/, "");
  let cur = [], cell = "", inq = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inq) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else inq = false; } else cell += c; }
    else if (c === '"') inq = true;
    else if (c === ",") { cur.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; cur.push(cell); cell = ""; if (cur.some(x => x !== "")) rows.push(cur); cur = []; }
    else cell += c;
  }
  if (cell !== "" || cur.length) { cur.push(cell); rows.push(cur); }
  const head = rows.shift() || [];
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}
/* "35:10" | "1:02:03" | "95" | "95.5" -> seconds (NaN when it is not a time) */
export function parseTime(x) {
  const t = String(x ?? "").trim();
  if (!t) return null;
  const m = /^(?:(\d+):)?(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(t);
  if (!m) return NaN;
  const parts = t.split(":").map(Number);
  return parts.reduce((a, v) => a * 60 + v, 0);
}
export const fmtTime = sec => { const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

/* a row read back from the (possibly hand-edited) csv */
export function rowFromCsv(o) {
  const seq = +o.seq, m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(o.hd || "");
  const date = m ? hijriToGregorian(+m[1], +m[2], +m[3]) : "";
  const numbered = /^(yes|true|1)$/i.test(o.numbered);
  const part = PARTS.includes(o.part) ? o.part : "";
  const series = o.series, id = o.id || lessonId(series, seq, part);
  const errors = [];
  if (!/^[a-z0-9-]{1,60}$/.test(series || "")) errors.push("series");
  if (!Number.isInteger(seq) || seq < 1 || seq > 9999) errors.push("seq");
  if (!date) errors.push("hd (that Hijri date does not exist)");
  if (!["published", "draft", "skip"].includes(o.status)) errors.push("status (published / draft / skip)");
  if (o.part && !PARTS.includes(o.part)) errors.push("part (empty, a, b, c or d)");
  const ts = parseTime(o.trim_start), te = parseTime(o.trim_end);
  if (Number.isNaN(ts)) errors.push("trim_start (like 35:10 or 1:05:30 or 2110)");
  if (Number.isNaN(te)) errors.push("trim_end (like 1:20:00)");
  if (ts != null && te != null && te <= ts) errors.push("trim_end must be after trim_start");
  const rm = parseRanges(o.remove);
  if (rm.error) errors.push(`remove (${rm.error}; like 13:02-32:15;50:00-52:10)`);
  return { row: { file: o.file, series, seq, numbered, part, id, title: o.title, hd: m ? `${+m[1]}-${+m[2]}-${+m[3]}` : "", date, section: o.section || "", trim_start: o.trim_start || "", trim_end: o.trim_end || "", trimStart: Number.isFinite(ts) ? ts : null, trimEnd: Number.isFinite(te) ? te : null, remove: o.remove || "", removeRanges: rm.ranges || [], status: o.status || "published", action: o.action || "", note: o.note || "" }, errors };
}

/* ───── silence / blank-stretch detection ───── */
/* levels = RMS level in dB of each consecutive minute of a recording (-Infinity or very low for silence). A minute is "quiet" when it is 20 dB or more below the median minute. */
export function analyzeProfile(levels, { dropDb = 20 } = {}) {
  const n = levels.length, fin = levels.filter(Number.isFinite).sort((a, b) => a - b);
  if (!n) return { minutes: 0, flags: ["no audio"], lead: 0, trail: 0, gaps: [], median: null };
  if (!fin.length) return { minutes: n, flags: ["WHOLE FILE IS SILENT"], lead: n, trail: 0, gaps: [], median: null };
  const median = fin[Math.floor(fin.length / 2)], quiet = levels.map(v => !Number.isFinite(v) || v < median - dropDb);
  let lead = 0; while (lead < n && quiet[lead]) lead++;
  let trail = 0; while (trail < n - lead && quiet[n - 1 - trail]) trail++;
  const gaps = []; for (let i = lead; i < n - trail;) { if (quiet[i]) { let j = i; while (j < n - trail && quiet[j]) j++; if (j - i >= 3) gaps.push({ from: i, minutes: j - i }); i = j; } else i++; }
  const flags = [];
  if (lead >= 2) flags.push(`LEADING SILENCE ~${lead} min`);
  if (trail >= 2) flags.push(`TRAILING SILENCE ~${trail} min`);
  for (const g of gaps) flags.push(`GAP of ~${g.minutes} min at minute ${g.from}`);
  return { minutes: n, flags, lead, trail, gaps, median, levels };
}
/* ffmpeg `ametadata=print` output -> [dB per window] */
export const parseRms = text => [...String(text).matchAll(/lavfi\.astats\.Overall\.RMS_level=(-?inf|-?\d+(?:\.\d+)?)/g)].map(m => /inf/.test(m[1]) ? -Infinity : +m[1]);

/* ───── removing stretches from the inside of a recording (prayer breaks etc.) ───── */
/* "13:02-32:15;50:00-52:10" -> { ranges: [[782, 1935], [3000, 3130]] } (seconds, in the timeline of the ORIGINAL file; sorted, not overlapping) or { error } */
export function parseRanges(x) {
  const t = String(x ?? "").trim();
  if (!t) return { ranges: [] };
  const ranges = [];
  for (const part of t.split(/[;\n]/).map(v => v.trim()).filter(Boolean)) {
    const m = /^(\S+?)\s*-\s*(\S+)$/.exec(part);
    const a = m ? parseTime(m[1]) : NaN, b = m ? parseTime(m[2]) : NaN;
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return { error: `«${part}» is not a range` };
    ranges.push([a, b]);
  }
  ranges.sort((p, q) => p[0] - q[0]);
  for (let i = 1; i < ranges.length; i++) if (ranges[i][0] < ranges[i - 1][1]) return { error: "ranges overlap" };
  return { ranges };
}
export const fmtRanges = ranges => ranges.map(([a, b]) => `${fmtTime(a)}-${fmtTime(b)}`).join(";");
/* merge two sorted range lists (overlapping/touching ranges become one) */
export function mergeRanges(...lists) {
  const all = lists.flat().map(r => [...r]).sort((a, b) => a[0] - b[0]), out = [];
  for (const r of all) { const last = out[out.length - 1]; if (last && r[0] <= last[1] + 0.5) last[1] = Math.max(last[1], r[1]); else out.push(r); }
  return out;
}
/* time in the converted file -> time in the original file (undo the start trim and the removed ranges) */
export function mapToSource(t, trimStart = 0, removed = []) {
  let x = t + (trimStart || 0);
  for (const [a, b] of removed) if (x >= a) x += b - a;
  return x;
}
/* The ffmpeg filter that drops the removed ranges (times in the original file; `trimStart` is subtracted because -ss restarts the clock) */
export function removeFilter(removed, trimStart = 0) {
  const rs = removed.map(([a, b]) => [a - (trimStart || 0), b - (trimStart || 0)]).filter(([, b]) => b > 0).map(([a, b]) => [Math.max(0, a), b]);
  return rs.length ? `aselect='not(${rs.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join("+")})',asetpts=N/SR/TB,` : "";
}
/* levels = RMS dB of each consecutive SECOND. A second is quiet when it is `dropDb` below the 70th percentile of the file (the usual speech level, even when a long break makes up half of the recording); loud blips (a cough, a footstep) of up to `mergeSeconds`
   inside a quiet stretch do not end it. -> [{ from, to }] in seconds, only stretches of at least `minSeconds` */
export function findQuietRuns(levels, { dropDb = 20, minSeconds = 60, mergeSeconds = 4 } = {}) {
  const fin = levels.filter(Number.isFinite).sort((a, b) => a - b);
  if (!fin.length) return { runs: levels.length >= minSeconds ? [{ from: 0, to: levels.length }] : [], median: null };
  const median = fin[Math.min(fin.length - 1, Math.floor(fin.length * 0.7))], quiet = levels.map(v => !Number.isFinite(v) || v < median - dropDb), runs = [];
  for (let i = 0; i < quiet.length;) {
    if (!quiet[i]) { i++; continue; }
    let j = i;
    for (;;) { while (j < quiet.length && quiet[j]) j++; let k = j; while (k < quiet.length && !quiet[k] && k - j < mergeSeconds + 1) k++; if (k < quiet.length && quiet[k] && k - j <= mergeSeconds) j = k; else break; }
    if (j - i >= minSeconds) runs.push({ from: i, to: j });
    i = j;
  }
  return { runs, median };
}
