import { esc, layout, hijri, statusTag, num, stamp } from "./html.mjs";
import { ROLES, ROLE_AR } from "./roles.mjs";

const PER = 100;
const SEC_AR = { duroos: "الدروس المرئية", audio: "الدروس الصوتية", lectures: "المحاضرات", khutab: "الخطب", urdu: "الدروس بالأردية" };
const trunc = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n) + "…" : s; };
const all = (db, sql, ...a) => db.prepare(sql).bind(...a).all().then(r => r.results);
const one = (db, sql, ...a) => db.prepare(sql).bind(...a).first();

const auditTable = rows => `<div class="scroll" tabindex="0" role="region" aria-label="آخر العمليات"><table><thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>العنصر</th></tr></thead><tbody>${
  rows.map(r => `<tr><td>${stamp(r.at)}</td><td class="ltr">${esc(r.actor)}</td><td>${esc(r.action)}</td><td class="ltr">${esc(r.entity)}${r.entity_id ? " · " + esc(r.entity_id) : ""}</td></tr>`).join("")}</tbody></table></div>`;

export async function dashboard(db, user) {
  const [t, by, recent] = await Promise.all([
    one(db, "SELECT (SELECT COUNT(*) FROM lessons) l, (SELECT COUNT(*) FROM series) s, (SELECT COUNT(*) FROM books) b, (SELECT COUNT(*) FROM lessons WHERE status!='published') h"),
    all(db, "SELECT s.sec, COUNT(l.id) c FROM series s LEFT JOIN lessons l ON l.series_id = s.id GROUP BY s.sec ORDER BY c DESC"),
    user.role === "admin" ? all(db, "SELECT at, actor, action, entity, entity_id FROM audit_log ORDER BY id DESC LIMIT 8") : Promise.resolve([]),
  ]);
  const cards = [[t.l, "درس"], [t.s, "سلسلة"], [t.b, "كتاب"], [t.h, "غير منشور"]].map(([n, l]) => `<div class="card"><b>${num(n)}</b><span>${l}</span></div>`).join("");
  const secs = by.map(r => `<tr><td>${esc(SEC_AR[r.sec] || r.sec || "—")}</td><td>${num(r.c)}</td></tr>`).join("");
  const rec = recent.length ? `<h2>آخر العمليات</h2>${auditTable(recent)}` : "";
  return layout({ title: "الرئيسية", user, path: "/", body: `<div class="cards">${cards}</div><h2>الدروس حسب القسم</h2><div class="scroll" tabindex="0" role="region" aria-label="جدول"><table><thead><tr><th>القسم</th><th>الدروس</th></tr></thead><tbody>${secs}</tbody></table></div>${rec}
<p class="muted">هذه النسخة للاطّلاع وإدارة المستخدمين. رفع الدروس وتعديلها يأتي في المرحلة التالية.</p>` });
}

export async function seriesList(db, user) {
  const rows = await all(db, "SELECT s.id, s.title, s.sec, s.status, s.origin, (SELECT COUNT(*) FROM lessons l WHERE l.series_id = s.id) c FROM series s ORDER BY s.sec, s.origin, s.pos");
  const body = `<div class="scroll" tabindex="0" role="region" aria-label="جدول"><table><thead><tr><th>السلسلة</th><th>القسم</th><th>الدروس</th><th>الحالة</th></tr></thead><tbody>${
    rows.map(r => `<tr><td><a href="/series/${encodeURIComponent(r.id)}">${esc(r.title)}</a></td><td>${esc(SEC_AR[r.sec] || r.sec || "—")}</td><td>${num(r.c)}</td><td>${statusTag(r.status)}</td></tr>`).join("")}</tbody></table></div>`;
  return layout({ title: "السلاسل", user, path: "/series", body });
}

export async function seriesDetail(db, user, id, pageNo) {
  const s = await one(db, "SELECT id, title, sec, status FROM series WHERE id = ?", id);
  if (!s) return null;
  const total = (await one(db, "SELECT COUNT(*) c FROM lessons WHERE series_id = ?", id)).c;
  const pages = Math.max(1, Math.ceil(total / PER)), p = Math.min(Math.max(1, pageNo), pages);
  const rows = await all(db, `SELECT id, n, section, status, json_extract(data,'$.title') title, json_extract(data,'$.hd') hd, json_extract(data,'$.date') date
    FROM lessons WHERE series_id = ? ORDER BY (n IS NULL), n, pos LIMIT ? OFFSET ?`, id, PER, (p - 1) * PER);
  const pager = pages > 1 ? `<div class="pager">${p > 1 ? `<a href="?page=${p - 1}">السابق</a>` : ""}<span>صفحة ${num(p)} من ${num(pages)}</span>${p < pages ? `<a href="?page=${p + 1}">التالي</a>` : ""}</div>` : "";
  const body = `<p class="muted">${esc(SEC_AR[s.sec] || s.sec || "")} · ${num(total)} درس · ${statusTag(s.status)} · <a href="/series">كل السلاسل</a></p><div class="scroll" tabindex="0" role="region" aria-label="جدول"><table><thead><tr><th>الرقم</th><th>العنوان</th><th>الباب</th><th>التاريخ الهجري</th><th>الحالة</th></tr></thead><tbody>${
    rows.map(r => `<tr><td>${r.n == null ? "—" : num(r.n)}</td><td>${esc(r.title)}</td><td>${esc(r.section || "")}</td><td>${esc(hijri(r.hd, r.date))}</td><td>${statusTag(r.status)}</td></tr>`).join("")}</tbody></table></div>${pager}`;
  return layout({ title: s.title, user, path: "/series", body });
}

export async function booksList(db, user) {
  const rows = await all(db, "SELECT id, title, status, json_extract(data,'$.group') grp, json_array_length(data,'$.files') files FROM books ORDER BY origin, pos");
  const body = `<div class="scroll" tabindex="0" role="region" aria-label="جدول"><table><thead><tr><th>الكتاب</th><th>المجموعة</th><th>الملفات</th><th>الحالة</th></tr></thead><tbody>${
    rows.map(r => `<tr><td>${esc(r.title)}</td><td>${esc(r.grp || "")}</td><td>${num(r.files)}</td><td>${statusTag(r.status)}</td></tr>`).join("")}</tbody></table></div>`;
  return layout({ title: "الكتب", user, path: "/books", body });
}

const roleSelect = (name, cur) => `<select name="${name}" aria-label="الدور">${ROLES.map(r => `<option value="${r}"${r === cur ? " selected" : ""}>${esc(ROLE_AR[r])}</option>`).join("")}</select>`;

export async function usersPage(db, user, flash) {
  const rows = await all(db, "SELECT email, role, name, active FROM users ORDER BY active DESC, role, email");
  const list = rows.map(r => `<tr><td class="ltr">${esc(r.email)}</td><td>${esc(r.name || "")}</td><td>
<form class="inline" method="post" action="/users/update"><input type="hidden" name="email" value="${esc(r.email)}">${roleSelect("role", r.role)}
<select name="active" aria-label="الحالة"><option value="1"${r.active ? " selected" : ""}>فعّال</option><option value="0"${r.active ? "" : " selected"}>موقوف</option></select><button>حفظ</button></form></td></tr>`).join("");
  const body = `<div class="scroll" tabindex="0" role="region" aria-label="جدول"><table><thead><tr><th>البريد</th><th>الاسم</th><th>الدور والحالة</th></tr></thead><tbody>${list}</tbody></table></div>
<h2>إضافة مستخدم</h2><form class="inline" method="post" action="/users/add"><label>البريد <input type="email" name="email" required maxlength="254" dir="ltr"></label>
<label>الاسم <input name="name" maxlength="80"></label><label>الدور ${roleSelect("role", "editor")}</label><button>إضافة</button></form>
<p class="muted">إضافة البريد هنا لا تكفي: يجب أيضًا أن يكون ضمن سياسة Cloudflare Access (راجع docs/admin-setup.md).</p>`;
  return layout({ title: "المستخدمون", user, path: "/users", body, flash });
}

export async function auditPage(db, user) {
  const rows = await all(db, "SELECT at, actor, action, entity, entity_id, before, after FROM audit_log ORDER BY id DESC LIMIT 200");
  const body = `<div class="scroll" tabindex="0" role="region" aria-label="جدول"><table><thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>العنصر</th><th>قبل</th><th>بعد</th></tr></thead><tbody>${
    rows.map(r => `<tr><td>${stamp(r.at)}</td><td class="ltr">${esc(r.actor)}</td><td>${esc(r.action)}</td><td class="ltr">${esc(r.entity)}${r.entity_id ? " · " + esc(r.entity_id) : ""}</td><td class="ltr"><code>${esc(trunc(r.before, 120))}</code></td><td class="ltr"><code>${esc(trunc(r.after, 120))}</code></td></tr>`).join("")}</tbody></table></div>
<p class="muted">آخر ٢٠٠ عملية.</p>`;
  return layout({ title: "السجل", user, path: "/audit", body });
}
