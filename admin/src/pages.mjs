import { esc, layout, hijri, statusTag, num, stamp } from "./html.mjs";
import { ROLES, ROLE_AR, can } from "./roles.mjs";
import { NEW_SERIES_SECTIONS, EDITABLE, verOf, hijriOf, getPatch, withPatch, catVer } from "./content.mjs";
import { pendingChanges } from "./publish.mjs";
import { orderState } from "./order.mjs";

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

/* series as the site will show them: the stored row with the editors' patch applied (YouTube series can be renamed/hidden through patches) */
export const SERIES_EFF = `s.id, s.origin, s.pos,
  CASE WHEN json_type(o.patch, '$.title') IS NOT NULL THEN json_extract(o.patch, '$.title') ELSE s.title END AS title,
  CASE WHEN json_type(o.patch, '$.sec')   IS NOT NULL THEN json_extract(o.patch, '$.sec')   ELSE s.sec   END AS sec,
  CASE WHEN json_extract(o.patch, '$.hidden') = 1 THEN 'hidden' ELSE s.status END AS status`;
export const SERIES_FROM = "series s LEFT JOIN overrides o ON o.kind = 'series' AND o.id = s.id";
const editableOrigin = o => EDITABLE.includes(o) || o === "catalogue";

export async function seriesList(db, user) {
  const rows = await all(db, `SELECT ${SERIES_EFF}, (SELECT COUNT(*) FROM lessons_eff l WHERE l.series_id = s.id) c, EXISTS (SELECT 1 FROM series_order so WHERE so.series_id = s.id) AS manual FROM ${SERIES_FROM} ORDER BY s.sec, s.origin, s.pos`);
  const body = `${can(user.role, "content.edit") ? `<p><a href="/series/new">+ سلسلة جديدة</a> · <a href="/upload">رفع دروس</a></p>` : ""}<div class="scroll" tabindex="0" role="region" aria-label="جدول"><table><thead><tr><th>السلسلة</th><th>القسم</th><th>الدروس</th><th>الحالة</th></tr></thead><tbody>${
    rows.map(r => `<tr><td><a href="/series/${encodeURIComponent(r.id)}">${esc(r.title)}</a>${r.manual ? ` <span class="tag tag-draft">ترتيب يدوي</span>` : ""}</td><td>${esc(SEC_AR[r.sec] || r.sec || "—")}</td><td>${num(r.c)}</td><td>${statusTag(r.status)}</td></tr>`).join("")}</tbody></table></div>`;
  return layout({ title: "السلاسل", user, path: "/series", body });
}

const statusForm = (r, series, page) => `<form class="inline" method="post" action="/lessons/status"><input type="hidden" name="id" value="${esc(r.id)}"><input type="hidden" name="series" value="${esc(series)}"><input type="hidden" name="page" value="${page}">${
  r.status !== "published" ? `<button name="status" value="published">نشر</button>` : ""}${r.status !== "hidden" ? `<button class="secondary" name="status" value="hidden">إخفاء</button>` : ""}</form>`;

export async function seriesDetail(db, user, id, pageNo, flash) {
  const canEdit = can(user.role, "content.hide");
  const s = await one(db, `SELECT ${SERIES_EFF} FROM ${SERIES_FROM} WHERE s.id = ?`, id);
  if (!s) return null;
  const total = (await one(db, "SELECT COUNT(*) c FROM lessons_eff WHERE series_id = ?", id)).c;
  const pages = Math.max(1, Math.ceil(total / PER)), p = Math.min(Math.max(1, pageNo), pages);
  const rows = await all(db, `SELECT id, n, section, status, title, hd, date FROM lessons_eff WHERE series_id = ? ORDER BY (n IS NULL), n, pos LIMIT ? OFFSET ?`, id, PER, (p - 1) * PER);
  const pager = pages > 1 ? `<div class="pager">${p > 1 ? `<a href="?page=${p - 1}">السابق</a>` : ""}<span>صفحة ${num(p)} من ${num(pages)}</span>${p < pages ? `<a href="?page=${p + 1}">التالي</a>` : ""}</div>` : "";
  const body = `<p class="muted">${esc(SEC_AR[s.sec] || s.sec || "")} · ${num(total)} درس · ${statusTag(s.status)} · <a href="/series">كل السلاسل</a>${can(user.role, "content.edit") ? ` · <a href="/upload?series=${encodeURIComponent(s.id)}">رفع دروس إلى هذه السلسلة</a>${editableOrigin(s.origin) ? ` · <a href="/series/${encodeURIComponent(s.id)}/edit">تعديل السلسلة</a>` : ""} · <a href="/series/${encodeURIComponent(s.id)}/order">ترتيب الدروس</a>` : ""}</p><div class="scroll" tabindex="0" role="region" aria-label="جدول"><table><thead><tr><th>الرقم</th><th>العنوان</th><th>الباب</th><th>التاريخ الهجري</th><th>الحالة</th></tr></thead><tbody>${
    rows.map(r => `<tr><td>${r.n == null ? "—" : num(r.n)}</td><td>${canEdit ? `<a href="/lessons/${encodeURIComponent(r.id)}">${esc(r.title)}</a>` : esc(r.title)}</td><td>${esc(r.section || "")}</td><td>${esc(hijri(r.hd, r.date))}</td><td>${statusTag(r.status)}${canEdit ? statusForm(r, id, p) : ""}</td></tr>`).join("")}</tbody></table></div>${pager}`;
  return layout({ title: s.title, user, path: "/series", body, flash });
}

export async function booksList(db, user, flash) {
  const rows = await all(db, "SELECT id, title, status, json_extract(data,'$.group') grp, json_array_length(data,'$.files') files FROM books ORDER BY origin, pos");
  const body = `${can(user.role, "content.edit") ? `<p><a href="/books/new">+ كتاب جديد</a></p>` : ""}<div class="scroll" tabindex="0" role="region" aria-label="جدول"><table><thead><tr><th>الكتاب</th><th>المجموعة</th><th>الملفات</th><th>الحالة</th></tr></thead><tbody>${
    rows.map(r => `<tr><td>${can(user.role, "content.edit") ? `<a href="/books/${encodeURIComponent(r.id)}">${esc(r.title)}</a>` : esc(r.title)}</td><td>${esc(r.grp || "")}</td><td>${num(r.files)}</td><td>${statusTag(r.status)}</td></tr>`).join("")}</tbody></table></div>`;
  return layout({ title: "الكتب", user, path: "/books", body, flash });
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

/* ---- upload screen (the main workflow) ---- */
const jsonForPage = o => JSON.stringify(o).replace(/[<>&\u2028\u2029]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));

export async function uploadPage(db, user) {
  const list = await all(db, `SELECT s.id, s.title, json_extract(s.data,'$.unit') unit FROM series s
    WHERE s.origin IN ('library','makkah') AND s.sec != 'duroos' AND ((SELECT COUNT(*) FROM lessons l WHERE l.series_id = s.id AND l.kind = 'audio') > 0 OR (SELECT COUNT(*) FROM lessons l WHERE l.series_id = s.id) = 0)
    ORDER BY s.origin DESC, s.pos`);
  const lessons = await all(db, `SELECT l.series_id sid, l.id, l.n, json_extract(l.data,'$.title') title, json_extract(l.data,'$.hd') hd FROM lessons l WHERE l.series_id IN (${list.map(() => "?").join(",") || "''"}) ORDER BY l.series_id, (l.n IS NULL), l.n, l.pos`, ...list.map(s => s.id));
  const by = {};
  for (const s of list) by[s.id] = { id: s.id, title: s.title, unit: s.unit || "الدرس", count: 0, next: 1, last: null, ids: [] };
  for (const l of lessons) {
    const b = by[l.sid]; b.count++; b.ids.push(l.id);
    if (l.n != null) { if (l.n >= b.next) b.next = l.n + 1; if (!b.last || l.n >= b.last.n) b.last = { n: l.n, title: l.title, hd: l.hd ? hijri(l.hd) : "" }; }
  }
  const body = `<p class="muted">اختر السلسلة، ثم اسحب الملفات (mp3 / m4a). تُرقَّم تلقائيًا بعد آخر درس، ويمكنك تعديل الرقم والعنوان والتاريخ الهجري قبل الحفظ.</p>
<script type="application/json" id="series-data">${jsonForPage({ list: list.map(s => ({ id: s.id, title: s.title })), by })}</script>
<div id="upload-root">
<p><label>السلسلة <select id="series" aria-label="السلسلة"></select></label> <a href="/series/new">+ سلسلة جديدة</a></p>
<p id="series-info" class="muted"></p>
<div id="drop" tabindex="0" role="button">اسحب الملفات إلى هنا أو اضغط للاختيار</div>
<input type="file" id="file" multiple accept=".mp3,.m4a,audio/mpeg,audio/mp4" hidden>
<div id="table-wrap" hidden>
<fieldset><legend>التاريخ الهجري (يوم / شهر / سنة)</legend><span class="hdate"><input id="g-d" class="num sm" type="number" min="1" max="30" aria-label="اليوم"> / <input id="g-m" class="num sm" type="number" min="1" max="12" aria-label="الشهر"> / <input id="g-y" class="num md" type="number" min="1300" max="1600" aria-label="السنة"></span>
 <button type="button" class="secondary" id="apply-date">تطبيق على كل الملفات</button> <span class="muted">الافتراضي تاريخ اليوم؛ راجعه إن كان التسجيل في يوم آخر.</span></fieldset>
<div class="scroll" tabindex="0" role="region" aria-label="الملفات"><table><thead><tr><th>الملف</th><th>الرقم</th><th>العنوان</th><th>التاريخ الهجري</th><th>الحالة</th><th><span class="sr">إزالة</span></th></tr></thead><tbody id="rows"></tbody></table></div>
</div>
<p><button type="button" id="go">رفع وحفظ</button></p>
<p id="msg" class="flash ok" role="status" hidden></p>
<div id="done" hidden></div>
</div>`;
  return layout({ title: "رفع درس صوتي", user, path: "/upload", body, scripts: true });
}

export async function newSeriesPage(db, user, flash) {
  const sec = { audio: "الدروس الصوتية", lectures: "المحاضرات", khutab: "الخطب", urdu: "الدروس بالأردية" };
  const body = `<form method="post" action="/series/new">
<p><label>المعرّف (إنجليزي صغير وأرقام وشرطة، لا يتغير بعد ذلك) <input name="id" required pattern="[a-z0-9][a-z0-9\\-]{1,39}" maxlength="40" dir="ltr"></label></p>
<p><label>العنوان <input name="title" required maxlength="150" class="wide"></label></p>
<p><label>القسم <select name="sec">${NEW_SERIES_SECTIONS.map(k => `<option value="${k}">${esc(sec[k])}</option>`).join("")}</select></label>
<label>اسم الوحدة <input name="unit" value="الدرس" maxlength="20" size="8"></label>
<label><input type="checkbox" name="ordered" value="1" checked> دروس مرقّمة بالترتيب</label></p>
<p><label>وصف قصير (اختياري)<br><textarea name="description" maxlength="300" rows="2"></textarea></label></p>
<p><button>إنشاء السلسلة</button></p></form>
<p class="muted">لا تظهر السلسلة في الموقع حتى تُنشر فيها الدروس.</p>`;
  return layout({ title: "سلسلة جديدة", user, path: "/series", body, flash });
}

export async function publishPage(db, user, flash) {
  const { last, count } = await pendingChanges(db);
  const recent = await all(db, "SELECT at, actor, action, entity, entity_id FROM audit_log WHERE action LIKE 'lesson.%' OR action LIKE 'series.%' OR action LIKE 'book.%' OR action LIKE 'schedule.%' OR action LIKE 'home.%' ORDER BY id DESC LIMIT 10");
  const body = `<p>${count ? `<b>${num(count)}</b> تغيير لم يُنشر بعد.` : "لا توجد تغييرات جديدة منذ آخر نشر."} ${last ? `<span class="muted">آخر نشر: ${stamp(last.at)} (${esc(last.actor)})</span>` : ""}</p>
<form method="post" action="/publish"><button>نشر الآن</button></form>
<p class="muted">يُنشر المنشور فقط (المسودات والمخفي لا يظهران). يصل التحديث إلى الموقع خلال دقيقتين تقريبًا.</p>
${recent.length ? `<h2>آخر التغييرات</h2>${auditTable(recent)}` : ""}`;
  return layout({ title: "النشر", user, path: "/publish", body, flash });
}

/* ---------- edit forms (phase 4a) ---------- */
const STATUS_OPTS = (cur, all = ["published", "draft", "hidden"]) => all.map(k => `<option value="${k}"${k === cur ? " selected" : ""}>${{ published: "منشور", draft: "مسودة", hidden: "مخفي" }[k]}</option>`).join("");
const SEC_OPTS = cur => Object.entries(SEC_AR).map(([k, v]) => `<option value="${k}"${k === cur ? " selected" : ""}>${esc(v)}</option>`).join("");

export async function lessonEditPage(db, user, id, flash) {
  const l = await one(db, "SELECT l.id, l.origin, l.series_id, l.status, l.data, s.title series FROM lessons l LEFT JOIN series s ON s.id = l.series_id WHERE l.id = ?", id);
  if (!l) return null;
  if (l.origin === "catalogue") return catalogueLessonPage(db, user, l, flash);
  const d = JSON.parse(l.data), h = hijriOf(d) || {}, editable = EDITABLE.includes(l.origin);
  const same = d.n == null ? [] : await all(db, "SELECT id FROM lessons WHERE series_id = ? AND n = ? AND id != ? LIMIT 5", l.series_id, d.n, id);
  const info = `<p class="muted">${esc(l.series || "")} · <span class="ltr">${esc(l.id)}</span> · ${esc(d.kind === "video" ? "فيديو" : "صوتي")}${d.src ? ` · <a class="ltr" href="${esc(d.src)}" target="_blank" rel="noopener noreferrer">الملف</a>` : ""} · <a href="/series/${encodeURIComponent(l.series_id)}">رجوع إلى السلسلة</a></p>`;
  if (!editable) return layout({ title: d.title, user, path: "/series", body: `${info}<p class="flash err">هذا الدرس يأتي من مزامنة يوتيوب اليومية، ولا يُعدَّل هنا (قريبًا).</p>`, flash });
  const f = (name, label, val, extra = "") => `<p><label>${label} <input name="${name}" value="${esc(val ?? "")}" ${extra}></label></p>`;
  const body = `${info}${same.length ? `<p class="flash err">تنبيه: الرقم نفسه مستخدم في: ${same.map(x => `<a class="ltr" href="/lessons/${encodeURIComponent(x.id)}">${esc(x.id)}</a>`).join("، ")}</p>` : ""}
<form method="post" action="/lessons/save"><input type="hidden" name="id" value="${esc(l.id)}"><input type="hidden" name="ver" value="${await verOf(l.data)}">
<p><label>العنوان<br><input name="title" class="wide" required maxlength="200" value="${esc(d.title)}"></label></p>
<p><label>الرقم <input name="n" type="number" min="1" max="9999" class="num" value="${esc(d.n ?? "")}"></label> <label>الباب <input name="section" maxlength="120" value="${esc(d.section ?? "")}"></label></p>
<fieldset><legend>التاريخ الهجري (يوم / شهر / سنة) — اتركه فارغًا لحذف التاريخ</legend><span class="hdate"><input name="hd" type="number" min="1" max="30" class="num sm" aria-label="اليوم" value="${esc(h.d ?? "")}"> / <input name="hm" type="number" min="1" max="12" class="num sm" aria-label="الشهر" value="${esc(h.m ?? "")}"> / <input name="hy" type="number" min="1300" max="1600" class="num md" aria-label="السنة" value="${esc(h.y ?? "")}"></span></fieldset>
<p><label>الحالة <select name="status">${STATUS_OPTS(l.status)}</select></label></p>
<p><button>حفظ</button></p></form>`;
  return layout({ title: "تعديل درس", user, path: "/series", body, flash });
}

export async function seriesEditPage(db, user, id, flash) {
  const s = await one(db, "SELECT id, origin, status, data FROM series WHERE id = ?", id);
  if (!s) return null;
  const d = JSON.parse(s.data);
  if (s.origin === "catalogue") return catalogueSeriesPage(db, user, s, flash);
  if (!EDITABLE.includes(s.origin)) return layout({ title: d.title, user, path: "/series", body: `<p class="flash err">لا تُعدَّل هذه السلسلة هنا.</p>`, flash });
  const body = `<p class="muted"><span class="ltr">${esc(s.id)}</span> · <a href="/series/${encodeURIComponent(s.id)}">رجوع إلى السلسلة</a></p>
<form method="post" action="/series/save"><input type="hidden" name="id" value="${esc(s.id)}"><input type="hidden" name="ver" value="${await verOf(s.data)}">
<p><label>العنوان<br><input name="title" class="wide" required maxlength="150" value="${esc(d.title)}"></label></p>
<p><label>القسم <select name="sec">${SEC_OPTS(d.sec)}</select></label> <label>اسم الوحدة <input name="unit" maxlength="20" size="8" value="${esc(d.unit ?? "")}"></label>
<label><input type="checkbox" name="ordered" value="1"${d.ordered ? " checked" : ""}> دروس مرقّمة بالترتيب</label></p>
<p><label>وصف قصير<br><textarea name="description" maxlength="300" rows="2">${esc(d.description ?? "")}</textarea></label></p>
<p><label>الحالة <select name="status">${STATUS_OPTS(s.status)}</select></label> <span class="muted">إخفاء السلسلة يُخفي كل دروسها.</span></p>
<p><button>حفظ</button></p></form>`;
  return layout({ title: "تعديل سلسلة", user, path: "/series", body, flash });
}

export async function bookEditPage(db, user, id, flash) {            // id === null: a new book
  let d = { title: "", group: "", files: [] }, status = "published", ver = "";
  if (id) {
    const b = await one(db, "SELECT id, origin, status, data FROM books WHERE id = ?", id);
    if (!b) return null;
    d = JSON.parse(b.data); status = b.status; ver = await verOf(b.data);
    if (!EDITABLE.includes(b.origin)) return layout({ title: d.title, user, path: "/books", body: `<p class="flash err">لا يُعدَّل هذا الكتاب هنا.</p>`, flash });
  }
  const groups = (await all(db, "SELECT DISTINCT json_extract(data,'$.group') g FROM books WHERE g IS NOT NULL ORDER BY g")).map(r => r.g);
  const rows = (d.files || []).map((f, i) => `<tr><td><input name="file_label" value="${esc(f.label)}" maxlength="60" required aria-label="اسم الملف"></td><td class="ltr"><a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.url.replace(/^https:\/\//, "").slice(0, 70))}</a><input type="hidden" name="file_url" value="${esc(f.url)}"></td><td><label><input type="checkbox" name="file_rm" value="${i}"> حذف</label></td></tr>`).join("");
  const body = `<div id="book-root"><form method="post" action="/books/save"><input type="hidden" name="id" value="${esc(id || "")}"><input type="hidden" name="ver" value="${esc(ver)}">
<p><label>العنوان<br><input name="title" class="wide" required maxlength="200" value="${esc(d.title)}"></label></p>
<p><label>المجموعة <select name="group">${groups.map(g => `<option${g === d.group ? " selected" : ""}>${esc(g)}</option>`).join("")}</select></label> <label>أو مجموعة جديدة <input name="group_new" maxlength="60"></label>
<label>اللغة <select name="lang"><option value="">العربية</option><option value="ur"${d.lang === "ur" ? " selected" : ""}>الأردية</option></select></label></p>
<p><label>ملاحظة (اختياري)<br><input name="note" class="wide" maxlength="300" value="${esc(d.note ?? "")}"></label></p>
<p><label>الحالة <select name="status">${STATUS_OPTS(status)}</select></label></p>
<h2>الملفات</h2>
<div class="scroll" tabindex="0" role="region" aria-label="ملفات الكتاب"><table><thead><tr><th>الاسم</th><th>الرابط</th><th>حذف</th></tr></thead><tbody id="book-files">${rows}</tbody></table></div>
<p><label>إضافة ملف (pdf أو epub): <input type="file" id="book-file" accept=".pdf,.epub,application/pdf,application/epub+zip"></label></p>
<p><label>أو رابط https خارجي: <input id="ext-url" type="url" dir="ltr" size="40"></label> <button type="button" class="secondary" id="ext-add">إضافة الرابط</button></p>
<p id="book-msg" class="flash ok" role="status" hidden></p>
<p><button>حفظ</button> <a href="/books">إلغاء</a></p></form></div>`;
  return layout({ title: id ? "تعديل كتاب" : "كتاب جديد", user, path: "/books", body, flash, scripts: true });
}

/* ---------- YouTube items: the same forms, saved as patches on top of the daily sync ---------- */
const PATCH_NOTE = `<p class="muted">هذا من يوتيوب: تعديلاتك تُحفظ كتصحيحات فوق المزامنة اليومية ولا تُمحى بها، وما لا تعدّله يبقى يتبع المزامنة. زر التراجع (يظهر بعد أول تعديل) يعيده كما تنتجه المزامنة.</p>`;
const resetForm = (action, id) => `<form method="post" action="${action}" class="inline"><input type="hidden" name="id" value="${esc(id)}"><button class="secondary">التراجع عن تعديلاتي</button></form>`;

async function catalogueLessonPage(db, user, l, flash) {
  const base = JSON.parse(l.data), patch = await getPatch(db, "lesson", l.id), eff = withPatch(base, patch), h = hijriOf(eff) || {};
  const all_ = await all(db, `SELECT ${SERIES_EFF} FROM ${SERIES_FROM} ORDER BY s.sec, s.origin, s.pos`);
  const cur = eff.series, patched = Object.keys(patch).length > 0;
  const info = `<p class="muted"><span class="ltr">${esc(l.id)}</span> · فيديو · <a class="ltr" href="https://www.youtube.com/watch?v=${encodeURIComponent(l.id)}" target="_blank" rel="noopener noreferrer">يوتيوب</a> · <a href="/series/${encodeURIComponent(cur)}">رجوع إلى السلسلة</a>${patched ? ` · <span class="tag tag-draft">معدَّل</span>` : ""}</p>`;
  const body = `${info}${PATCH_NOTE}
<form method="post" action="/lessons/save"><input type="hidden" name="id" value="${esc(l.id)}"><input type="hidden" name="ver" value="${await catVer(l, patch)}">
<p><label>العنوان<br><input name="title" class="wide" required maxlength="200" value="${esc(eff.title)}"></label></p>
<p><label>السلسلة <select name="series">${all_.map(x => `<option value="${esc(x.id)}"${x.id === cur ? " selected" : ""}>${esc(x.title)}</option>`).join("")}</select></label></p>
<p><label>الرقم <input name="n" type="number" min="1" max="9999" class="num" value="${esc(eff.n ?? "")}"></label> <label>الباب <input name="section" maxlength="120" value="${esc(eff.section ?? "")}"></label></p>
<fieldset><legend>التاريخ الهجري (يوم / شهر / سنة) — الأصل: تاريخ رفع الفيديو</legend><span class="hdate"><input name="hd" type="number" min="1" max="30" class="num sm" aria-label="اليوم" value="${esc(h.d ?? "")}"> / <input name="hm" type="number" min="1" max="12" class="num sm" aria-label="الشهر" value="${esc(h.m ?? "")}"> / <input name="hy" type="number" min="1300" max="1600" class="num md" aria-label="السنة" value="${esc(h.y ?? "")}"></span></fieldset>
<p><label>الحالة <select name="status">${STATUS_OPTS(patch.hidden ? "hidden" : "published", ["published", "hidden"])}</select></label></p>
<p><button>حفظ</button></p></form>${patched ? resetForm("/lessons/reset", l.id) : ""}`;
  return layout({ title: "تعديل درس (يوتيوب)", user, path: "/series", body, flash });
}

async function catalogueSeriesPage(db, user, s, flash) {
  const base = JSON.parse(s.data), patch = await getPatch(db, "series", s.id), eff = withPatch(base, patch), patched = Object.keys(patch).length > 0;
  const body = `<p class="muted"><span class="ltr">${esc(s.id)}</span> · <a href="/series/${encodeURIComponent(s.id)}">رجوع إلى السلسلة</a>${patched ? ` · <span class="tag tag-draft">معدَّل</span>` : ""}</p>${PATCH_NOTE}
<form method="post" action="/series/save"><input type="hidden" name="id" value="${esc(s.id)}"><input type="hidden" name="ver" value="${await catVer(s, patch)}">
<p><label>العنوان<br><input name="title" class="wide" required maxlength="150" value="${esc(eff.title)}"></label></p>
<p><label>القسم <select name="sec">${SEC_OPTS(eff.sec)}</select></label></p>
<p><label>وصف قصير<br><textarea name="description" maxlength="300" rows="2">${esc(eff.description ?? "")}</textarea></label></p>
<p><label>الحالة <select name="status">${STATUS_OPTS(patch.hidden ? "hidden" : "published", ["published", "hidden"])}</select></label> <span class="muted">إخفاء السلسلة يُخفي كل دروسها.</span></p>
<p><button>حفظ</button></p></form>${patched ? resetForm("/series/reset", s.id) : ""}`;
  return layout({ title: "تعديل سلسلة (يوتيوب)", user, path: "/series", body, flash });
}

/* ---------- arrange the lessons of a series (phase 4c) ---------- */
export async function orderPage(db, user, id, flash) {
  const s = await one(db, `SELECT ${SERIES_EFF} FROM ${SERIES_FROM} WHERE s.id = ?`, id);
  if (!s) return null;
  const st = await orderState(db, id);
  const btn = (act, label, text) => `<button type="button" class="mv secondary" data-act="${act}" aria-label="${label}" title="${label}">${text}</button>`;
  const rows = st.list.map(r => `<li data-id="${esc(r.id)}" data-n="${esc(r.n ?? "")}" data-date="${esc(r.date ?? "")}" data-title="${esc(r.title)}" data-section="${esc(r.section ?? "")}"${st.fresh.has(r.id) ? ' data-new="1"' : ""}>
<button type="button" class="grip secondary" aria-label="نقل: ${esc(r.title)}. اضغط مسافة للالتقاط ثم الأسهم للتحريك ثم مسافة للإفلات" aria-pressed="false">⋮⋮</button>
<label class="pick"><input type="checkbox" aria-label="تحديد: ${esc(r.title)}"></label><span class="pos" aria-hidden="true"></span>
<span class="main"><span class="t">${esc(r.title)}</span><span class="meta muted">${r.n != null ? `رقم ${num(r.n)}` : "بلا رقم"}${r.section ? ` · ${esc(r.section)}` : ""} · ${esc(hijri(r.hd, r.date))} ${statusTag(r.status)}${st.fresh.has(r.id) ? ` <span class="tag tag-draft newtag">جديد: لم يُرتَّب بعد</span>` : ""}</span></span>
<span class="acts">${btn("top", "إلى الأول", "⤒")}${btn("up", "خطوة للأعلى", "▲")}${btn("down", "خطوة للأسفل", "▼")}${btn("bottom", "إلى الآخر", "⤓")}</span></li>`).join("");
  const body = `<p class="muted"><a href="/series/${encodeURIComponent(id)}">رجوع إلى السلسلة</a> · ${num(st.list.length)} درس · ${st.manual ? "ترتيب يدوي محفوظ" : "الترتيب التلقائي (كما يراه الزائر الآن)"}</p>
<p class="muted">اسحب المقبض ⋮⋮ (أو اضغط مسافة عليه ثم الأسهم)، أو استخدم أزرار الأسهم. الترتيب هنا هو ما يراه الزائر في الصفحة وفي زرّي «السابق / التالي»؛ أرقام الدروس وعناوينها لا تتغير.</p>
${st.fresh.size ? `<p class="flash err">${num(st.fresh.size)} درس جديد لم يُرتَّب بعد؛ وُضع في آخر القائمة (مظلَّل).</p>` : ""}
<div id="order-root" data-series="${esc(id)}" data-ver="${esc(st.ver)}" data-manual="${st.manual ? 1 : 0}">
<div class="ord-bar">
<label>بحث <input id="ord-q" type="search" maxlength="60" placeholder="عنوان أو باب"></label>
<label>ترتيب جاهز <select id="ord-sort"><option value="">— اختر —</option><option value="n">بحسب الرقم</option><option value="date-asc">التاريخ: الأقدم أولًا</option><option value="date-desc">التاريخ: الأحدث أولًا</option><option value="title">بحسب العنوان</option><option value="reverse">عكس القائمة</option></select></label>
<button type="button" class="secondary" id="ord-undo" disabled>تراجع</button>
</div>
<div class="ord-bar" role="group" aria-label="نقل المحدَّد">
<span id="ord-sel" class="muted">لا شيء محدد</span>
<button type="button" class="secondary" data-bulk="top" disabled>المحدد إلى الأول</button>
<button type="button" class="secondary" data-bulk="bottom" disabled>المحدد إلى الآخر</button>
<label>إلى الموضع <input id="ord-to" type="number" min="1" max="${st.list.length}" class="num" disabled></label>
<button type="button" class="secondary" data-bulk="to" disabled>نقل</button>
</div>
<ol id="ord-list" class="sortable">${rows}</ol>
<p class="ord-save"><button type="button" id="ord-save" disabled>حفظ الترتيب</button> <span id="ord-dirty" class="muted"></span>${st.manual ? ` <button type="button" class="secondary" id="ord-reset">العودة إلى الترتيب التلقائي</button>` : ""}</p>
<p id="ord-msg" class="flash ok" role="status" hidden></p>
<div id="ord-live" class="sr" aria-live="polite"></div>
</div>`;
  return layout({ title: `ترتيب الدروس — ${s.title}`, user, path: "/series", body, flash, scripts: true });
}
