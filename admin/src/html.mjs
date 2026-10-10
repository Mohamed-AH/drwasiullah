import { ROLE_AR, can } from "./roles.mjs";

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const HIJRI = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-arab", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh" });
const AR_DIGITS = s => String(s).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]);
/* Hijri only: the source's own hd ("1436-2-7") when there is one, else the Gregorian date converted. */
export function hijri(hd, date) {
  if (hd) { const m = /^(\d{3,4})-(\d{1,2})-(\d{1,2})$/.exec(hd); if (m) return AR_DIGITS(`${m[3]}/${m[2]}/${m[1]}`) + " هـ"; }
  if (date) { const d = new Date(date + "T12:00:00+03:00"); if (!isNaN(d)) return HIJRI.format(d); }
  return "—";
}
/* audit timestamps are stored as UTC "YYYY-MM-DD HH:MM:SS"; shown as Hijri date + Makkah time */
export const stamp = s => {
  const d = new Date(String(s).replace(" ", "T") + "Z");
  return isNaN(d) ? esc(s) : esc(HIJRI.format(d) + " · " + AR_DIGITS(d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" })));
};

const STATUS_AR = { published: "منشور", draft: "مسودة", hidden: "مخفي" };
export const statusTag = s => `<span class="tag tag-${esc(s)}">${esc(STATUS_AR[s] || s)}</span>`;
export const num = n => AR_DIGITS(Number(n || 0).toLocaleString("en-US"));

const NAV = [
  ["/", "الرئيسية", "view"],
  ["/series", "السلاسل", "view"],
  ["/books", "الكتب", "view"],
  ["/upload", "رفع درس", "content.edit"],
  ["/publish", "النشر", "content.publish"],
  ["/users", "المستخدمون", "users.manage"],
  ["/audit", "السجل", "audit.view"],
];

export const FLASH = {
  added: "تمت إضافة المستخدم.", updated: "تم حفظ التعديل.",
  series_added: "تم إنشاء السلسلة. يمكنك الآن رفع دروسها.", series_exists: "معرّف السلسلة مستخدم من قبل.", status_saved: "تم تغيير الحالة.", unknown_lesson: "الدرس غير موجود.",
  requested: "تم طلب النشر. يظهر التحديث في الموقع خلال دقيقتين تقريبًا.", gh_missing: "النشر غير مهيّأ بعد (راجع docs/admin-setup.md).", gh_failed: "تعذّر طلب النشر من GitHub. حاول لاحقًا أو راجع المدير.", wait: "تم طلب النشر قبل لحظات؛ انتظر دقيقة.",
  invalid: "البيانات غير صحيحة.", exists: "هذا البريد مسجّل من قبل.", last_admin: "لا يمكن ترك النظام بلا مدير فعّال.", unknown: "المستخدم غير موجود.",
};

export function layout({ title, user, path, body, flash, scripts }) {
  const nav = NAV.filter(([, , perm]) => can(user.role, perm))
    .map(([href, label]) => `<a href="${href}"${(href === "/" ? path === "/" : path.startsWith(href)) ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  const f = flash && FLASH[flash.code] ? `<p class="flash ${flash.kind === "ok" ? "ok" : "err"}" role="status">${esc(FLASH[flash.code])}</p>` : "";
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)} — لوحة التحرير</title><link rel="stylesheet" href="/admin.css"></head><body>
<header class="top"><div class="brand">لوحة التحرير <small>موقع الشيخ وصي الله بن محمد عباس</small></div>
<nav aria-label="التنقل">${nav}</nav>
<div class="who"><span dir="ltr">${esc(user.email)}</span> · ${esc(ROLE_AR[user.role] || user.role)} · <a href="/cdn-cgi/access/logout">خروج</a></div></header>
<main><h1>${esc(title)}</h1>${f}${body}</main>${scripts ? `<script src="/admin.js" defer></script>` : ""}</body></html>`;
}

export const page = (html, status = 200) => new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
export const message = (title, text, status) => page(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><link rel="stylesheet" href="/admin.css"></head><body><main class="narrow"><h1>${esc(title)}</h1><p>${esc(text)}</p></main></body></html>`, status);

export const CSS = `
:root{--paper:#f6efe0;--card:#fffaf0;--ink:#2a2118;--ink2:#5b4d3c;--line:#d9ccb2;--red:#8c2b22;--gold:#7a5a14;--ok:#2f6b3a;--bad:#9b2c2c;--onred:#fff}
@media (prefers-color-scheme:dark){:root{--paper:#17130f;--card:#211b15;--ink:#f1e8d6;--ink2:#c2b69f;--line:#3a3025;--red:#e07a6d;--gold:#d6aa4d;--ok:#7fc58b;--bad:#f08a8a;--onred:#1a120d}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.7 "Noto Naskh Arabic","Segoe UI",Tahoma,sans-serif}
a{color:var(--red)}h1{font-size:1.5rem;margin:.2rem 0 1rem}h2{font-size:1.15rem;margin:1.6rem 0 .6rem}
.top{display:flex;flex-wrap:wrap;gap:.6rem 1.4rem;align-items:center;padding:.7rem 1rem;background:var(--card);border-bottom:2px solid var(--line)}
.brand{font-weight:700}.brand small{display:block;font-weight:400;color:var(--ink2);font-size:.8rem}
nav{display:flex;flex-wrap:wrap;gap:.2rem .3rem;flex:1 1 100%;order:3}@media (min-width:900px){nav{flex:1;order:0}}nav a{padding:.25rem .8rem;border-radius:6px;text-decoration:none;color:var(--ink)}nav a[aria-current]{background:var(--red);color:var(--onred)}
.who{font-size:.85rem;color:var(--ink2)}main{max-width:1100px;margin:0 auto;padding:1rem}main.narrow{max-width:560px;margin-top:4rem}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.8rem}.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:.8rem 1rem}
.card b{display:block;font-size:1.7rem;color:var(--red)}.card span{color:var(--ink2);font-size:.9rem}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line)}
th,td{padding:.45rem .7rem;text-align:start;border-bottom:1px solid var(--line);vertical-align:top}th{background:var(--paper);font-size:.85rem;color:var(--ink2)}
.scroll{overflow-x:auto}.tag{font-size:.78rem;padding:.05rem .5rem;border-radius:99px;border:1px solid var(--line);white-space:nowrap}
.tag-published{color:var(--ok);border-color:var(--ok)}.tag-hidden{color:var(--bad);border-color:var(--bad)}.tag-draft{color:var(--gold);border-color:var(--gold)}
form.inline{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}input,select,button{font:inherit;padding:.35rem .6rem;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink)}
button{background:var(--red);color:var(--onred);border-color:var(--red);cursor:pointer}
:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
.flash{padding:.5rem .9rem;border-radius:8px;border:1px solid}.flash.ok{color:var(--ok);border-color:var(--ok)}.flash.err{color:var(--bad);border-color:var(--bad)}
#drop{border:2px dashed var(--line);border-radius:12px;padding:1.6rem;text-align:center;background:var(--card);cursor:pointer;margin:1rem 0}#drop.over,#drop:hover{border-color:var(--red)}
.num{width:5.2rem}.num.sm{width:3.6rem}.num.md{width:5.2rem}.wide{width:100%;min-width:14rem;margin-bottom:.3rem}.fname{font-size:.85rem;word-break:break-all}.hdate{white-space:nowrap}
tr.conflict{background:rgba(155,44,44,.1)}.warn,.prog.bad{color:var(--bad);font-size:.85rem}.prog{font-size:.85rem;color:var(--ink2)}
button[disabled]{opacity:.5;cursor:not-allowed}button.secondary{background:var(--card);color:var(--ink);border-color:var(--line)}[hidden]{display:none!important}
fieldset{border:1px solid var(--line);border-radius:10px;padding:.6rem 1rem;margin:1rem 0}legend{padding:0 .4rem;color:var(--ink2)}label{display:inline-block;margin:.2rem .6rem .2rem 0}textarea{font:inherit;width:100%;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--ink);padding:.35rem .6rem}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.muted{color:var(--ink2)}.pager{display:flex;gap:1rem;margin:1rem 0}code,.ltr{direction:ltr;unicode-bidi:embed}
`;
