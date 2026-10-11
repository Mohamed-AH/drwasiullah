/* Phase 5: banners, announcements, the weekly schedule and "no lesson tonight" notices. Banners/announcements/notices are live within a minute (public GET /api/live);
   the weekly schedule itself is part of the pre-rendered pages, so schedule edits need Publish. Admin only (roles.mjs). */
import { auditStmt } from "./audit.mjs";
import { verOf } from "./content.mjs";
import { makkahToUtc, makkahToday } from "./timeutil.mjs";

const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const cleanText = (s, n) => String(s ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f‎‏‪-‮⁦-⁩]/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, n);
export const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/* an optional https link; "" = none; false = invalid */
const httpsUrl = v => { v = String(v ?? "").trim(); if (!v) return ""; try { const u = new URL(v); return u.protocol === "https:" && v.length <= 400 ? u.href : false; } catch { return false; } };

/* ---------- banners ---------- */
export async function saveBanner(f, env, user, redirect) {
  const db = env.DB, id = parseInt(f.get("id") || "0", 10) || 0;
  const back = (code, k) => redirect(id ? `/banners/${id}` : "/banners", code, k);
  const text = clean(f.get("text"), 200), kind = clean(f.get("kind"), 10), link = httpsUrl(f.get("link"));
  const starts = makkahToUtc(f.get("starts")), ends = makkahToUtc(f.get("ends"));
  const dismissible = f.get("dismissible") ? 1 : 0, active = f.get("active") ? 1 : 0;
  if (!text || !["info", "notice", "urgent"].includes(kind) || link === false || Number.isNaN(starts) || Number.isNaN(ends) || (starts && ends && ends <= starts)) return back("invalid", "err");
  if (id) {
    const before = await db.prepare("SELECT id, text, kind, link, starts_at, ends_at, dismissible, active FROM banners WHERE id = ?").bind(id).first();
    if (!before) return redirect("/banners", "unknown_lesson", "err");
    await db.batch([db.prepare("UPDATE banners SET text=?, kind=?, link=?, starts_at=?, ends_at=?, dismissible=?, active=? WHERE id=?").bind(text, kind, link || null, starts, ends, dismissible, active, id),
      auditStmt(db, user.email, "banner.edit", "banner", String(id), before, { text, kind, link, starts_at: starts, ends_at: ends, dismissible, active })]);
    return redirect("/banners", "banner_saved", "ok");
  }
  const r = await db.prepare("INSERT INTO banners (text, kind, link, starts_at, ends_at, dismissible, active, created_by) VALUES (?,?,?,?,?,?,?,?)").bind(text, kind, link || null, starts, ends, dismissible, active, user.email).run();
  await auditStmt(db, user.email, "banner.add", "banner", String(r.meta.last_row_id), null, { text, kind, active }).run();
  return redirect("/banners", "banner_saved", "ok");
}
export async function toggleBanner(f, env, user, redirect) {
  const db = env.DB, id = parseInt(f.get("id") || "0", 10) || 0, active = f.get("active") === "1" ? 1 : 0;
  const row = await db.prepare("SELECT id, active FROM banners WHERE id = ?").bind(id).first();
  if (!row) return redirect("/banners", "unknown_lesson", "err");
  await db.batch([db.prepare("UPDATE banners SET active = ? WHERE id = ?").bind(active, id), auditStmt(db, user.email, "banner.toggle", "banner", String(id), { active: row.active }, { active })]);
  return redirect("/banners", "banner_saved", "ok");
}
export async function deleteBanner(f, env, user, redirect) {
  const db = env.DB, id = parseInt(f.get("id") || "0", 10) || 0;
  const row = await db.prepare("SELECT id, text, kind FROM banners WHERE id = ?").bind(id).first();
  if (!row) return redirect("/banners", "unknown_lesson", "err");
  await db.batch([db.prepare("DELETE FROM banners WHERE id = ?").bind(id), auditStmt(db, user.email, "banner.delete", "banner", String(id), row, null)]);
  return redirect("/banners", "deleted", "ok");
}

/* ---------- announcements ---------- */
export async function saveAnnouncement(f, env, user, redirect) {
  const db = env.DB, id = parseInt(f.get("id") || "0", 10) || 0;
  const back = (code, k) => redirect(id ? `/announcements/${id}` : "/announcements", code, k);
  const title = clean(f.get("title"), 150), body = cleanText(f.get("body"), 2000), link = httpsUrl(f.get("link")), label = clean(f.get("link_label"), 40);
  const status = clean(f.get("status"), 10), pinned = f.get("pinned") ? 1 : 0, at = makkahToUtc(f.get("publish_at"));
  if (!title || !body || link === false || !["draft", "published"].includes(status) || Number.isNaN(at)) return back("invalid", "err");
  if (id) {
    const before = await db.prepare("SELECT id, title, status, pinned, publish_at FROM announcements WHERE id = ?").bind(id).first();
    if (!before) return redirect("/announcements", "unknown_lesson", "err");
    await db.batch([db.prepare("UPDATE announcements SET title=?, body=?, link=?, link_label=?, pinned=?, status=?, publish_at=? WHERE id=?").bind(title, body, link || null, label || null, pinned, status, at, id),
      auditStmt(db, user.email, "announcement.edit", "announcement", String(id), before, { title, status, pinned, publish_at: at })]);
    return redirect("/announcements", "announcement_saved", "ok");
  }
  const r = await db.prepare("INSERT INTO announcements (title, body, link, link_label, pinned, status, publish_at, created_by) VALUES (?,?,?,?,?,?,?,?)").bind(title, body, link || null, label || null, pinned, status, at, user.email).run();
  await auditStmt(db, user.email, "announcement.add", "announcement", String(r.meta.last_row_id), null, { title, status, pinned }).run();
  return redirect("/announcements", "announcement_saved", "ok");
}
export async function deleteAnnouncement(f, env, user, redirect) {
  const db = env.DB, id = parseInt(f.get("id") || "0", 10) || 0;
  const row = await db.prepare("SELECT id, title, status FROM announcements WHERE id = ?").bind(id).first();
  if (!row) return redirect("/announcements", "unknown_lesson", "err");
  await db.batch([db.prepare("DELETE FROM announcements WHERE id = ?").bind(id), auditStmt(db, user.email, "announcement.delete", "announcement", String(id), row, null)]);
  return redirect("/announcements", "deleted", "ok");
}

/* ---------- weekly schedule (stored as the document `schedule` in table docs; Publish writes site/data/schedule.json) ---------- */
export async function loadSchedule(db) {
  const r = await db.prepare("SELECT data FROM docs WHERE name = 'schedule'").first();
  const doc = r ? JSON.parse(r.data) : { note: "", live: null, slots: [] };
  if (!Array.isArray(doc.slots)) doc.slots = [];
  const used = new Set(doc.slots.map((x, i) => /^[a-z0-9-]{1,20}$/.test(String(x.id ?? "")) ? String(x.id) : null).filter(Boolean));
  doc.slots.forEach((x, i) => {                                     // slots without an id get the same default the site uses: s<position>
    if (/^[a-z0-9-]{1,20}$/.test(String(x.id ?? ""))) return;
    let id = "s" + (i + 1), n = i + 1; while (used.has(id)) id = "s" + (++n);
    x.id = id; used.add(id);
  });
  return { doc, text: r ? r.data : null };
}
export const scheduleVer = doc => verOf(JSON.stringify(doc));
const saveSchedule = (db, user, doc, action, entityId, before, after) => db.batch([
  db.prepare("INSERT OR REPLACE INTO docs (name, data) VALUES ('schedule', ?)").bind(JSON.stringify(doc)),
  auditStmt(db, user.email, action, "schedule", entityId, before, after),
]);

export async function saveSlot(f, env, user, redirect) {
  const db = env.DB, sid = clean(f.get("slot"), 20), isNew = !sid;
  const back = (code, k) => redirect(isNew ? "/schedule" : `/schedule`, code, k);
  const { doc } = await loadSchedule(db);
  if (clean(f.get("ver"), 20) !== await scheduleVer(doc)) return back("conflict", "err");
  const days = f.getAll("days").map(String).filter(d => WEEKDAYS.includes(d)), title = clean(f.get("title"), 120), time = clean(f.get("time"), 60), note = clean(f.get("note"), 160);
  const lang = f.get("lang") === "ur" ? "ur" : "ar", order = Number.parseInt(f.get("order") || "50", 10), hidden = f.get("hidden") ? true : false, series = clean(f.get("series"), 60);
  if (!title || !days.length || !Number.isInteger(order) || order < 0 || order > 99) return back("invalid", "err");
  if (series && !await db.prepare("SELECT 1 FROM series WHERE id = ?").bind(series).first()) return back("invalid", "err");
  const slot = { id: sid, days: WEEKDAYS.filter(d => days.includes(d)), order, time, title, ...(series ? { series } : {}), ...(lang === "ur" ? { lang } : {}), ...(note ? { note } : {}), ...(hidden ? { pending: true } : {}) };
  let before = null;
  if (isNew) { let n = doc.slots.length + 1; const used = new Set(doc.slots.map(x => x.id)); while (used.has("s" + n)) n++; slot.id = "s" + n; doc.slots.push(slot); }
  else { const i = doc.slots.findIndex(x => x.id === sid); if (i < 0) return back("unknown_lesson", "err"); before = doc.slots[i]; doc.slots[i] = slot; }
  await saveSchedule(db, user, doc, "schedule.slot", slot.id, before, slot);
  return back("schedule_saved", "ok");
}
export async function deleteSlot(f, env, user, redirect) {
  const db = env.DB, sid = clean(f.get("slot"), 20), { doc } = await loadSchedule(db);
  if (clean(f.get("ver"), 20) !== await scheduleVer(doc)) return redirect("/schedule", "conflict", "err");
  const i = doc.slots.findIndex(x => x.id === sid);
  if (i < 0) return redirect("/schedule", "unknown_lesson", "err");
  const [gone] = doc.slots.splice(i, 1);
  await db.batch([db.prepare("INSERT OR REPLACE INTO docs (name, data) VALUES ('schedule', ?)").bind(JSON.stringify(doc)), db.prepare("DELETE FROM schedule_notices WHERE slot = ?").bind(sid), auditStmt(db, user.email, "schedule.slot.delete", "schedule", sid, gone, null)]);
  return redirect("/schedule", "schedule_saved", "ok");
}
export async function saveScheduleMeta(f, env, user, redirect) {
  const db = env.DB, { doc } = await loadSchedule(db);
  if (clean(f.get("ver"), 20) !== await scheduleVer(doc)) return redirect("/schedule", "conflict", "err");
  const note = clean(f.get("note"), 300), url = String(f.get("live_url") ?? "").trim();
  let live = null;
  if (url) {
    let u; try { u = new URL(url); } catch { return redirect("/schedule", "invalid", "err"); }
    if (u.protocol !== "https:" || !/^(www\.)?mixlr\.com$/.test(u.hostname)) return redirect("/schedule", "invalid", "err");
    live = { url: u.href, label: clean(f.get("live_label"), 40) || "حضور البث المباشر", sub: clean(f.get("live_sub"), 120) };
  }
  const before = { note: doc.note ?? "", live: doc.live ?? null };
  const next = { note, live, slots: doc.slots };                         // key order as in the seeded file: note, live, slots
  await saveSchedule(db, user, next, "schedule.meta", null, before, { note, live });
  return redirect("/schedule", "schedule_saved", "ok");
}

/* ---------- "no lesson tonight" notices (live) ---------- */
export async function addNotice(f, env, user, redirect) {
  const db = env.DB, slot = clean(f.get("slot"), 20), day = clean(f.get("day"), 10), kind = clean(f.get("kind"), 10), note = clean(f.get("note"), 160);
  const { doc } = await loadSchedule(db), today = makkahToday(), max = new Date(Date.parse(today + "T00:00:00Z") + 60 * 864e5).toISOString().slice(0, 10);
  if (!doc.slots.some(x => x.id === slot) || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < today || day > max || !["cancelled", "changed"].includes(kind) || (kind === "changed" && !note)) return redirect("/schedule", "invalid", "err");
  const r = await db.prepare("INSERT INTO schedule_notices (slot, day, kind, note, created_by) VALUES (?,?,?,?,?)").bind(slot, day, kind, note || null, user.email).run();
  await auditStmt(db, user.email, "notice.add", "notice", String(r.meta.last_row_id), null, { slot, day, kind, note }).run();
  return redirect("/schedule", "notice_saved", "ok");
}
export async function deleteNotice(f, env, user, redirect) {
  const db = env.DB, id = parseInt(f.get("id") || "0", 10) || 0;
  const row = await db.prepare("SELECT id, slot, day, kind FROM schedule_notices WHERE id = ?").bind(id).first();
  if (!row) return redirect("/schedule", "unknown_lesson", "err");
  await db.batch([db.prepare("DELETE FROM schedule_notices WHERE id = ?").bind(id), auditStmt(db, user.email, "notice.delete", "notice", String(id), row, null)]);
  return redirect("/schedule", "notice_saved", "ok");
}
