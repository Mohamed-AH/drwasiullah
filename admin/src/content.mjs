/* Form posts for content: create a series, change a lesson's status. */
import { auditStmt } from "./audit.mjs";

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
  const before = await db.prepare("SELECT id, status FROM lessons WHERE id = ?").bind(id).first();
  if (!before) return back(["unknown_lesson", "err"]);
  await db.batch([
    db.prepare("UPDATE lessons SET status = ? WHERE id = ?").bind(status, id),
    auditStmt(db, user.email, "lesson.status", "lesson", id, { status: before.status }, { status }),
  ]);
  return back(["status_saved", "ok"]);
}
