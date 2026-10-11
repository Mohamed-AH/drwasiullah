/* Phase 6: the home page layout manager (admin only). A FIXED palette of blocks, not a page builder: the hero stays first; the other blocks can be
   reordered, hidden, given a custom plain-text heading, and (shelf / latest) a size; the shelf can show hand-picked series instead of the automatic top ones.
   Stored as D1 `docs` row `home` (same shape as site/data/home.json, read by cleanHome() in site/js/core.js); changes need Publish. */
import { auditStmt } from "./audit.mjs";
import { verOf } from "./content.mjs";
import { esc, layout } from "./html.mjs";

/* keep in step with HOME_BLOCKS in site/js/core.js (tests/admin_home.mjs compares them) */
export const BLOCKS = [
  { id: "news", name: "آخر الإعلانات", hint: "يظهر فقط عند وجود إعلانات منشورة." },
  { id: "schedule", name: "جدول الدروس الأسبوعي", hint: "من صفحة «الجدول»؛ يختفي إن لم يوجد جدول." },
  { id: "about", name: "عن الشيخ", hint: "ملخص السيرة؛ يختفي إن لم تتوفر السيرة." },
  { id: "sections", name: "الأقسام", hint: "بطاقات الدروس المرئية والصوتية والكتب…" },
  { id: "shelf", name: "خزانة الكتب", hint: "رفّ السلاسل (الأكبر عددًا تلقائيًا، أو سلاسل تختارها).", count: 10, min: 3, max: 16 },
  { id: "latest", name: "أحدث المواد", hint: "آخر الدروس بحسب التاريخ.", count: 8, min: 4, max: 24 },
];
const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

/* the same normal form the site uses: all blocks present, valid values only */
export function normalize(raw, seriesIds) {
  const given = raw && Array.isArray(raw.blocks) ? raw.blocks : [], seen = new Set(), out = [];
  const one = (def, x) => {
    const b = { id: def.id, on: x ? x.on !== false : true };
    const title = clean(x && x.title, 60); if (title) b.title = title;
    if (def.count) { const c = Number.parseInt(x && x.count, 10); b.count = Number.isInteger(c) ? Math.min(def.max, Math.max(def.min, c)) : def.count; }
    if (def.id === "shelf") b.series = [...new Set((Array.isArray(x && x.series) ? x.series : []).filter(i => typeof i === "string" && seriesIds.has(i)))].slice(0, def.max);
    return b;
  };
  for (const x of given) { const def = x && BLOCKS.find(d => d.id === x.id); if (!def || seen.has(def.id)) continue; seen.add(def.id); out.push(one(def, x)); }
  for (const def of BLOCKS) if (!seen.has(def.id)) out.push(one(def, null));
  return { blocks: out };
}
const seriesRows = async db => (await db.prepare("SELECT id, title FROM series WHERE status = 'published' ORDER BY sec, origin, pos").all()).results;
export async function loadHome(db) {
  const r = await db.prepare("SELECT data FROM docs WHERE name = 'home'").first(), series = await seriesRows(db);
  let raw = null; try { raw = r ? JSON.parse(r.data) : null; } catch { /* corrupt: fall back to the default */ }
  return { doc: normalize(raw, new Set(series.map(s => s.id))), custom: !!r, series };
}
export const homeVer = doc => verOf(JSON.stringify(doc));
const put = (db, doc) => db.prepare("INSERT OR REPLACE INTO docs (name, data) VALUES ('home', ?)").bind(JSON.stringify(doc));

export async function saveHome(f, env, user, redirect) {
  const db = env.DB, { doc: cur, series } = await loadHome(db);
  if (String(f.get("ver") ?? "") !== await homeVer(cur)) return redirect("/home", "conflict", "err");
  const ids = f.getAll("ids").map(String), valid = new Set(series.map(s => s.id));
  if (ids.length !== BLOCKS.length || new Set(ids).size !== BLOCKS.length || !ids.every(i => BLOCKS.some(b => b.id === i))) return redirect("/home", "invalid", "err");
  const raw = { blocks: ids.map(id => ({ id, on: f.get("on_" + id) === "1", title: f.get("title_" + id) ?? "", count: f.get("count_" + id), series: id === "shelf" ? f.getAll("series").map(String) : undefined })) };
  const move = String(f.get("move") ?? ""), m = /^([a-z]+):(up|down)$/.exec(move);          // the arrows save the whole form, then move one block
  if (m) { const i = raw.blocks.findIndex(b => b.id === m[1]), j = m[2] === "up" ? i - 1 : i + 1; if (i >= 0 && j >= 0 && j < raw.blocks.length) [raw.blocks[i], raw.blocks[j]] = [raw.blocks[j], raw.blocks[i]]; }
  const next = normalize(raw, valid), same = JSON.stringify(next) === JSON.stringify(cur);
  if (same) return redirect("/home", "nochange", "err");
  await db.batch([put(db, next), auditStmt(db, user.email, "home.save", "home", null, cur, next)]);
  return redirect("/home", "home_saved", "ok");
}
export async function resetHome(f, env, user, redirect) {
  const db = env.DB, { doc: cur, series } = await loadHome(db);
  if (String(f.get("ver") ?? "") !== await homeVer(cur)) return redirect("/home", "conflict", "err");
  const next = normalize(null, new Set(series.map(s => s.id)));
  await db.batch([put(db, next), auditStmt(db, user.email, "home.reset", "home", null, cur, next)]);   // the default is stored (not deleted) so Publish rewrites site/data/home.json
  return redirect("/home", "home_saved", "ok");
}

export async function homePage(db, user, flash) {
  const { doc, series } = await loadHome(db), ver = await homeVer(doc), chosen = new Set(doc.blocks.find(b => b.id === "shelf").series);
  const rows = doc.blocks.map((b, i) => {
    const def = BLOCKS.find(d => d.id === b.id), n = i + 1;
    const extra = (def.count ? `<label>العدد <input type="number" name="count_${b.id}" min="${def.min}" max="${def.max}" class="num" value="${b.count}"></label> ` : "")
      + (b.id === "shelf" ? `<details><summary>سلاسل مختارة (${chosen.size ? chosen.size : "تلقائي"})</summary><p class="muted">اتركها فارغة ليُظهر الرفّ الأكبر سلاسل عددًا تلقائيًا؛ وإلا تظهر السلاسل المختارة بترتيبها في القائمة.</p>
<div class="checks">${series.map(s => `<label><input type="checkbox" name="series" value="${esc(s.id)}"${chosen.has(s.id) ? " checked" : ""}> ${esc(s.title)}</label>`).join("")}</div></details>` : "");
    return `<li class="homeblock"><input type="hidden" name="ids" value="${b.id}">
<p><strong>${n}. ${esc(def.name)}</strong> <span class="muted">${esc(def.hint)}</span></p>
<p><label><input type="checkbox" name="on_${b.id}" value="1"${b.on ? " checked" : ""}> يظهر في الصفحة الرئيسية</label> <label>عنوان مخصص (اختياري) <input name="title_${b.id}" maxlength="60" value="${esc(b.title ?? "")}" placeholder="${esc(def.name)}"></label> ${extra}</p>
<p><button class="secondary" name="move" value="${b.id}:up"${i === 0 ? " disabled" : ""} aria-label="رفع ${esc(def.name)}">رفع ↑</button> <button class="secondary" name="move" value="${b.id}:down"${i === doc.blocks.length - 1 ? " disabled" : ""} aria-label="خفض ${esc(def.name)}">خفض ↓</button></p></li>`;
  }).join("");
  const body = `<p class="muted">يبقى رأس الصفحة (الاسم والبحث) في أعلاها ثابتًا. رتّب بقية الأقسام أو أخفها. التغيير يظهر بعد «النشر».</p>
<form method="post" action="/home/save"><input type="hidden" name="ver" value="${ver}"><ol class="homeblocks">${rows}</ol><p><button name="move" value="">حفظ</button></p></form>
<form method="post" action="/home/reset" class="inline"><input type="hidden" name="ver" value="${ver}"><button class="secondary">إعادة الترتيب الافتراضي</button></form>`;
  return layout({ title: "ترتيب الصفحة الرئيسية", user, path: "/home", body, flash });
}
