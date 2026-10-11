/* Phase 5 in the admin portal: banners, announcements, the weekly schedule and "no lesson tonight" notices (HTTP). Run through tests/admin_run_all.sh. */
const BASE = process.env.BASE || "http://localhost:8791";
let bad = 0;
const check = (name, cond, extra = "") => { if (!cond) bad++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + String(extra)}`); };
const A = "boss@example.com", E = "ed@example.com", H = { "sec-fetch-site": "same-origin" };
const get = (path, email = A) => fetch(BASE + path, { redirect: "manual", headers: { "x-dev-email": email } });
const html = async (path, email = A) => (await get(path, email)).text();
const post = (path, body, email = A) => fetch(BASE + path, { method: "POST", redirect: "manual", body: new URLSearchParams(body), headers: { "x-dev-email": email, ...H } });
const postA = (path, pairs, email = A) => { const p = new URLSearchParams(); for (const [k, v] of pairs) p.append(k, v); return fetch(BASE + path, { method: "POST", redirect: "manual", body: p, headers: { "x-dev-email": email, ...H } }); };
const loc = r => r.headers.get("location") || "";
const ver = h => /name="ver" value="([0-9a-f]+)"/.exec(h)[1];
const pad = n => String(n).padStart(2, "0");
const mk = (ms) => { const d = new Date(Date.now() + 3 * 3600e3 + ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };   // Makkah-local datetime-local value
const today = mk(0).slice(0, 10), tomorrow = mk(864e5).slice(0, 10), yesterday = mk(-864e5).slice(0, 10);

const hm = await html("/");
/* ---- permissions ---- */
check("admin menu has banners, announcements and schedule", ["/banners", "/announcements", "/schedule"].every(h => (hm).includes(`href="${h}"`)));
check("an editor cannot open them (404) or post to them (403)", (await get("/banners", E)).status === 404 && (await get("/announcements", E)).status === 404 && (await get("/schedule", E)).status === 404 && (await post("/banners/save", { text: "x", kind: "info" }, E)).status === 403 && (await post("/announcements/save", { title: "x", body: "y", status: "published" }, E)).status === 403 && (await post("/notices/add", { slot: "s1", day: today, kind: "cancelled" }, E)).status === 403);
check("cross-site banner post refused", (await fetch(BASE + "/banners/save", { method: "POST", body: new URLSearchParams({ text: "x", kind: "info" }), headers: { "x-dev-email": A, "sec-fetch-site": "cross-site" } })).status === 403);

/* ---- banners ---- */
check("banner without text refused", loc(await post("/banners/save", { text: "", kind: "info", active: "1" })).includes("err=invalid"));
check("http link refused", loc(await post("/banners/save", { text: "x", kind: "info", link: "http://example.com", active: "1" })).includes("err=invalid"));
check("javascript link refused", loc(await post("/banners/save", { text: "x", kind: "info", link: "javascript:alert(1)", active: "1" })).includes("err=invalid"));
check("bad kind refused", loc(await post("/banners/save", { text: "x", kind: "evil", active: "1" })).includes("err=invalid"));
check("end before start refused", loc(await post("/banners/save", { text: "x", kind: "info", starts: mk(2 * 3600e3), ends: mk(3600e3), active: "1" })).includes("err=invalid"));
check("garbage date refused", loc(await post("/banners/save", { text: "x", kind: "info", starts: "tomorrow", active: "1" })).includes("err=invalid"));
check("banner added", loc(await post("/banners/save", { text: "لا درس اليوم <b>x</b>", kind: "notice", link: "https://example.org/a", dismissible: "1", active: "1" })).includes("ok=banner_saved"));
let page = await html("/banners");
check("listed as active now, text escaped", /نشط الآن/.test(page) && page.includes("&lt;b&gt;x&lt;/b&gt;") && !page.includes("<b>x</b>"));
const id = /\/banners\/(\d+)/.exec(page)[1];
check("scheduled banner (starts tomorrow) shows as scheduled", loc(await post("/banners/save", { text: "قادم", kind: "info", starts: mk(864e5), active: "1" })).includes("ok=") && /مجدول/.test(await html("/banners")));
check("expired banner shows as expired", loc(await post("/banners/save", { text: "منتهٍ", kind: "info", starts: mk(-2 * 864e5), ends: mk(-864e5), active: "1" })).includes("ok=") && /منتهٍ/.test(await html("/banners")));
const e = await html("/banners/" + id);
check("edit page keeps the values (Makkah-time fields)", /value="notice"|<option value="notice" selected>/.test(e) && e.includes("https://example.org/a"));
check("edit saved", loc(await post("/banners/save", { id, text: "نص جديد", kind: "urgent", active: "1" })).includes("ok=banner_saved") && (await html("/banners")).includes("نص جديد"));
check("toggle off", loc(await post("/banners/toggle", { id, active: "0" })).includes("ok=") && /متوقف/.test(await html("/banners")));
check("delete", loc(await post("/banners/delete", { id })).includes("ok=deleted") && !(await html("/banners")).includes("نص جديد"));
check("unknown banner 404 / delete refused", (await get("/banners/99999")).status === 404 && loc(await post("/banners/delete", { id: "99999" })).includes("err="));

/* ---- announcements ---- */
check("announcement needs a title and text", loc(await post("/announcements/save", { title: "", body: "x", status: "published" })).includes("err=invalid") && loc(await post("/announcements/save", { title: "x", body: "", status: "published" })).includes("err=invalid"));
check("bad status / bad link refused", loc(await post("/announcements/save", { title: "x", body: "y", status: "hacked" })).includes("err=invalid") && loc(await post("/announcements/save", { title: "x", body: "y", status: "published", link: "ftp://x" })).includes("err=invalid"));
check("announcement added (published, pinned)", loc(await post("/announcements/save", { title: "افتتاح الموقع <script>alert(1)</script>", body: "السطر الأول\nالسطر الثاني", status: "published", pinned: "1", link: "https://example.org/n", link_label: "اقرأ" })).includes("ok=announcement_saved"));
check("a draft and a scheduled one added", loc(await post("/announcements/save", { title: "مسودة", body: "x", status: "draft" })).includes("ok=") && loc(await post("/announcements/save", { title: "مجدول", body: "x", status: "published", publish_at: mk(2 * 864e5) })).includes("ok="));
page = await html("/announcements");
check("list shows pinned / draft / scheduled; markup escaped", /مثبّت/.test(page) && /مسودة/.test(page) && /مجدول/.test(page) && page.includes("&lt;script&gt;") && !page.includes("<script>alert"));
const aid = /\/announcements\/(\d+)">افتتاح/.exec(page)[1];
const ae = await html("/announcements/" + aid);
check("edit page shows the body with its lines", ae.includes("السطر الأول") && ae.includes("السطر الثاني"));
check("edit and delete", loc(await post("/announcements/save", { id: aid, title: "عنوان معدل", body: "نص", status: "published" })).includes("ok=") && (await html("/announcements")).includes("عنوان معدل") && loc(await post("/announcements/delete", { id: aid })).includes("ok=deleted") && !(await html("/announcements")).includes("عنوان معدل"));

/* ---- schedule ---- */
page = await html("/schedule");
check("schedule page lists the current slots", /شرح صحيح مسلم|فضائل/.test(page) && /name="slot" value="s\d+"/.test(page), page.slice(0, 200));
let v = ver(page);
const firstSlot = /<input type="hidden" name="slot" value="(s\d+)">/.exec(page)[1];
check("a slot needs a title and at least one day", loc(await postA("/schedule/slot", [["ver", v], ["slot", ""], ["title", ""], ["days", "الأحد"]])).includes("err=invalid") && loc(await postA("/schedule/slot", [["ver", v], ["slot", ""], ["title", "x"]])).includes("err=invalid"));
check("an unknown series / unknown weekday refused or ignored", loc(await postA("/schedule/slot", [["ver", v], ["slot", ""], ["title", "x"], ["days", "الأحد"], ["series", "no-such"]])).includes("err=invalid") && loc(await postA("/schedule/slot", [["ver", v], ["slot", ""], ["title", "x"], ["days", "Sunday"]])).includes("err=invalid"));
check("a stale form is refused (version token)", loc(await postA("/schedule/slot", [["ver", "0000000000000000"], ["slot", ""], ["title", "x"], ["days", "الأحد"]])).includes("err=conflict"));
check("new slot added (Urdu, hidden)", loc(await postA("/schedule/slot", [["ver", v], ["slot", ""], ["title", "درس الاختبار"], ["days", "الأحد"], ["days", "الثلاثاء"], ["time", "بعد العشاء"], ["order", "9"], ["lang", "ur"], ["hidden", "1"], ["note", "ملاحظة"]])).includes("ok=schedule_saved"));
page = await html("/schedule"); v = ver(page);
check("the new slot appears, marked hidden, with a fresh id", /درس الاختبار/.test(page) && /مخفي/.test(page));
const newId = [...page.matchAll(/<input type="hidden" name="slot" value="(s\d+)">/g)].map(m => m[1]).pop();
check("edit a slot (title, time) keeps its id", loc(await postA("/schedule/slot", [["ver", v], ["slot", firstSlot], ["title", "عنوان معدل للموعد"], ["days", "الأربعاء"], ["days", "الخميس"], ["time", "بعد المغرب بقليل"], ["order", "1"]])).includes("ok=schedule_saved") && (await html("/schedule")).includes("عنوان معدل للموعد"));
page = await html("/schedule"); v = ver(page);
check("live button: only mixlr.com over https", loc(await post("/schedule/meta", { ver: v, note: "ن", live_url: "https://evil.example/x" })).includes("err=invalid") && loc(await post("/schedule/meta", { ver: v, note: "ن", live_url: "http://mixlr.com/x" })).includes("err=invalid"));
check("meta saved (note + live button)", loc(await post("/schedule/meta", { ver: v, note: "ملاحظة جديدة", live_url: "https://mixlr.com/wahatualsunnah", live_label: "حضور", live_sub: "اضغط" })).includes("ok=schedule_saved"));
page = await html("/schedule"); v = ver(page);
check("the slots survived the meta save", /عنوان معدل للموعد/.test(page) && /درس الاختبار/.test(page) && /ملاحظة جديدة/.test(page));

/* ---- notices ---- */
const slotsHtml = page;
check("notice for an unknown slot / a past day / a missing note on a change refused", loc(await post("/notices/add", { slot: "zzz", day: today, kind: "cancelled" })).includes("err=invalid") && loc(await post("/notices/add", { slot: firstSlot, day: yesterday, kind: "cancelled" })).includes("err=invalid") && loc(await post("/notices/add", { slot: firstSlot, day: today, kind: "changed" })).includes("err=invalid") && loc(await post("/notices/add", { slot: firstSlot, day: "2099-01-01", kind: "cancelled" })).includes("err=invalid"));
check("cancel today and a change tomorrow", loc(await post("/notices/add", { slot: firstSlot, day: today, kind: "cancelled", note: "لعذر طارئ" })).includes("ok=notice_saved") && loc(await post("/notices/add", { slot: firstSlot, day: tomorrow, kind: "changed", note: "يبدأ ٩ مساءً" })).includes("ok=notice_saved"));
page = await html("/schedule");
check("notices listed", /لعذر طارئ/.test(page) && /يبدأ ٩ مساءً/.test(page) && /ملغى/.test(page));
const nid = /name="id" value="(\d+)"><button class="secondary">حذف<\/button>/.exec(page)[1];
check("notice deleted", loc(await post("/notices/delete", { id: nid })).includes("ok=notice_saved"));
check("deleting a slot also removes its notices", loc(await postA("/schedule/slot-delete", [["ver", ver(await html("/schedule"))], ["slot", firstSlot]])).includes("ok=schedule_saved") && !(await html("/schedule")).includes("عنوان معدل للموعد") && !/يبدأ ٩ مساءً/.test(await html("/schedule")));
check("delete with a stale token refused", loc(await postA("/schedule/slot-delete", [["ver", "0000000000000000"], ["slot", newId]])).includes("err=conflict"));

/* ---- Publish counts schedule edits; live items are audited ---- */
const au = await html("/audit");
check("audit log has banner.*, announcement.*, schedule.*, notice.*", ["banner.add", "banner.edit", "banner.delete", "announcement.add", "announcement.delete", "schedule.slot", "schedule.meta", "notice.add", "notice.delete"].every(a => au.includes(a)));
check("the publish page counts schedule edits (not banners)", /تغيير لم يُنشر/.test(await html("/publish")));
if (bad) { console.error(`!! ${bad} failed`); process.exit(1); }
console.log("all admin live-layer checks passed");
