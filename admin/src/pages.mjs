import { esc, layout, hijri, statusTag, num, stamp } from "./html.mjs";
import { ROLES, ROLE_AR, can } from "./roles.mjs";
import { NEW_SERIES_SECTIONS, EDITABLE, verOf, hijriOf } from "./content.mjs";
import { pendingChanges } from "./publish.mjs";

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
  const body = `${can(user.role, "content.edit") ? `<p><a href="/series/new">+ سلسلة جديدة</a> · <a href="/upload">رفع دروس</a></p>` : ""}<div class="scroll" tabindex="0" role="region" aria-label="جدول"><table><thead><tr><th>السلسلة</th><th>القسم</th><th>الدروس</th><th>الحالة</th></tr></thead><tbody>${
    rows.map(r => `<tr><td><a href="/series/${encodeURIComponent(r.id)}">${esc(r.title)}</a></td><td>${esc(SEC_AR[r.sec] || r.sec || "—")}</td><td>${num(r.c)}</td><td>${statusTag(r.status)}</td></tr>`).join("")}</tbody></table></div>`;
  return layout({ title: "السلاسل", user, path: "/series", body });
}

const statusForm = (r, series, page) => `<form class="inline" method="post" action="/lessons/status"><input type="hidden" name="id" value="${esc(r.id)}"><input type="hidden" name="series" value="${esc(series)}"><input type="hidden" name="page" value="${page}">${
  r.status !== "published" ? `<button name="status" value="published">نشر</button>` : ""}${r.status !== "hidden" ? `<button class="secondary" name="status" value="hidden">إخفاء</button>` : ""}</form>`;

export async function seriesDetail(db, user, id, pageNo, flash) {
  const canEdit = can(user.role, "content.hide");
  const s = await one(db, "SELECT id, title, sec, status, origin FROM series WHERE id = ?", id);
  if (!s) return null;
  const total = (await one(db, "SELECT COUNT(*) c FROM lessons WHERE series_id = ?", id)).c;
  const pages = Math.max(1, Math.ceil(total / PER)), p = Math.min(Math.max(1, pageNo), pages);
  const rows = await all(db, `SELECT id, n, section, status, json_extract(data,'$.title') title, json_extract(data,'$.hd') hd, json_extract(data,'$.date') date
    FROM lessons WHERE series_id = ? ORDER BY (n IS NULL), n, pos LIMIT ? OFFSET ?`, id, PER, (p - 1) * PER);
  const pager = pages > 1 ? `<div class="pager">${p > 1 ? `<a href="?page=${p - 1}">السابق</a>` : ""}<span>صفحة ${num(p)} من ${num(pages)}</span>${p < pages ? `<a href="?page=${p + 1}">التالي</a>` : ""}</div>` : "";
  const body = `<p class="muted">${esc(SEC_AR[s.sec] || s.sec || "")} · ${num(total)} درس · ${statusTag(s.status)} · <a href="/series">كل السلاسل</a>${can(user.role, "content.edit") ? ` · <a href="/upload?series=${encodeURIComponent(s.id)}">رفع دروس إلى هذه السلسلة</a>${EDITABLE.includes(s.origin) ? ` · <a href="/series/${encodeURIComponent(s.id)}/edit">تعديل السلسلة</a>` : ""}` : ""}</p><div class="scroll" tabindex="0" role="region" aria-label="جدول"><table><thead><tr><th>الرقم</th><th>العنوان</th><th>الباب</th><th>التاريخ الهجري</th><th>الحالة</th></tr></thead><tbody>${
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
  const recent = await all(db, "SELECT at, actor, action, entity, entity_id FROM audit_log WHERE action LIKE 'lesson.%' OR action LIKE 'series.%' OR action LIKE 'book.%' ORDER BY id DESC LIMIT 10");
  const body = `<p>${count ? `<b>${num(count)}</b> تغيير لم يُنشر بعد.` : "لا توجد تغييرات جديدة منذ آخر نشر."} ${last ? `<span class="muted">آخر نشر: ${stamp(last.at)} (${esc(last.actor)})</span>` : ""}</p>
<form method="post" action="/publish"><button>نشر الآن</button></form>
<p class="muted">يُنشر المنشور فقط (المسودات والمخفي لا يظهران). يصل التحديث إلى الموقع خلال دقيقتين تقريبًا.</p>
${recent.length ? `<h2>آخر التغييرات</h2>${auditTable(recent)}` : ""}`;
  return layout({ title: "النشر", user, path: "/publish", body, flash });
}

/* ---- usage counters (anonymous, written by the public site) ---- */
export async function analyticsPage(db, user) {
  const since = d => `day >= date('now', '+3 hours', '-${d} days')`;
  const [tot, daily, top, bySeries] = await Promise.all([
    one(db, `SELECT COALESCE(SUM(CASE WHEN event='play' AND ${since(7)} THEN n END),0) p7, COALESCE(SUM(CASE WHEN event='play' THEN n END),0) p30,
      COALESCE(SUM(CASE WHEN event='download' THEN n END),0) d30, COALESCE(SUM(CASE WHEN event='watch' THEN n END),0) w30 FROM stats_daily WHERE ${since(30)}`),
    all(db, `SELECT day, SUM(CASE WHEN event='play' THEN n END) p, SUM(CASE WHEN event='download' THEN n END) d, SUM(CASE WHEN event='watch' THEN n END) w FROM stats_daily WHERE ${since(14)} GROUP BY day ORDER BY day DESC`),
    all(db, `SELECT s.lesson_id id, SUM(s.n) c, json_extract(l.data,'$.title') title, ser.title series, l.series_id sid FROM stats_daily s JOIN lessons l ON l.id = s.lesson_id LEFT JOIN series ser ON ser.id = l.series_id
      WHERE s.event = 'play' AND ${since(30).replace("day", "s.day")} GROUP BY s.lesson_id ORDER BY c DESC LIMIT 25`),
    all(db, `SELECT ser.id, ser.title, SUM(CASE WHEN s.event='play' THEN s.n END) p, SUM(CASE WHEN s.event='download' THEN s.n END) d, SUM(CASE WHEN s.event='watch' THEN s.n END) w
      FROM stats_daily s JOIN lessons l ON l.id = s.lesson_id JOIN series ser ON ser.id = l.series_id WHERE ${since(30).replace("day", "s.day")} GROUP BY ser.id ORDER BY (COALESCE(SUM(CASE WHEN s.event='play' THEN s.n END),0) + COALESCE(SUM(CASE WHEN s.event='watch' THEN s.n END),0)) DESC LIMIT 25`),
  ]);
  const cards = [[tot.p7, "استماع (٧ أيام)"], [tot.p30, "استماع (٣٠ يومًا)"], [tot.d30, "تحميل (٣٠ يومًا)"], [tot.w30, "مشاهدة فيديو (٣٠ يومًا)"]].map(([n, l]) => `<div class="card"><b>${num(n)}</b><span>${l}</span></div>`).join("");
  const T = (head, rows) => `<div class="scroll" tabindex="0" role="region" aria-label="${head[0]}"><table><thead><tr>${head[1].map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows || `<tr><td colspan="${head[1].length}" class="muted">لا بيانات بعد.</td></tr>`}</tbody></table></div>`;
  const body = `<div class="cards">${cards}</div>
<p class="muted">أعداد مجهولة الهوية: لا تُحفظ أي بيانات عن الزائر (يُرسل رقم الدرس ونوع الحدث فقط). «استماع» = ٣٠ ثانية استماع فعلية في الصفحة الواحدة، «مشاهدة» = ضغط زر تشغيل الفيديو.</p>
<h2>أكثر الدروس استماعًا (٣٠ يومًا)</h2>${T(["أكثر الدروس", ["الدرس", "السلسلة", "الاستماع"]], top.map(r => `<tr><td>${esc(r.title)}</td><td><a href="/series/${encodeURIComponent(r.sid)}">${esc(r.series || "")}</a></td><td>${num(r.c)}</td></tr>`).join(""))}
<h2>حسب السلسلة (٣٠ يومًا)</h2>${T(["حسب السلسلة", ["السلسلة", "استماع", "تحميل", "مشاهدة"]], bySeries.map(r => `<tr><td><a href="/series/${encodeURIComponent(r.id)}">${esc(r.title)}</a></td><td>${num(r.p)}</td><td>${num(r.d)}</td><td>${num(r.w)}</td></tr>`).join(""))}
<h2>آخر ١٤ يومًا</h2>${T(["الأيام", ["اليوم", "استماع", "تحميل", "مشاهدة"]], daily.map(r => `<tr><td>${esc(hijri(null, r.day))}</td><td>${num(r.p)}</td><td>${num(r.d)}</td><td>${num(r.w)}</td></tr>`).join(""))}`;
  return layout({ title: "الإحصاءات", user, path: "/analytics", body });
}

/* ---------- edit forms (phase 4a) ---------- */
const STATUS_OPTS = (cur, all = ["published", "draft", "hidden"]) => all.map(k => `<option value="${k}"${k === cur ? " selected" : ""}>${{ published: "منشور", draft: "مسودة", hidden: "مخفي" }[k]}</option>`).join("");
const SEC_OPTS = cur => Object.entries(SEC_AR).map(([k, v]) => `<option value="${k}"${k === cur ? " selected" : ""}>${esc(v)}</option>`).join("");

export async function lessonEditPage(db, user, id, flash) {
  const l = await one(db, "SELECT l.id, l.origin, l.series_id, l.status, l.data, s.title series FROM lessons l LEFT JOIN series s ON s.id = l.series_id WHERE l.id = ?", id);
  if (!l) return null;
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
  if (!EDITABLE.includes(s.origin)) return layout({ title: d.title, user, path: "/series", body: `<p class="flash err">هذه السلسلة تأتي من مزامنة يوتيوب ولا تُعدَّل هنا (قريبًا).</p>`, flash });
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
