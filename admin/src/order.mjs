/* Saved display order of a series (phase 4c). The list of lesson ids is stored in table series_order, exported by Publish to site/data/order.json
   and applied at build time (applyOrder in site/js/core.js). The screen always works on the FULL list of the series' lessons. */
import { auditStmt } from "./audit.mjs";
import { verOf } from "./content.mjs";

const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, "").trim().slice(0, n);
export const MAX_LIST = 5000;
const ORIGIN_RANK = { catalogue: 0, library: 1, makkah: 2, haram: 3 };

/* the lessons of a series as the screen lists them: the saved order if there is one (unlisted lessons last, flagged new), else what visitors see today
   (numbered/ordered series: by number; the others: newest first). `ver` changes whenever the saved list or the set of lessons changes. */
export async function orderState(db, seriesId) {
  const s = await db.prepare("SELECT s.id, s.data FROM series s WHERE s.id = ?").bind(seriesId).first();
  if (!s) return null;
  const rows = (await db.prepare("SELECT id, origin, pos, n, section, status, title, hd, date, patched FROM lessons_eff WHERE series_id = ?").bind(seriesId).all()).results;
  const saved = await db.prepare("SELECT ids FROM series_order WHERE series_id = ?").bind(seriesId).first();
  const savedIds = saved ? JSON.parse(saved.ids) : null;
  const ordered = !!JSON.parse(s.data).ordered || rows.some(r => r.n != null);
  const rank = r => (ORIGIN_RANK[r.origin] ?? 9) * 1e7 + r.pos;
  const dflt = rows.slice().sort(ordered ? (a, b) => (a.n ?? 1e9) - (b.n ?? 1e9) || rank(a) - rank(b) : (a, b) => String(b.date || "").localeCompare(String(a.date || "")) || rank(a) - rank(b));
  let list = dflt, fresh = new Set();
  if (savedIds) {
    const by = new Map(rows.map(r => [r.id, r])), seen = new Set(), listed = [];
    for (const id of savedIds) if (by.has(id) && !seen.has(id)) { seen.add(id); listed.push(by.get(id)); }
    const rest = rows.filter(r => !seen.has(r.id)).sort((a, b) => (a.n ?? 1e9) - (b.n ?? 1e9) || rank(a) - rank(b));
    fresh = new Set(rest.map(r => r.id));
    list = [...listed, ...rest];
  }
  const ver = await verOf(JSON.stringify(savedIds) + "|" + rows.map(r => r.id).sort().join(","));
  return { list, manual: !!savedIds, fresh, ver };
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8" } });

/* POST /api/series-order {series, ids, ver} */
export async function saveOrder(request, env, user) {
  let b;
  try { if (+request.headers.get("content-length") > 512 * 1024) throw 0; b = await request.json(); } catch { return json({ error: "طلب غير صالح" }, 400); }
  const sid = clean(b.series, 60), ids = b.ids, db = env.DB;
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_LIST || ids.some(x => typeof x !== "string" || x.length > 120) || new Set(ids).size !== ids.length) return json({ error: "قائمة غير صالحة" }, 400);
  const st = await orderState(db, sid);
  if (!st) return json({ error: "السلسلة غير موجودة" }, 404);
  if (clean(b.ver, 20) !== st.ver) return json({ error: "تغيّرت قائمة الدروس أو ترتيبها منذ فتحت الصفحة؛ أعد تحميلها." }, 409);
  const have = st.list.map(r => r.id);
  if (ids.length !== have.length || ids.some(x => !have.includes(x))) return json({ error: "قائمة الدروس لا تطابق السلسلة؛ أعد تحميل الصفحة." }, 409);
  const moved = ids.reduce((n, id, i) => n + (id !== have[i] ? 1 : 0), 0);
  await db.batch([
    db.prepare("INSERT OR REPLACE INTO series_order (series_id, ids, updated_by, updated_at) VALUES (?,?,?,datetime('now'))").bind(sid, JSON.stringify(ids), user.email),
    auditStmt(db, user.email, "series.order", "series", sid, { manual: st.manual }, { lessons: ids.length, moved }),
  ]);
  return json({ ok: true, moved, ver: (await orderState(db, sid)).ver });
}

/* POST /api/series-order/reset {series, ver}: the series follows the automatic order again */
export async function resetOrder(request, env, user) {
  let b;
  try { b = await request.json(); } catch { return json({ error: "طلب غير صالح" }, 400); }
  const sid = clean(b.series, 60), db = env.DB;
  const st = await orderState(db, sid);
  if (!st) return json({ error: "السلسلة غير موجودة" }, 404);
  if (!st.manual) return json({ ok: true, nochange: true });
  await db.batch([
    db.prepare("DELETE FROM series_order WHERE series_id = ?").bind(sid),
    auditStmt(db, user.email, "series.order.reset", "series", sid, { manual: true }, null),
  ]);
  return json({ ok: true });
}
