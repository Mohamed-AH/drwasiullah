/* Phase 4a: editing lessons, series and books in the admin portal (HTTP + one browser flow for adding a PDF to a book).
   Run through tests/admin_run_all.sh (local dev server with seeded database; fixtures in AUDIO_DIR: sample.pdf is created here). */
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE || "http://localhost:8791", DIR = process.env.AUDIO_DIR || "/tmp/aud";
let bad = 0;
const check = (name, cond, extra = "") => { if (!cond) bad++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + String(extra)}`); };
const H = { "sec-fetch-site": "same-origin" };
const get = (path, email) => fetch(BASE + path, { redirect: "manual", headers: { "x-dev-email": email } });
const post = (path, email, body) => fetch(BASE + path, { method: "POST", redirect: "manual", body: new URLSearchParams(body), headers: { "x-dev-email": email, ...H } });
const loc = r => r.headers.get("location");
const ver = html => /name="ver" value="([0-9a-f]+)"/.exec(html)[1];
const E = "ed@example.com";

/* ---- lesson edit ---- */
let html = await (await get("/lessons/tirmidhi-0001", E)).text();
check("lesson edit form opens (Hijri date prefilled from the stored hd)", /name="title"/.test(html) && /name="hy"[^>]*value="1436"/.test(html) && /name="hm"[^>]*value="2"/.test(html), html.slice(0, 200));
let v = ver(html);
check("unknown lesson 404", (await get("/lessons/nope-0001", E)).status === 404);
check("edit refused with a wrong version token", loc(await post("/lessons/save", E, { id: "tirmidhi-0001", ver: "0000000000000000", title: "x", status: "published" })).includes("err=conflict"));
check("empty title refused", loc(await post("/lessons/save", E, { id: "tirmidhi-0001", ver: v, title: "", status: "published", hd: 7, hm: 2, hy: 1436 })).includes("err=invalid"));
check("half a date refused", loc(await post("/lessons/save", E, { id: "tirmidhi-0001", ver: v, title: "ت", status: "published", hy: 1436 })).includes("err=invalid"));
check("impossible Hijri day refused", loc(await post("/lessons/save", E, { id: "tirmidhi-0001", ver: v, title: "ت", status: "published", hd: 30, hm: 2, hy: 9999 })).includes("err="));
check("no change = nothing written", loc(await post("/lessons/save", E, { id: "tirmidhi-0001", ver: v, title: /name="title"[^>]*value="([^"]*)"/.exec(html)[1].replace(/&quot;/g, '"'), n: /name="n"[^>]*value="(\d*)"/.exec(html)[1], section: "كتاب الطهارة", hd: 7, hm: 2, hy: 1436, status: "published" })).includes("ok=nochange"));
check("edit title, number, section and date", loc(await post("/lessons/save", E, { id: "tirmidhi-0001", ver: v, title: "من الحديث ١ (مُعدَّل)", n: 1, section: "كتاب الطهارة والوضوء", hd: 9, hm: 3, hy: 1436, status: "published" })).includes("ok=saved"));
html = await (await get("/lessons/tirmidhi-0001", E)).text();
check("saved values shown again, new version token", html.includes("مُعدَّل") && /name="hd"[^>]*value="9"/.test(html) && ver(html) !== v);
check("the old form can no longer overwrite (conflict)", loc(await post("/lessons/save", E, { id: "tirmidhi-0001", ver: v, title: "قديم", status: "published", hd: 9, hm: 3, hy: 1436 })).includes("err=conflict"));
check("clearing the date removes it", loc(await post("/lessons/save", E, { id: "tirmidhi-0001", ver: ver(html), title: "من الحديث ١", n: 1, section: "", status: "hidden" })).includes("ok=saved"));
html = await (await get("/lessons/tirmidhi-0001", E)).text();
check("date cleared and lesson hidden", /name="hy"[^>]*value=""/.test(html) && /<option value="hidden" selected>/.test(html));

/* ---- series edit ---- */
html = await (await get("/series/tadrib/edit", E)).text();
check("series edit form opens", /name="title"[^>]*value="شرح تدريب الراوي"/.test(html));
check("series edit saved", loc(await post("/series/save", E, { id: "tadrib", ver: ver(html), title: "شرح تدريب الراوي للسيوطي", sec: "audio", unit: "الدرس", ordered: "1", description: "وصف", status: "published" })).includes("ok=saved"));
check("bad section refused", loc(await post("/series/save", E, { id: "tadrib", ver: ver(await (await get("/series/tadrib/edit", E)).text()), title: "x", sec: "evil", status: "published" })).includes("err=invalid"));


/* ---- YouTube lessons and series: saved as patches on top of the sync ---- */
const V = process.env.VIDEO_ID;
html = await (await get("/lessons/" + V, E)).text();
check("YouTube lesson opens in an editable form with a series chooser", /name="series"/.test(html) && /تصحيحات فوق المزامنة/.test(html) && !/التراجع عن تعديلاتي/.test(html));
const origTitle = /name="title"[^>]*value="([^"]*)"/.exec(html)[1], origSeries = /<option value="([^"]+)" selected>/.exec(html)[1], origN = /name="n"[^>]*value="(\d*)"/.exec(html)[1];
v = ver(html);
check("saving without changes writes nothing", loc(await post("/lessons/save", E, { id: V, ver: v, title: origTitle.replace(/&quot;/g, '"').replace(/&amp;/g, "&"), series: origSeries, n: origN, section: /name="section"[^>]*value="([^"]*)"/.exec(html)[1], hd: /name="hd"[^>]*value="(\d*)"/.exec(html)[1], hm: /name="hm"[^>]*value="(\d*)"/.exec(html)[1], hy: /name="hy"[^>]*value="(\d*)"/.exec(html)[1], status: "published" })).includes("ok=nochange"));
check("series that does not exist refused", loc(await post("/lessons/save", E, { id: V, ver: v, title: "x", series: "no-such-series", status: "published" })).includes("err=invalid"));
check("YouTube lesson: title, number, section and series saved as a patch", loc(await post("/lessons/save", E, { id: V, ver: v, title: "عنوان مصحح", n: 77, section: "باب مصحح", series: "tadrib", status: "published", hd: 5, hm: 6, hy: 1440 })).includes("ok=saved"));
html = await (await get("/lessons/" + V, E)).text();
check("form shows the patched values, the 'edited' tag and the undo button", /value="عنوان مصحح"/.test(html) && /معدَّل/.test(html) && /التراجع عن تعديلاتي/.test(html) && /name="hy"[^>]*value="1440"/.test(html));
check("the old form is refused after the change (conflict)", loc(await post("/lessons/save", E, { id: V, ver: v, title: "قديم", series: origSeries, status: "published" })).includes("err=conflict"));
let pg2 = await (await get("/series/tadrib?page=2", E)).text(), list1 = await (await get("/series/tadrib", E)).text();
check("the lesson now appears in the new series (effective view)", (pg2 + list1).includes("عنوان مصحح"));
check("... and no longer in its old series", !(await (await get("/series/" + origSeries, E)).text()).includes("عنوان مصحح"));
const rh = await post("/lessons/status", E, { id: V, series: "tadrib", status: "hidden" });
check("hide through the list button (patch, not a deletion)", loc(rh).includes("ok=status_saved") && /مخفي/.test(await (await get("/lessons/" + V, E)).text() + await (await get("/series/tadrib", E)).text() + await (await get("/series/tadrib?page=2", E)).text()));
check("a YouTube lesson cannot be a draft", loc(await post("/lessons/status", E, { id: V, series: "tadrib", status: "draft" })).includes("err=invalid"));
check("undo removes every patch", loc(await post("/lessons/reset", E, { id: V })).includes("ok=reset_done"));
html = await (await get("/lessons/" + V, E)).text();
check("after the undo the lesson is as the sync made it", html.includes('value="' + origTitle + '"') && !/التراجع عن تعديلاتي/.test(html));
check("undo with nothing to undo says so", loc(await post("/lessons/reset", E, { id: V })).includes("ok=nochange"));
check("undo is only for YouTube items", loc(await post("/lessons/reset", E, { id: "tirmidhi-0002" })).includes("err="));
html = await (await get("/series/muslim/edit", E)).text();
check("YouTube series edit form", /name="title"[^>]*value="شرح صحيح مسلم"/.test(html) && /تصحيحات فوق المزامنة/.test(html));
check("YouTube series renamed (patch)", loc(await post("/series/save", E, { id: "muslim", ver: ver(html), title: "شرح صحيح مسلم (مصحح)", sec: "duroos", description: "وصف جديد", status: "published" })).includes("ok=saved"));
check("series list shows the new title", /شرح صحيح مسلم \(مصحح\)/.test(await (await get("/series", E)).text()));
// leave a visible patch for the export / build / mirror chain checks in tests/admin_run_all.sh
check("final patches for the chain test", loc(await post("/lessons/save", E, { id: V, ver: ver(await (await get("/lessons/" + V, E)).text()), title: "عنوان مصحح نهائي", n: 5, series: origSeries, status: "published", hd: 5, hm: 6, hy: 1440 })).includes("ok=saved"));

/* ---- books ---- */
html = await (await get("/books/book-001", E)).text();
check("book edit form lists its files", /file_label/.test(html) && /fadaail-uqu\.pdf/.test(html));
check("book needs at least one file", loc(await post("/books/save", E, { id: "book-001", ver: ver(html), title: "ك", group: "التحقيقات", status: "published", file_label: "x", file_url: "https://example.com/a.pdf", file_rm: "0" })).includes("err=need_file"));
check("http link refused", loc(await post("/books/save", E, { id: "book-001", ver: ver(html), title: "ك", group: "التحقيقات", status: "published", file_label: "x", file_url: "http://example.com/a.pdf" })).includes("err=bad_url"));
check("javascript link refused", loc(await post("/books/save", E, { id: "book-001", ver: ver(html), title: "ك", group: "التحقيقات", status: "published", file_label: "x", file_url: "javascript:alert(1)" })).includes("err=bad_url"));
check("book with an invented media key refused", loc(await post("/books/save", E, { id: "book-001", ver: ver(html), title: "ك", group: "التحقيقات", status: "published", file_label: "x", file_url: "https://media.drwasiullah.com/../etc/passwd" })).includes("err=bad_url"));
const nb = new URLSearchParams(); for (const [k, x] of Object.entries({ title: "كتاب تجريبي", group_new: "مجموعة التجربة", status: "draft", note: "ملاحظة" })) nb.set(k, x);
nb.append("file_label", "تحميل PDF"); nb.append("file_url", "https://example.org/x.pdf");
let r = await fetch(BASE + "/books/save", { method: "POST", redirect: "manual", body: nb, headers: { "x-dev-email": E, ...H } });
check("new book added", loc(r).includes("ok=book_added"));
const list = await (await get("/books", E)).text();
check("new book listed as draft with the next id", /book-025/.test(list) && /كتاب تجريبي/.test(list));

/* browser: add a PDF to the new book through the upload field */
fs.writeFileSync(`${DIR}/sample.pdf`, "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n" + "x".repeat(5000));
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await b.newContext({ extraHTTPHeaders: { "x-dev-email": E } }), p = await ctx.newPage();
const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !/status of 400/.test(m.text()) && errs.push(m.text()));
await p.goto(BASE + "/books/book-025");
await p.setInputFiles("#book-file", `${DIR}/sample.pdf`);
await p.waitForFunction(() => document.querySelectorAll("#book-files tr").length === 2, null, { timeout: 15000 });
check("uploaded PDF appears as a new row pointing at media.drwasiullah.com/pdf/…", /media\.drwasiullah\.com\/pdf\/[0-9a-f]{16}\.pdf/.test(await p.inputValue("#book-files tr:nth-child(2) input[name=file_url]", { timeout: 2000 }).catch(async () => await p.$eval("#book-files tr:nth-child(2) input[name=file_url]", e => e.value))));
fs.writeFileSync(`${DIR}/notpdf.pdf`, "hello this is not a pdf at all " + "y".repeat(2000));
await p.setInputFiles("#book-file", `${DIR}/notpdf.pdf`);
await p.waitForFunction(() => /فشل/.test(document.getElementById("book-msg").textContent), null, { timeout: 15000 });
check("a fake PDF is refused after upload", /لا يطابق نوعه/.test(await p.textContent("#book-msg")), await p.textContent("#book-msg"));
await p.fill("#ext-url", "https://archive.org/download/x/y.pdf"); await p.click("#ext-add");
check("external https link added to the list", (await p.$$("#book-files tr")).length === 3);
await p.fill("#ext-url", "http://insecure.example/z.pdf"); await p.click("#ext-add");
check("http link refused in the form", /https/.test(await p.textContent("#book-msg")) && (await p.$$("#book-files tr")).length === 3);
await p.selectOption("select[name=status]", "published");
await Promise.all([p.waitForURL(/\/books\?ok=book_saved/), p.click("button:has-text('حفظ')")]);
html = await (await get("/books/book-025", E)).text();
check("book saved with 3 files and published", (html.match(/name="file_url"/g) || []).length === 3 && /<option value="published" selected>/.test(html));
check("no page or console errors", errs.length === 0, errs.join(" | "));
await b.close();

/* ---- permissions ---- */
check("admin sees the same edit pages", (await get("/lessons/tirmidhi-0001", "boss@example.com")).status === 200);
check("a user who is not in the table sees nothing", (await get("/lessons/tirmidhi-0001", "nobody@example.com")).status === 403);
check("cross-site edit post refused", (await fetch(BASE + "/lessons/save", { method: "POST", body: new URLSearchParams({ id: "tirmidhi-0001" }), headers: { "x-dev-email": E, "sec-fetch-site": "cross-site" } })).status === 403);
const au = await (await get("/audit", "boss@example.com")).text();
check("audit log has lesson.edit, lesson.reset, series.edit, book.add, book.edit", ["lesson.edit", "lesson.reset", "lesson.status", "series.edit", "book.add", "book.edit"].every(a => au.includes(a)));
if (bad) { console.error(`!! ${bad} failed`); process.exit(1); }
console.log("all admin edit checks passed");
