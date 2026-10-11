/* Browser code of the upload screen (served as /admin.js, no inline scripts: the CSP allows script-src 'self' only).
   Builds the DOM with createElement/textContent only - nothing from files or the database is ever parsed as HTML. */
export const JS = String.raw`(() => {
"use strict";
const PART_SIZE = 8 * 1024 * 1024, SOFT_MB = 100, MAX_MB = 200;
const $ = id => document.getElementById(id);
const el = (tag, props, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === "class") e.className = v; else if (k === "text") e.textContent = v;
    else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const kid of kids) e.append(kid);
  return e;
};
const AR = n => String(n).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]);

let busy = false;
/* ---- upload ---- */
async function sha256hex(file) {
  const h = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function post(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
  return j;
}
function putPart(url, blob, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url); x.responseType = "json";
    x.upload.onprogress = e => e.lengthComputable && onProgress(e.loaded);
    x.onload = () => x.status === 200 ? resolve(x.response) : reject(new Error((x.response && x.response.error) || "HTTP " + x.status));
    x.onerror = () => reject(new Error("انقطع الاتصال"));
    x.send(blob);
  });
}
/* upload one file (any kind the server accepts); progress(text) is called with short labels; returns {key, exists}. confirmReuse: ask when an audio file is already used. */
async function uploadFile(file, progress, confirmReuse) {
  const ext = file.name.split(".").pop().toLowerCase();
  progress("جارٍ حساب البصمة…");
  const sha = await sha256hex(file);
  const st = await post("/api/upload/start", { size: file.size, ext, sha256: sha });
  if (confirmReuse && st.usedBy && !confirm("هذا الملف مستخدم من قبل في الدرس " + st.usedBy + ". هل تريد استخدامه مرة أخرى؟")) throw new Error("أُلغي: الملف مكرر");
  if (st.exists) { progress("موجود مسبقًا ✓"); return { key: st.key, exists: true }; }
  const parts = [], total = Math.ceil(file.size / PART_SIZE);
  try {
    for (let i = 0; i < total; i++) {
      const blob = file.slice(i * PART_SIZE, (i + 1) * PART_SIZE);
      let res, tries = 0;
      for (;;) {
        try {
          res = await putPart("/api/upload/part?key=" + encodeURIComponent(st.key) + "&uploadId=" + encodeURIComponent(st.uploadId) + "&n=" + (i + 1), blob,
            loaded => progress("رفع… " + AR(Math.min(99, Math.round((i * PART_SIZE + loaded) / file.size * 100))) + "٪"));
          break;
        } catch (e) { if (++tries >= 3) throw e; await new Promise(ok => setTimeout(ok, 1500 * tries)); }
      }
      parts.push({ partNumber: res.partNumber, etag: res.etag });
    }
    await post("/api/upload/complete", { key: st.key, uploadId: st.uploadId, parts });
  } catch (e) { post("/api/upload/abort", { key: st.key, uploadId: st.uploadId }).catch(() => {}); throw e; }
  progress("تم الرفع ✓");
  return { key: st.key, exists: false };
}

function initUpload() {
const SERIES = JSON.parse(document.getElementById("series-data").textContent);
/* ---- Hijri helpers (Umm al-Qura through Intl) ---- */
const HP = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Asia/Riyadh" });
const RIYADH = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Riyadh" });
const hparts = t => { const o = {}; for (const p of HP.formatToParts(t)) if (p.type !== "literal" && p.type !== "era") o[p.type] = +p.value; return o; };
const hijriToday = () => { const p = hparts(new Date()); return { y: p.year, m: p.month, d: p.day }; };
function hijriToGregorian(y, m, d) {                      // -> "YYYY-MM-DD" (Riyadh calendar day) or ""
  const est = Date.UTC(622, 6, 16, 9) + ((y - 1) * 354.36709 + (m - 1) * 29.5306 + (d - 1)) * 864e5;
  for (const off of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
    const t = new Date(est + off * 864e5), p = hparts(t);
    if (p.year === y && p.month === m && p.day === d) return RIYADH.format(t);
  }
  return "";
}

/* ---- state ---- */
const rows = [];                                            // {file, tr, n, part, title, titleDirty, y, m, d, section, status, duration, state, ...}
const sel = $("series"), info = $("series-info"), drop = $("drop"), picker = $("file"), tbody = $("rows"), go = $("go"), msg = $("msg"), tableWrap = $("table-wrap");

for (const s of SERIES.list) sel.append(el("option", { value: s.id, text: s.title }));
const wanted = new URLSearchParams(location.search).get("series");
if (wanted && SERIES.by[wanted]) sel.value = wanted;
const cur = () => SERIES.by[sel.value];
const say = (t, kind) => { msg.textContent = t; msg.className = "flash " + (kind || "ok"); msg.hidden = !t; };

function describe() {
  const s = cur(); if (!s) return;
  const last = s.last ? "آخر درس: " + AR(s.last.n) + " — " + AR(s.last.title) + (s.last.hd ? " (" + s.last.hd + ")" : "") : "لا دروس بعد في هذه السلسلة.";
  info.textContent = s.title + " · " + AR(s.count) + " درس · " + last + " · الرقم التالي: " + AR(s.next);
}
const idOf = (s, n, part) => s.id + "-" + String(n).padStart(4, "0") + part;
const defaultTitle = (s, n) => s.unit + " " + n;                  // plain digits like the existing titles (the site shows them in Arabic-Indic)
const PART_AR = { a: "الجزء الأول", b: "الجزء الثاني", c: "الجزء الثالث", d: "الجزء الرابع" };

function renumber() {                                       // sequential numbers from the series' next number, in the order shown
  const s = cur(); let n = s.next;
  rows.forEach(r => { r.n = n++; refresh(r); });
  checkConflicts();
}
function refresh(r) {
  r.nIn.value = r.n; if (!r.titleDirty) r.titleIn.value = defaultTitle(cur(), r.n);
}
function checkConflicts() {
  const s = cur(), seen = new Set(); let bad = 0;
  for (const r of rows) {
    const id = idOf(s, r.n, r.part), dup = seen.has(id) || s.ids.includes(id); seen.add(id);
    r.tr.classList.toggle("conflict", dup);
    r.warn.textContent = dup ? "هذا الرقم مستخدم من قبل" : "";
    if (dup) bad++;
  }
  go.disabled = busy || rows.length === 0 || bad > 0;
}

/* ---- rows ---- */
function numInput(value, min, max, label, cls) { return el("input", { type: "number", min, max, value, "aria-label": label, class: cls || "num" }); }
function addFiles(files) {
  const list = [...files].filter(f => /\.(mp3|m4a)$/i.test(f.name));
  const skipped = files.length - list.length;
  list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const t = hijriToday(), s = cur();
  for (const file of list) {
    if (file.size > MAX_MB * 1048576) { say("الملف " + file.name + " أكبر من " + MAX_MB + " ميغابايت", "err"); continue; }
    const r = { file, n: s.next + rows.length, part: "", titleDirty: false, state: "ready" };
    r.nIn = numInput(r.n, 1, 9999, "الرقم");
    r.partIn = el("select", { "aria-label": "الجزء" }, el("option", { value: "", text: "—" }), ...["a", "b", "c", "d"].map(k => el("option", { value: k, text: PART_AR[k] })));
    r.titleIn = el("input", { type: "text", maxlength: 200, "aria-label": "العنوان", class: "wide" });
    r.dIn = numInput(t.d, 1, 30, "اليوم", "num sm"); r.mIn = numInput(t.m, 1, 12, "الشهر", "num sm"); r.yIn = numInput(t.y, 1300, 1600, "السنة", "num md");
    r.secIn = el("input", { type: "text", maxlength: 120, "aria-label": "الباب (اختياري)", placeholder: "الباب (اختياري)" });
    r.statusIn = el("select", { "aria-label": "الحالة" }, el("option", { value: "published", text: "منشور" }), el("option", { value: "draft", text: "مسودة" }));
    r.warn = el("div", { class: "warn" }); r.prog = el("div", { class: "prog", role: "status" }); r.note = el("div", { class: "muted" });
    r.rm = el("button", { type: "button", class: "secondary", "aria-label": "إزالة", text: "✕", onclick: () => { if (busy) return; rows.splice(rows.indexOf(r), 1); r.tr.remove(); renumber(); toggleTable(); } });
    r.nIn.addEventListener("input", () => { r.n = +r.nIn.value || 0; if (!r.titleDirty) r.titleIn.value = defaultTitle(cur(), r.n); checkConflicts(); });
    r.partIn.addEventListener("change", () => { r.part = r.partIn.value; checkConflicts(); });
    r.titleIn.addEventListener("input", () => { r.titleDirty = true; });
    r.tr = el("tr", {},
      el("td", {}, el("div", { class: "ltr fname", text: file.name }), el("div", { class: "muted", text: (file.size / 1048576).toFixed(1) + " MB" }), r.note, r.prog),
      el("td", {}, r.nIn, r.partIn), el("td", {}, r.titleIn, r.secIn, r.warn),
      el("td", { class: "hdate" }, r.dIn, "/", r.mIn, "/", r.yIn), el("td", {}, r.statusIn), el("td", {}, r.rm));
    rows.push(r); tbody.append(r.tr); refresh(r); probe(r);
  }
  if (skipped) say("تم تجاهل " + AR(skipped) + " ملف(ات) ليست mp3 أو m4a.", "err");
  checkConflicts(); toggleTable();
}
const toggleTable = () => { tableWrap.hidden = rows.length === 0; };

function probe(r) {                                         // duration (and a bitrate hint) from the browser itself
  const url = URL.createObjectURL(r.file), a = new Audio();
  a.preload = "metadata";
  a.onloadedmetadata = () => {
    r.duration = isFinite(a.duration) ? Math.round(a.duration) : 0;
    const kbps = r.duration ? Math.round(r.file.size * 8 / r.duration / 1000) : 0, mins = Math.floor(r.duration / 60);
    const bits = [];
    if (r.duration) bits.push(AR(mins) + " دقيقة");
    if (kbps) bits.push(AR(kbps) + " كب/ث");
    r.note.textContent = bits.join(" · ") + (kbps > 80 ? " — أعلى من المواصفة (٤٨ كب/ث): يُفضّل ضغطه" : "") + (r.file.size > SOFT_MB * 1048576 ? " — الملف كبير" : "");
    URL.revokeObjectURL(url);
  };
  a.onerror = () => { r.duration = 0; r.note.textContent = "تعذّرت قراءة مدة الملف (سيُرفع كما هو)"; URL.revokeObjectURL(url); };
  a.src = url;
}

async function uploadOne(r) { r.key = (await uploadFile(r.file, t => { r.prog.textContent = t; }, true)).key; }

go.addEventListener("click", async () => {
  if (busy || !rows.length) return;
  const s = cur();
  for (const r of rows) {                                   // validate everything before the first byte is sent
    const y = +r.yIn.value, m = +r.mIn.value, d = +r.dIn.value;
    r.hd = ""; r.date = "";
    if (r.yIn.value || r.mIn.value || r.dIn.value) {
      if (!(y >= 1300 && y <= 1600 && m >= 1 && m <= 12 && d >= 1 && d <= 30)) { say("تاريخ هجري غير صالح في: " + r.file.name, "err"); return; }
      r.hd = y + "-" + m + "-" + d; r.date = hijriToGregorian(y, m, d);
      if (!r.date) { say("هذا التاريخ الهجري غير موجود: " + r.file.name, "err"); return; }
    }
    if (!(r.n >= 1)) { say("رقم غير صالح في: " + r.file.name, "err"); return; }
  }
  busy = true; go.disabled = true; say("جارٍ الرفع… لا تغلق الصفحة.", "ok");
  let failed = 0;
  for (const r of rows) {
    if (r.key) continue;
    try { await uploadOne(r); r.prog.classList.remove("bad"); } catch (e) { failed++; r.prog.textContent = "فشل: " + e.message; r.prog.classList.add("bad"); }
  }
  if (failed) { busy = false; checkConflicts(); say("فشل رفع " + AR(failed) + " ملف(ات). أصلح المشكلة ثم اضغط الزر مرة أخرى (ما اكتمل رفعه لن يُعاد).", "err"); return; }
  try {
    const out = await post("/api/lessons", { series: s.id, items: rows.map(r => ({ n: r.n, part: r.part, title: r.titleIn.value, hd: r.hd, date: r.date, section: r.secIn.value, key: r.key, duration: r.duration || 0, status: r.statusIn.value })) });
    tableWrap.hidden = true; go.hidden = true; drop.hidden = true;
    const done = $("done"); done.hidden = false;
    done.replaceChildren(
      el("p", { class: "flash ok", text: "تم حفظ " + AR(out.ids.length) + " درس في «" + s.title + "»." }),
      el("p", {}, el("a", { href: "/publish", text: "← انتقل إلى النشر ليظهر في الموقع" }), " · ", el("a", { href: "/series/" + encodeURIComponent(s.id), text: "عرض السلسلة" }), " · ", el("a", { href: "/upload?series=" + encodeURIComponent(s.id), text: "رفع المزيد" })));
    say("", "ok"); busy = false;                            // finished: the "leave this page?" guard must not stay on
  } catch (e) { busy = false; checkConflicts(); say("تم رفع الملفات لكن تعذّر حفظ الدروس: " + e.message, "err"); }
});

/* ---- wiring ---- */
sel.addEventListener("change", () => { describe(); renumber(); });
drop.addEventListener("click", () => picker.click());
drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); picker.click(); } });
picker.addEventListener("change", () => { addFiles(picker.files); picker.value = ""; });
for (const ev of ["dragenter", "dragover"]) drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); });
for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); });
drop.addEventListener("drop", e => addFiles(e.dataTransfer.files));
$("apply-date").addEventListener("click", () => {
  const d = $("g-d").value, m = $("g-m").value, y = $("g-y").value;
  for (const r of rows) { r.dIn.value = d; r.mIn.value = m; r.yIn.value = y; }
});
const t0 = hijriToday(); $("g-d").value = t0.d; $("g-m").value = t0.m; $("g-y").value = t0.y;
describe(); toggleTable(); go.disabled = true;
window.addEventListener("beforeunload", e => { if (busy) { e.preventDefault(); e.returnValue = ""; } });
}

/* ---- book form: add files (uploaded to R2 or an external link) to the list, then the normal form post saves everything ---- */
function initBook() {
  const body = $("book-files"), pick = $("book-file"), msg = $("book-msg"), ext = $("ext-url"), addExt = $("ext-add");
  let idx = body.querySelectorAll("tr").length;
  const say = (t, bad) => { msg.textContent = t; msg.className = bad ? "flash err" : "flash ok"; msg.hidden = !t; };
  const row = (label, url) => {
    const i = idx++;
    const a = el("a", { href: url, target: "_blank", rel: "noopener noreferrer", class: "ltr", text: url.replace(/^https:\/\//, "").slice(0, 70) });
    body.append(el("tr", {},
      el("td", {}, el("input", { name: "file_label", value: label, maxlength: 60, "aria-label": "اسم الملف", required: "required" })),
      el("td", { class: "ltr" }, a, el("input", { type: "hidden", name: "file_url", value: url })),
      el("td", {}, el("label", {}, el("input", { type: "checkbox", name: "file_rm", value: String(i) }), " حذف"))));
  };
  pick.addEventListener("change", async () => {
    const f = pick.files[0]; pick.value = "";
    if (!f) return;
    const e = f.name.split(".").pop().toLowerCase();
    if (e !== "pdf" && e !== "epub") return say("الملف يجب أن يكون pdf أو epub.", true);
    if (f.size > MAX_MB * 1048576) return say("الملف أكبر من " + MAX_MB + " ميغابايت.", true);
    busy = true;
    try { const r = await uploadFile(f, t => say(f.name + ": " + t, false)); row(e === "pdf" ? "تحميل PDF" : "تحميل EPUB", "https://media.drwasiullah.com/" + r.key); say("أُضيف الملف إلى القائمة. اضغط «حفظ» لإتمام التعديل.", false); }
    catch (er) { say("فشل الرفع: " + er.message, true); }
    busy = false;
  });
  addExt.addEventListener("click", () => {
    let u; try { u = new URL(ext.value.trim()); } catch { return say("رابط غير صالح.", true); }
    if (u.protocol !== "https:") return say("الرابط يجب أن يبدأ بـ https.", true);
    row("تحميل", u.href); ext.value = ""; say("أُضيف الرابط إلى القائمة. اضغط «حفظ».", false);
  });
  window.addEventListener("beforeunload", e => { if (busy) { e.preventDefault(); e.returnValue = ""; } });
}

if ($("upload-root")) initUpload();
if ($("book-root")) initBook();
})();
`;
