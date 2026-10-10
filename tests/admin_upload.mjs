/* Browser test of the audio upload workflow against a LOCAL dev server (see the setup at the top of tests/admin_http.mjs; start it with
   --var ENV:dev --var GH_API_BASE:http://localhost:8795 --var GH_DISPATCH_TOKEN:testtoken). Needs the audio fixtures in AUDIO_DIR:
   small.mp3 (~0.5 MB), big.mp3 (~21 MB: three 8 MiB parts), t3.mp3, fake.mp3 (random bytes). Playwright + Chromium must resolve.
   A tiny fake "GitHub" listens on :8795 and records the Publish request. */
import { chromium } from "playwright";
import http from "node:http";

const BASE = process.env.BASE || "http://localhost:8791", DIR = process.env.AUDIO_DIR || "/tmp/aud";
let bad = 0;
const check = (name, cond, extra = "") => { if (!cond) bad++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + String(extra)}`); };

const gh = [];
const ghServer = http.createServer((req, res) => { let b = ""; req.on("data", c => b += c); req.on("end", () => { gh.push({ url: req.url, auth: req.headers.authorization, body: b }); res.writeHead(204); res.end(); }); }).listen(8795);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { "x-dev-email": "ed@example.com" } });
const p = await ctx.newPage();
const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !/status of 400/.test(m.text()) && errs.push(m.text()));   // the refused fake.mp3 legitimately logs one 400
p.on("dialog", d => d.accept());

/* new series */
await p.goto(BASE + "/series/new");
await p.fill('input[name=id]', "muslim-audio"); await p.fill('input[name=title]', "شرح صحيح مسلم (صوتي)"); await p.selectOption('select[name=sec]', "audio");
await Promise.all([p.waitForURL(/\/upload\?series=muslim-audio/), p.click("button")]);
check("series created, redirected to upload with the series selected", (await p.inputValue("#series")) === "muslim-audio");
check("empty series: next number is 1", (await p.textContent("#series-info")).includes("الرقم التالي: ١"));

/* choose files: rows numbered from 1 in file-name order, default titles */
await p.setInputFiles("#file", [`${DIR}/t3.mp3`, `${DIR}/small.mp3`, `${DIR}/big.mp3`]);
await p.waitForSelector("#rows tr:nth-child(3)");
const nums = await p.$$eval("#rows tr", trs => trs.map(t => t.querySelector("input.num").value));
const names = await p.$$eval("#rows .fname", n => n.map(x => x.textContent));
check("three rows, numbered 1..3 in natural file-name order", nums.join() === "1,2,3" && names.join() === "big.mp3,small.mp3,t3.mp3", nums + " " + names);
check("default title uses the unit and Arabic digits", (await p.$$eval("#rows tr", t => t[1].querySelectorAll("input[type=text]")[0].value)) === "الدرس 2");
await p.waitForFunction(() => document.querySelectorAll("#rows .muted")[1] && /دقيقة/.test(document.querySelector("#rows").textContent), null, { timeout: 8000 }).catch(() => {});
check("duration/bitrate read in the browser", /دقيقة/.test(await p.textContent("#rows")), await p.textContent("#rows"));
check("date defaults to today's Hijri date", (await p.inputValue("#g-y")) >= "1447");

/* conflict detection: make row 2 the same number as row 1 */
await p.fill("#rows tr:nth-child(2) input.num", "1");
check("duplicate number flagged and upload blocked", (await p.isDisabled("#go")) && /مستخدم/.test(await p.textContent("#rows")));
await p.fill("#rows tr:nth-child(2) input.num", "2");
check("conflict cleared", !(await p.isDisabled("#go")));
await p.fill("#rows tr:nth-child(3) input[type=text] >> nth=1", "كتاب الإيمان");     // section of lesson 3

/* upload everything */
await p.click("#go");
await p.waitForSelector("#done:not([hidden])", { timeout: 60000 });
check("saved message shown", /تم حفظ ٣ درس/.test(await p.textContent("#done")), await p.textContent("#msg"));

/* what the portal recorded */
await p.goto(BASE + "/series/muslim-audio");
const page1 = await p.textContent("main");
check("series page lists the 3 lessons with Hijri dates", /الدرس 1/.test(page1) && /الدرس 3/.test(page1) && /هـ|١٤٤/.test(page1));
check("section saved on lesson 3", page1.includes("كتاب الإيمان"));

/* a file that is not audio is refused */
await p.goto(BASE + "/upload?series=muslim-audio");
await p.setInputFiles("#file", [`${DIR}/fake.mp3`]);
await p.waitForSelector("#rows tr");
await p.click("#go");
await p.waitForFunction(() => /فشل/.test(document.querySelector("#rows").textContent), null, { timeout: 15000 });
check("random bytes named .mp3 are refused after upload", /ليس صوتًا صالحًا/.test(await p.textContent("#rows")), await p.textContent("#rows"));

/* uploading the same file again: reuse is detected */
await p.goto(BASE + "/upload?series=muslim-audio");
await p.setInputFiles("#file", [`${DIR}/small.mp3`]);
await p.waitForSelector("#rows tr");
let asked = "";
p.removeAllListeners("dialog"); p.on("dialog", d => { asked = d.message(); d.dismiss(); });
await p.click("#go");
await p.waitForFunction(() => /فشل/.test(document.querySelector("#rows").textContent), null, { timeout: 15000 });
check("same file again: asks before reusing (and cancel stops it)", /muslim-audio-0002/.test(asked) && /أُلغي/.test(await p.textContent("#rows")), asked);

/* hide / publish a lesson */
await p.goto(BASE + "/series/muslim-audio");
await p.click("tbody tr:nth-child(1) button[value=hidden]");
check("lesson hidden", /مخفي/.test(await p.textContent("tbody tr:nth-child(1)")));

/* publish button asks GitHub */
await p.goto(BASE + "/publish");
check("publish page counts the pending changes", /تغيير لم يُنشر/.test(await p.textContent("main")));
await p.click("button:has-text('نشر الآن')");
await p.waitForSelector(".flash");
check("publish requested", /تم طلب النشر/.test(await p.textContent(".flash")));
check("GitHub got the dispatch with token, workflow and ref", gh.length === 1 && /\/repos\/Mohamed-AH\/drwasiullah\/actions\/workflows\/publish\.yml\/dispatches/.test(gh[0].url) && gh[0].auth === "Bearer testtoken" && JSON.parse(gh[0].body).ref === "main" && JSON.parse(gh[0].body).inputs.actor === "ed@example.com", JSON.stringify(gh));
await p.goto(BASE + "/publish"); await p.click("button:has-text('نشر الآن')"); await p.waitForSelector(".flash");
check("a second publish within a minute is refused", /انتظر دقيقة/.test(await p.textContent(".flash")));

check("no console or page errors", errs.length === 0, errs.join(" | "));
await browser.close(); ghServer.close();
if (bad) { console.error(`!! ${bad} failed`); process.exit(1); }
console.log("all upload workflow checks passed");
