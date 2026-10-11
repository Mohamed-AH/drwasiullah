/* Form posts for content: create a series, change a lesson's status. */
import { auditStmt } from "./audit.mjs";
import { hijriToGregorian, hijriFromGregorian } from "./hijri.mjs";
import { KEY } from "./upload.mjs";

const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, "").trim().slice(0, n);
const STATUSES = ["draft", "published", "hidden"];
export const NEW_SERIES_SECTIONS = ["audio", "lectures", "khutab", "urdu"];

export async function newSeries(f, env, user, redirect) {
  const db = env.DB;
  const id = clean(f.get("id"), 40).toLowerCase(), title = clean(f.get("title"), 150), sec = clean(f.get("sec"), 12);
  const unit = clean(f.get("unit"), 20) || "الدرس", description = clean(f.get("description"), 300), ordered = f.get("ordered") ? true : false;
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(id) || !title || !NEW_SERIES_SECTIONS.includes(sec)) return redirect("/series/new", "invalid", "err");
  if (await db.prepare("SELECT 1 FROM series WHERE id = ?").bind(id).first()) return redirect("/series/new", "series_exists", "err");
  const pos = (await db.prepare("SELECT COALESCE(MAX(pos), -1) + 1 AS p FROM series WHERE origin = 'library'").first()).p;
  const data = { id, title, sec, ...(description ? { description } : {}), unit, ordered };
  await db.batch([
    db.prepare("INSERT INTO series (id, origin, pos, sec, title, status, data) VALUES (?,?,?,?,?,?,?)").bind(id, "library", pos, sec, title, "published", JSON.stringify(data)),
    auditStmt(db, user.email, "series.add", "series", id, null, data),
  ]);
  return redirect(`/upload?series=${encodeURIComponent(id)}`, "series_added", "ok");
}

export async function lessonStatus(f, env, user, redirect) {
  const db = env.DB, id = clean(f.get("id"), 120), status = clean(f.get("status"), 12);
  const back = r => { const s = clean(f.get("series"), 120), p = parseInt(f.get("page") || "1", 10) || 1; return redirect(`/series/${encodeURIComponent(s)}${p > 1 ? "?page=" + Math.min(p, 1000) : ""}`, r[0], r[1]); };
  if (!STATUSES.includes(status)) return back(["invalid", "err"]);
  const before = await db.prepare("SELECT id, origin, status FROM lessons WHERE id = ?").bind(id).first();
  if (!before) return back(["unknown_lesson", "err"]);
  if (before.origin === "catalogue") {                                     // YouTube lesson: hide/show is a patch on top of the sync
    if (!["published", "hidden"].includes(status)) return back(["invalid", "err"]);
    const cur = await getPatch(db, "lesson", id), patch = { ...cur };
    if (status === "hidden") patch.hidden = true; else delete patch.hidden;
    await saveOverride(db, user, "lesson", id, cur, patch, "lesson.status");
    return back(["status_saved", "ok"]);
  }
  await db.batch([
    db.prepare("UPDATE lessons SET status = ? WHERE id = ?").bind(status, id),
    auditStmt(db, user.email, "lesson.status", "lesson", id, { status: before.status }, { status }),
  ]);
  return back(["status_saved", "ok"]);
}

/* ---------- editing (phase 4a) ---------- */
/* Rows from these data files are owned by the database and shipped by Publish. YouTube rows (origin "catalogue") are written by the daily sync, so they are read-only here. */
export const EDITABLE = ["library", "makkah", "haram"];
const SECTIONS = ["duroos", "audio", "lectures", "khutab", "urdu"];
export const verOf = async text => [...new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text)))].slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
const intOrNull = (v, lo, hi) => { const t = String(v ?? "").trim(); if (t === "") return null; const n = Number(t); return Number.isInteger(n) && n >= lo && n <= hi ? n : NaN; };

/* the Hijri date a lesson shows in the form: its own hd, else its Gregorian date converted */
export function hijriOf(data) {
  const m = /^(\d{3,4})-(\d{1,2})-(\d{1,2})$/.exec(data.hd || "");
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };
  return data.date ? hijriFromGregorian(data.date) : null;
}

export async function editLesson(f, env, user, redirect) {
  const db = env.DB, id = clean(f.get("id"), 120);
  const back = (code, kind) => redirect(`/lessons/${encodeURIComponent(id)}`, code, kind);
  const row = await db.prepare("SELECT id, origin, series_id, status, n, section, data FROM lessons WHERE id = ?").bind(id).first();
  if (!row) return redirect("/series", "unknown_lesson", "err");
  if (row.origin === "catalogue") return editCatalogueLesson(f, env, user, redirect, row);
  if (!EDITABLE.includes(row.origin)) return back("not_editable", "err");
  if (clean(f.get("ver"), 20) !== await verOf(row.data)) return back("conflict", "err");
  const data = JSON.parse(row.data), before = { title: data.title, n: data.n ?? null, section: data.section ?? null, hd: data.hd ?? null, date: data.date ?? null, status: row.status };
  const title = clean(f.get("title"), 200), n = intOrNull(f.get("n"), 1, 9999), section = clean(f.get("section"), 120), status = clean(f.get("status"), 12);
  if (!title || Number.isNaN(n) || !STATUSES.includes(status)) return back("invalid", "err");
  data.title = title;
  if (n == null) delete data.n; else data.n = n;
  if (section) data.section = section; else delete data.section;
  const y = intOrNull(f.get("hy"), 1300, 1600), m = intOrNull(f.get("hm"), 1, 12), d = intOrNull(f.get("hd"), 1, 30);
  if ([y, m, d].some(Number.isNaN)) return back("invalid", "err");
  const orig = hijriOf(data0(row.data));
  if (y == null && m == null && d == null) { delete data.hd; delete data.date; }
  else if (y == null || m == null || d == null) return back("invalid", "err");
  else if (!orig || orig.y !== y || orig.m !== m || orig.d !== d) {                 // changed: recompute; unchanged: leave the stored values alone
    const g = hijriToGregorian(y, m, d);
    if (!g) return back("bad_date", "err");
    data.hd = `${y}-${m}-${d}`; data.date = g;
  }
  const after = { title: data.title, n: data.n ?? null, section: data.section ?? null, hd: data.hd ?? null, date: data.date ?? null, status };
  if (JSON.stringify(before) === JSON.stringify(after)) return back("nochange", "ok");
  await db.batch([
    db.prepare("UPDATE lessons SET n = ?, section = ?, status = ?, data = ? WHERE id = ?").bind(data.n ?? null, data.section ?? null, status, JSON.stringify(data), id),
    auditStmt(db, user.email, "lesson.edit", "lesson", id, before, after),
  ]);
  return back("saved", "ok");
}
const data0 = text => JSON.parse(text);

export async function editSeries(f, env, user, redirect) {
  const db = env.DB, id = clean(f.get("id"), 60);
  const back = (code, kind) => redirect(`/series/${encodeURIComponent(id)}/edit`, code, kind);
  const row = await db.prepare("SELECT id, origin, sec, title, status, data FROM series WHERE id = ?").bind(id).first();
  if (!row) return redirect("/series", "unknown_lesson", "err");
  if (row.origin === "catalogue") return editCatalogueSeries(f, env, user, redirect, row);
  if (!EDITABLE.includes(row.origin)) return back("not_editable", "err");
  if (clean(f.get("ver"), 20) !== await verOf(row.data)) return back("conflict", "err");
  const data = JSON.parse(row.data);
  const before = { title: data.title, description: data.description ?? null, unit: data.unit ?? null, ordered: !!data.ordered, sec: data.sec, status: row.status };
  const title = clean(f.get("title"), 150), description = clean(f.get("description"), 300), unit = clean(f.get("unit"), 20), sec = clean(f.get("sec"), 12), status = clean(f.get("status"), 12);
  if (!title || !SECTIONS.includes(sec) || !STATUSES.includes(status)) return back("invalid", "err");
  data.title = title; data.sec = sec; data.ordered = f.get("ordered") ? true : false;
  if (description) data.description = description; else delete data.description;
  if (unit) data.unit = unit; else delete data.unit;
  const after = { title, description: data.description ?? null, unit: data.unit ?? null, ordered: data.ordered, sec, status };
  if (JSON.stringify(before) === JSON.stringify(after)) return back("nochange", "ok");
  await db.batch([
    db.prepare("UPDATE series SET sec = ?, title = ?, status = ?, data = ? WHERE id = ?").bind(sec, title, status, JSON.stringify(data), id),
    auditStmt(db, user.email, "series.edit", "series", id, before, after),
  ]);
  return back("saved", "ok");
}

/* books: id empty = new. Files come as parallel lists file_label[] / file_url[] and file_rm = indexes to drop. */
export async function saveBook(f, env, user, redirect) {
  const db = env.DB, id = clean(f.get("id"), 20);
  const bad = (code) => redirect(id ? `/books/${encodeURIComponent(id)}` : "/books/new", code, "err");
  const title = clean(f.get("title"), 200), status = clean(f.get("status"), 12), lang = clean(f.get("lang"), 3), note = clean(f.get("note"), 300);
  const group = clean(f.get("group_new"), 60) || clean(f.get("group"), 60);
  if (!title || !group || !STATUSES.includes(status) || !["", "ur"].includes(lang)) return bad("invalid");
  const labels = f.getAll("file_label").map(x => clean(x, 60)), urls = f.getAll("file_url").map(x => String(x).trim().slice(0, 600)), rm = new Set(f.getAll("file_rm").map(String));
  const files = [];
  for (let i = 0; i < urls.length; i++) {
    if (rm.has(String(i))) continue;
    let u; try { u = new URL(urls[i]); } catch { return bad("bad_url"); }
    if (u.protocol !== "https:" || !labels[i]) return bad("bad_url");
    if (u.hostname === "media.drwasiullah.com" && !KEY.test(u.pathname.slice(1))) return bad("bad_url");
    files.push({ label: labels[i], url: u.href });
  }
  if (!files.length || files.length > 12) return bad("need_file");
  if (!id) {
    const max = (await db.prepare("SELECT COALESCE(MAX(CAST(SUBSTR(id, 6) AS INTEGER)), 0) m FROM books WHERE id LIKE 'book-%'").first()).m;
    const nid = "book-" + String(max + 1).padStart(3, "0"), pos = (await db.prepare("SELECT COALESCE(MAX(pos), -1) + 1 p FROM books WHERE origin = 'library'").first()).p;
    const data = { title, group, files, ...(lang ? { lang } : {}), ...(note ? { note } : {}), id: nid };
    await db.batch([
      db.prepare("INSERT INTO books (id, origin, pos, title, status, data) VALUES (?,?,?,?,?,?)").bind(nid, "library", pos, title, status, JSON.stringify(data)),
      auditStmt(db, user.email, "book.add", "book", nid, null, { title, group, files: files.length, status }),
    ]);
    return redirect("/books", "book_added", "ok");
  }
  const row = await db.prepare("SELECT id, origin, status, data FROM books WHERE id = ?").bind(id).first();
  if (!row) return redirect("/books", "unknown_lesson", "err");
  if (!EDITABLE.includes(row.origin)) return bad("not_editable");
  if (clean(f.get("ver"), 20) !== await verOf(row.data)) return bad("conflict");
  const data = JSON.parse(row.data), before = { title: data.title, group: data.group, files: (data.files || []).length, lang: data.lang ?? null, note: data.note ?? null, status: row.status };
  data.title = title; data.group = group; data.files = files;
  if (lang) data.lang = lang; else delete data.lang;
  if (note) data.note = note; else delete data.note;
  await db.batch([
    db.prepare("UPDATE books SET title = ?, status = ?, data = ? WHERE id = ?").bind(title, status, JSON.stringify(data), id),
    auditStmt(db, user.email, "book.edit", "book", id, before, { title, group, files: files.length, lang: lang || null, note: note || null, status }),
  ]);
  return redirect("/books", "book_saved", "ok");
}

/* ---------- YouTube (catalogue) items: edits are PATCHES on top of the daily sync (table `overrides`, applied at build time) ---------- */
const LESSON_PATCH_KEYS = ["title", "n", "section", "series", "hd", "date"], SERIES_PATCH_KEYS = ["title", "description", "sec"];
export const getPatch = async (db, kind, id) => { const r = await db.prepare("SELECT patch FROM overrides WHERE kind = ? AND id = ?").bind(kind, id).first(); return r ? JSON.parse(r.patch) : {}; };
export const withPatch = (base, patch) => { const o = { ...base }; for (const [k, v] of Object.entries(patch)) { if (k === "hidden") continue; if (v === null) delete o[k]; else o[k] = v; } return o; };
export const catVer = (row, patch) => verOf(row.data + "|" + JSON.stringify(patch));

/* new patch = only what differs from the sync's own value; returns {patch, changed} */
function diffPatch(base, next, keys, hidden) {
  const patch = {};
  for (const k of keys) { const a = base[k] ?? null, b = next[k] ?? null; if (a !== b) patch[k] = b; }
  if (hidden) patch.hidden = true;
  return patch;
}
const saveOverride = (db, user, kind, id, before, patch, action) => {
  const stmts = [];
  if (Object.keys(patch).length) stmts.push(db.prepare("INSERT OR REPLACE INTO overrides (kind, id, patch, updated_by, updated_at) VALUES (?,?,?,?,datetime('now'))").bind(kind, id, JSON.stringify(patch), user.email));
  else stmts.push(db.prepare("DELETE FROM overrides WHERE kind = ? AND id = ?").bind(kind, id));
  stmts.push(auditStmt(db, user.email, action, kind, id, before, patch));
  return db.batch(stmts);
};

async function editCatalogueLesson(f, env, user, redirect, row) {
  const db = env.DB, id = row.id, back = (code, kind) => redirect(`/lessons/${encodeURIComponent(id)}`, code, kind);
  const base = JSON.parse(row.data), cur = await getPatch(db, "lesson", id);
  if (clean(f.get("ver"), 20) !== await catVer(row, cur)) return back("conflict", "err");
  const eff = withPatch(base, cur);
  const title = clean(f.get("title"), 200), n = intOrNull(f.get("n"), 1, 9999), section = clean(f.get("section"), 120), status = clean(f.get("status"), 12), series = clean(f.get("series"), 60);
  if (!title || Number.isNaN(n) || !["published", "hidden"].includes(status)) return back("invalid", "err");
  if (!await db.prepare("SELECT 1 FROM series WHERE id = ?").bind(series).first()) return back("invalid", "err");
  const next = { title, n, section: section || null, series, hd: eff.hd ?? null, date: eff.date ?? null };
  const y = intOrNull(f.get("hy"), 1300, 1600), m = intOrNull(f.get("hm"), 1, 12), d = intOrNull(f.get("hd"), 1, 30);
  if ([y, m, d].some(Number.isNaN)) return back("invalid", "err");
  const orig = hijriOf(eff);
  if (y == null && m == null && d == null) { next.hd = null; next.date = null; }
  else if (y == null || m == null || d == null) return back("invalid", "err");
  else if (!orig || orig.y !== y || orig.m !== m || orig.d !== d) {
    const g = hijriToGregorian(y, m, d);
    if (!g) return back("bad_date", "err");
    next.hd = `${y}-${m}-${d}`; next.date = g;
  }
  const patch = diffPatch(base, next, LESSON_PATCH_KEYS, status === "hidden");
  if (JSON.stringify(patch) === JSON.stringify(cur)) return back("nochange", "ok");
  await saveOverride(db, user, "lesson", id, cur, patch, "lesson.edit");
  return back("saved", "ok");
}

async function editCatalogueSeries(f, env, user, redirect, row) {
  const db = env.DB, id = row.id, back = (code, kind) => redirect(`/series/${encodeURIComponent(id)}/edit`, code, kind);
  const base = JSON.parse(row.data), cur = await getPatch(db, "series", id);
  if (clean(f.get("ver"), 20) !== await catVer(row, cur)) return back("conflict", "err");
  const title = clean(f.get("title"), 150), description = clean(f.get("description"), 300), sec = clean(f.get("sec"), 12), status = clean(f.get("status"), 12);
  if (!title || !SECTIONS.includes(sec) || !["published", "hidden"].includes(status)) return back("invalid", "err");
  const patch = diffPatch(base, { title, description: description || null, sec }, SERIES_PATCH_KEYS, status === "hidden");
  if (JSON.stringify(patch) === JSON.stringify(cur)) return back("nochange", "ok");
  await saveOverride(db, user, "series", id, cur, patch, "series.edit");
  return back("saved", "ok");
}

/* "undo all my changes to this item": the item follows the sync again */
export async function resetOverride(f, env, user, redirect, kind) {
  const db = env.DB, id = clean(f.get("id"), 120), table = kind === "lesson" ? "lessons" : "series";
  const row = await db.prepare(`SELECT origin FROM ${table} WHERE id = ?`).bind(id).first();
  const back = (code, k) => redirect(kind === "lesson" ? `/lessons/${encodeURIComponent(id)}` : `/series/${encodeURIComponent(id)}/edit`, code, k);
  if (!row || row.origin !== "catalogue") return redirect("/series", "unknown_lesson", "err");
  const cur = await getPatch(db, kind, id);
  if (!Object.keys(cur).length) return back("nochange", "ok");
  await db.batch([db.prepare("DELETE FROM overrides WHERE kind = ? AND id = ?").bind(kind, id), auditStmt(db, user.email, kind + ".reset", kind, id, cur, null)]);
  return back("reset_done", "ok");
}
