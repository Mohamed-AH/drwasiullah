import { esc, layout, hijri, stamp } from "./html.mjs";
import { utcToMakkahInput, makkahToday, nowUtc } from "./timeutil.mjs";
import { WEEKDAYS, loadSchedule, scheduleVer } from "./live.mjs";

const all = (db, sql, ...a) => db.prepare(sql).bind(...a).all().then(r => r.results);
const KIND_AR = { info: "معلومة", notice: "تنبيه", urgent: "عاجل" };
const tag = (text, cls) => `<span class="tag tag-${cls}">${esc(text)}</span>`;
const when = s => s ? `${esc(hijri(null, String(s).slice(0, 10)))} ${esc(utcToMakkahInput(s).slice(11))}` : "—";
const kindSelect = cur => `<select name="kind">${Object.entries(KIND_AR).map(([k, v]) => `<option value="${k}"${k === cur ? " selected" : ""}>${v}</option>`).join("")}</select>`;
const LIVE_NOTE = `<p class="muted">يظهر التغيير في الموقع خلال دقيقة تقريبًا (لا يحتاج «النشر»). الأوقات بتوقيت مكة المكرمة.</p>`;

function bannerState(b) {
  const now = nowUtc();
  if (!b.active) return tag("متوقف", "hidden");
  if (b.starts_at && b.starts_at > now) return tag("مجدول", "draft");
  if (b.ends_at && b.ends_at <= now) return tag("منتهٍ", "hidden");
  return tag("نشط الآن", "published");
}
const bannerForm = (b = {}) => `<form method="post" action="/banners/save"><input type="hidden" name="id" value="${esc(b.id ?? "")}">
<p><label>النص (حتى ٢٠٠ حرف)<br><input name="text" class="wide" required maxlength="200" value="${esc(b.text ?? "")}"></label></p>
<p><label>النوع ${kindSelect(b.kind || "info")}</label> <label>رابط https (اختياري) <input name="link" type="url" dir="ltr" size="36" value="${esc(b.link ?? "")}"></label></p>
<p><label>يبدأ <input type="datetime-local" name="starts" value="${esc(utcToMakkahInput(b.starts_at))}"></label> <label>ينتهي <input type="datetime-local" name="ends" value="${esc(utcToMakkahInput(b.ends_at))}"></label> <span class="muted">فارغ = فورًا / حتى الإيقاف</span></p>
<p><label><input type="checkbox" name="dismissible" value="1"${b.id == null || b.dismissible ? " checked" : ""}> يمكن للزائر إغلاقه</label> <label><input type="checkbox" name="active" value="1"${b.id == null || b.active ? " checked" : ""}> مفعّل</label></p>
<p><button>حفظ</button></p></form>`;

export async function bannersPage(db, user, flash) {
  const rows = await all(db, "SELECT * FROM banners ORDER BY id DESC LIMIT 100");
  const list = rows.map(b => `<tr><td>${esc(b.text)}${b.link ? ` <span class="ltr muted">${esc(b.link)}</span>` : ""}</td><td>${esc(KIND_AR[b.kind])}</td><td>${bannerState(b)}</td><td>${when(b.starts_at)} ← ${when(b.ends_at)}</td>
<td><form class="inline" method="post" action="/banners/toggle"><input type="hidden" name="id" value="${b.id}"><button class="secondary" name="active" value="${b.active ? 0 : 1}">${b.active ? "إيقاف" : "تفعيل"}</button></form> <a href="/banners/${b.id}">تعديل</a></td></tr>`).join("");
  const body = `${LIVE_NOTE}<div class="scroll" tabindex="0" role="region" aria-label="البانرات"><table><thead><tr><th>النص</th><th>النوع</th><th>الحالة</th><th>من ← إلى (مكة)</th><th></th></tr></thead><tbody>${list || '<tr><td colspan="5" class="muted">لا بانرات.</td></tr>'}</tbody></table></div>
<h2>بانر جديد</h2>${bannerForm()}<p class="muted">يظهر شريطًا أعلى كل صفحات الموقع (حتى بانرين معًا).</p>`;
  return layout({ title: "البانرات", user, path: "/banners", body, flash });
}
export async function bannerEditPage(db, user, id, flash) {
  const b = await db.prepare("SELECT * FROM banners WHERE id = ?").bind(id).first();
  if (!b) return null;
  const body = `<p><a href="/banners">رجوع</a></p>${bannerForm(b)}<form method="post" action="/banners/delete" class="inline"><input type="hidden" name="id" value="${b.id}"><button class="secondary">حذف البانر</button></form>`;
  return layout({ title: "تعديل بانر", user, path: "/banners", body, flash });
}

const annForm = (a = {}) => `<form method="post" action="/announcements/save"><input type="hidden" name="id" value="${esc(a.id ?? "")}">
<p><label>العنوان<br><input name="title" class="wide" required maxlength="150" value="${esc(a.title ?? "")}"></label></p>
<p><label>النص (نص عادي؛ الأسطر تُحفظ)<br><textarea name="body" required maxlength="2000" rows="6">${esc(a.body ?? "")}</textarea></label></p>
<p><label>رابط https (اختياري) <input name="link" type="url" dir="ltr" size="36" value="${esc(a.link ?? "")}"></label> <label>نص الزر <input name="link_label" maxlength="40" value="${esc(a.link_label ?? "")}"></label></p>
<p><label>الحالة <select name="status"><option value="published"${a.status !== "draft" ? " selected" : ""}>منشور</option><option value="draft"${a.status === "draft" ? " selected" : ""}>مسودة</option></select></label>
<label>ينشر في (اختياري) <input type="datetime-local" name="publish_at" value="${esc(utcToMakkahInput(a.publish_at))}"></label> <label><input type="checkbox" name="pinned" value="1"${a.pinned ? " checked" : ""}> مثبّت في الأعلى</label></p>
<p><button>حفظ</button></p></form>`;

export async function announcementsPage(db, user, flash) {
  const rows = await all(db, "SELECT id, title, status, pinned, publish_at, created_at FROM announcements ORDER BY pinned DESC, COALESCE(publish_at, created_at) DESC LIMIT 100");
  const now = nowUtc();
  const list = rows.map(a => `<tr><td><a href="/announcements/${a.id}">${esc(a.title)}</a>${a.pinned ? ` ${tag("مثبّت", "draft")}` : ""}</td><td>${a.status === "draft" ? tag("مسودة", "hidden") : a.publish_at && a.publish_at > now ? tag("مجدول", "draft") : tag("منشور", "published")}</td><td>${when(a.publish_at || a.created_at)}</td></tr>`).join("");
  const body = `${LIVE_NOTE}<div class="scroll" tabindex="0" role="region" aria-label="الإعلانات"><table><thead><tr><th>العنوان</th><th>الحالة</th><th>التاريخ (مكة)</th></tr></thead><tbody>${list || '<tr><td colspan="3" class="muted">لا إعلانات.</td></tr>'}</tbody></table></div>
<h2>إعلان جديد</h2>${annForm()}<p class="muted">يظهر آخر ثلاثة إعلانات في الصفحة الرئيسية، وكلها في صفحة «الإعلانات».</p>`;
  return layout({ title: "الإعلانات", user, path: "/announcements", body, flash });
}
export async function announcementEditPage(db, user, id, flash) {
  const a = await db.prepare("SELECT * FROM announcements WHERE id = ?").bind(id).first();
  if (!a) return null;
  const body = `<p><a href="/announcements">رجوع</a></p>${annForm(a)}<form method="post" action="/announcements/delete" class="inline"><input type="hidden" name="id" value="${a.id}"><button class="secondary">حذف الإعلان</button></form>`;
  return layout({ title: "تعديل إعلان", user, path: "/announcements", body, flash });
}

export async function schedulePageAdmin(db, user, flash) {
  const { doc } = await loadSchedule(db), ver = await scheduleVer(doc), today = makkahToday();
  const series = await all(db, "SELECT id, title FROM series ORDER BY sec, origin, pos");
  const notices = await all(db, "SELECT id, slot, day, kind, note FROM schedule_notices WHERE day >= ? ORDER BY day, id", today);
  const slotName = id => { const s = doc.slots.find(x => x.id === id); return s ? `${s.title} (${s.days.join("، ")})` : id; };
  const dayChecks = (cur = []) => WEEKDAYS.map(d => `<label><input type="checkbox" name="days" value="${esc(d)}"${cur.includes(d) ? " checked" : ""}> ${esc(d)}</label>`).join(" ");
  const form = s => `<form method="post" action="/schedule/slot"><input type="hidden" name="ver" value="${ver}"><input type="hidden" name="slot" value="${esc(s.id ?? "")}">
<p>${dayChecks(s.days)}</p>
<p><label>العنوان <input name="title" required maxlength="120" value="${esc(s.title ?? "")}"></label> <label>الوقت (نص حر) <input name="time" maxlength="60" value="${esc(s.time ?? "")}"></label> <label>الترتيب في اليوم <input name="order" type="number" min="0" max="99" class="num" value="${esc(s.order ?? 50)}"></label></p>
<p><label>السلسلة (رابط اختياري) <select name="series"><option value="">—</option>${series.map(x => `<option value="${esc(x.id)}"${x.id === s.series ? " selected" : ""}>${esc(x.title)}</option>`).join("")}</select></label>
<label>اللغة <select name="lang"><option value="ar">العربية</option><option value="ur"${s.lang === "ur" ? " selected" : ""}>الأردية</option></select></label> <label>ملاحظة <input name="note" maxlength="160" value="${esc(s.note ?? "")}"></label>
<label><input type="checkbox" name="hidden" value="1"${s.pending ? " checked" : ""}> مخفي (غير مؤكد)</label></p>
<p><button>حفظ</button></p></form>`;
  const slots = doc.slots.map(s => `<details><summary>${esc(s.title)} — ${esc(s.days.join("، "))} — ${esc(s.time || "")}${s.pending ? ` ${tag("مخفي", "hidden")}` : ""}</summary>${form(s)}
<form method="post" action="/schedule/slot-delete" class="inline"><input type="hidden" name="ver" value="${ver}"><input type="hidden" name="slot" value="${esc(s.id)}"><button class="secondary">حذف هذا الموعد</button></form></details>`).join("");
  const nlist = notices.map(n => `<tr><td>${esc(hijri(null, n.day))}</td><td>${esc(slotName(n.slot))}</td><td>${n.kind === "cancelled" ? tag("ملغى", "hidden") : tag("تغيير", "draft")} ${esc(n.note || "")}</td><td><form class="inline" method="post" action="/notices/delete"><input type="hidden" name="id" value="${n.id}"><button class="secondary">حذف</button></form></td></tr>`).join("");
  const live = doc.live || {};
  const body = `<p class="muted">تعديل المواعيد الأسبوعية يظهر بعد «النشر». أما «إشعار اليوم» أدناه فيظهر في الموقع خلال دقيقة.</p>
<h2>إشعار اليوم (إلغاء أو تغيير موعد)</h2>
${doc.slots.length ? `<form method="post" action="/notices/add" class="inline"><label>الموعد <select name="slot">${doc.slots.map(s => `<option value="${esc(s.id)}">${esc(s.title)} (${esc(s.days.join("، "))})</option>`).join("")}</select></label>
<label>التاريخ <input type="date" name="day" value="${today}" min="${today}" required></label> <label>النوع <select name="kind"><option value="cancelled">ملغى</option><option value="changed">تغيير</option></select></label> <label>ملاحظة <input name="note" maxlength="160" placeholder="مثال: لعذر طارئ"></label> <button>إضافة الإشعار</button></form>` : '<p class="muted">لا مواعيد بعد.</p>'}
${notices.length ? `<div class="scroll" tabindex="0" role="region" aria-label="الإشعارات"><table><thead><tr><th>اليوم</th><th>الموعد</th><th>الإشعار</th><th></th></tr></thead><tbody>${nlist}</tbody></table></div>` : ""}
<h2>المواعيد الأسبوعية</h2>${slots || '<p class="muted">لا مواعيد.</p>'}
<h2>موعد جديد</h2><details open><summary>إضافة</summary>${form({ order: 50 })}</details>
<h2>البث المباشر وملاحظة الجدول</h2>
<form method="post" action="/schedule/meta"><input type="hidden" name="ver" value="${ver}">
<p><label>ملاحظة تحت الجدول<br><input name="note" class="wide" maxlength="300" value="${esc(doc.note ?? "")}"></label></p>
<p><label>رابط البث (mixlr.com، اتركه فارغًا لإخفاء الزر) <input name="live_url" type="url" dir="ltr" size="36" value="${esc(live.url ?? "")}"></label></p>
<p><label>عنوان الزر <input name="live_label" maxlength="40" value="${esc(live.label ?? "")}"></label> <label>سطر توضيحي <input name="live_sub" maxlength="120" size="40" value="${esc(live.sub ?? "")}"></label></p>
<p><button>حفظ</button></p></form>`;
  return layout({ title: "جدول الدروس", user, path: "/schedule", body, flash });
}
