/* «إضافة من يوتيوب» in the admin portal: parser (unit), preview/add (HTTP, with a stub standing in for YouTube on :8796) and the series flags form.
   Run through tests/admin_run_all.sh (dev Worker started with --var YT_BASE:http://localhost:8796 --var YT_API_BASE:... --var YOUTUBE_API_KEY:testkey). */
import http from "node:http";
import { parseInput, parseHeading, videoId, hijriInTitle, isoSeconds, fetchMeta } from "../admin/src/youtube.mjs";
const BASE = process.env.BASE || "http://localhost:8791";
let bad = 0;
const check = (name, cond, extra = "") => { if (!cond) bad++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + String(extra)}`); };
const A = "boss@example.com", E = "ed@example.com", H = { "sec-fetch-site": "same-origin" };
const get = (path, email = A) => fetch(BASE + path, { redirect: "manual", headers: { "x-dev-email": email } });
const html = async (path, email = A) => (await get(path, email)).text();
const post = (path, pairs, email = A, hdr = H) => { const p = new URLSearchParams(); for (const [k, v] of pairs) p.append(k, v); return fetch(BASE + path, { method: "POST", redirect: "manual", body: p, headers: { "x-dev-email": email, ...hdr } }); };
const loc = r => r.headers.get("location") || "";

/* ---- unit: the parser ---- */
const IDS = ["aaaaaaaaaa1", "bbbbbbbbbb2", "cccccccccc3", "dddddddddd4", "eeeeeeeeee5"];
const TOP = ["باب فضل التوحيد وما يكفر من الذنوب", "باب من حقق التوحيد دخل الجنة بغير حساب", "باب الخوف من الشرك", "باب الدعاء إلى شهادة أن لا إله إلا الله", "باب تفسير التوحيد وشهادة أن لا إله إلا الله"];
const text = `سماع كتاب التوحيد — دورة التأسيس العقدي
المجلس الأول (${TOP[0]})
https://youtu.be/${IDS[0]}?si=xyz
المجلس الثاني (${TOP[1]})
https://www.youtube.com/watch?v=${IDS[1]}&t=5s
المجلس الثالث: ${TOP[2]}
https://www.youtube.com/live/${IDS[2]}
المجلس الرابع
(${TOP[3]})
https://m.youtube.com/watch?v=${IDS[3]}
المجلس الخامس - ${TOP[4]} https://youtube.com/shorts/${IDS[4]}
https://youtu.be/${IDS[0]}`;
const p = parseInput(text);
check("parser: five links, duplicates dropped, headings -> numbers and topics", p.length === 5 && p.every((x, i) => x.id === IDS[i] && x.n === i + 1 && x.topic === TOP[i]), JSON.stringify(p));
check("parser: bare links without headings have no number; junk and foreign hosts ignored", JSON.stringify(parseInput("https://youtu.be/zzzzzzzzzz9\nhttps://evil.example/watch?v=yyyyyyyyyy8\nhttps://youtu.be/short")) === '[{"id":"zzzzzzzzzz9"}]');
check("parser: Arabic-Indic digits, teens and numbers", parseHeading("المجلس ٣ (أ)").n === 3 && parseHeading("المجلس الحادي عشر").n === 11 && parseHeading("المجلس الثاني عشر: ب").n === 12 && parseHeading("مجلس") === null && parseHeading("المجلس الأخير") === null);
check("parser: at most 40 videos", parseInput(Array.from({ length: 60 }, (_, i) => `https://youtu.be/${String(i).padStart(11, "x")}`).join("\n")).length === 40);
check("videoId: forms and rejects", videoId("https://www.youtube.com/embed/" + IDS[0]) === IDS[0] && videoId("javascript:alert(1)") === "" && videoId("https://youtube.com/watch?v=short") === "");
check("hijri in title: 12-06-1448 / ١٢-٦-١٤٤٨ ok, impossible dates not", hijriInTitle("x 12-06-1448") === "1448-6-12" && hijriInTitle("١٢-٦-١٤٤٨") === "1448-6-12" && hijriInTitle("40-13-1448") === "" && hijriInTitle("بلا تاريخ") === "");
check("iso duration", isoSeconds("PT1H2M3S") === 3723 && isoSeconds("PT45M") === 2700 && isoSeconds("junk") === 0);
{ const f = async url => String(url).includes("/oembed") ? (String(url).includes("bad") ? { ok: false, status: 404 } : { ok: true, json: async () => ({ title: "t", author_name: "a" }) }) : { ok: false };
  const m = await fetchMeta(["good", "bad"], {}, f); check("fetchMeta: failures are per video and never throw", m.good.title === "t" && m.bad.err, JSON.stringify(m)); }

/* ---- stub YouTube ---- */
const seen = [];
const stub = http.createServer((req, res) => {
  seen.push(req.url); const u = new URL(req.url, "http://x"); res.setHeader("content-type", "application/json");
  if (u.pathname === "/oembed") { const id = (u.searchParams.get("url") || "").split("v=")[1]; const i = IDS.indexOf(id); if (i < 0) { res.statusCode = 404; return res.end("{}"); }
    return res.end(JSON.stringify({ title: `سماع كتاب التوحيد ${12 + i}-06-1448 (${i + 1})`, author_name: "قناة اختبار" })); }
  if (u.pathname === "/youtube/v3/videos") return res.end(JSON.stringify({ items: u.searchParams.get("id").split(",").map(id => ({ id, contentDetails: { duration: "PT1H2M" }, snippet: { publishedAt: "2026-12-01T20:00:00Z" } })) }));
  res.statusCode = 404; res.end("{}");
}).listen(8796);

/* ---- HTTP ---- */
check("menu entry and page for editors and admins", (await html("/", E)).includes('href="/youtube"') && (await html("/youtube", E)).includes('action="/youtube/preview"') && (await get("/youtube")).status === 200);
check("cross-site and unknown-role posts refused", (await post("/youtube/preview", [["text", text]], A, { "sec-fetch-site": "cross-site" })).status === 403 && (await post("/youtube/preview", [["text", text]], "nobody@example.com")).status !== 200);
check("no link in the text: friendly message, nothing written", (await (await post("/youtube/preview", [["text", "لا شيء هنا"]])).text()).includes("لم أجد أي رابط"));
const pr = await (await post("/youtube/preview", [["text", text]])).text();
check("preview lists the five videos with number, topic, Hijri date from the title and minutes from the API", IDS.every((id, i) => pr.includes(`name="inc_${id}"`) && pr.includes(`name="n_${id}"`) && new RegExp(`name="n_${id}"[^>]*value="${i + 1}"`).test(pr) && pr.includes(`value="${TOP[i]}"`) && pr.includes(`value="1448-6-${12 + i}"`)) && (pr.match(/name="dur_[^"]*"[^>]*value="62"/g) || []).length === 5, pr.slice(0, 300));
check("preview shows the channel name and asks for the confirmation", pr.includes("قناة اختبار") && pr.includes('name="confirm"'));
check("the stub saw one oEmbed call per video and one batched API call", seen.filter(u => u.startsWith("/oembed")).length === 5 && seen.filter(u => u.startsWith("/youtube/v3/videos")).length === 1 && seen.some(u => u.includes("key=testkey")));

const rows = o => { const q = [["mode", o.mode || "new"], ["status", "published"]]; if (!o.noConfirm) q.push(["confirm", "1"]);
  if ((o.mode || "new") === "new") q.push(["new_id", o.id ?? "tawheed-test"], ["new_sec", "duroos"], ["new_unit", "المجلس"], ["new_title", "سماع كتاب التوحيد (اختبار)"], ["new_description", "وصف"], ["new_keep", "1"], ["new_ordered", "1"]); else q.push(["series", o.series]);
  IDS.forEach((id, i) => { q.push(["ids", id]); if (!(o.skip || []).includes(id)) q.push(["inc_" + id, "1"]); q.push(["n_" + id, String(i + 1)], ["title_" + id, TOP[i]], ["hd_" + id, o.hd ?? `1448-6-${12 + i}`], ["dur_" + id, "62"]); }); return q; };
check("without the confirmation nothing is added", loc(await post("/youtube/add", rows({ noConfirm: true }))).includes("err=invalid"));
check("nothing ticked is refused", loc(await post("/youtube/add", rows({ skip: IDS }))).includes("err=yt_none"));
check("an impossible Hijri date is refused", loc(await post("/youtube/add", rows({ hd: "1448-6-31" }))).includes("err=bad_date"));
check("a bad series id is refused", loc(await post("/youtube/add", rows({ id: "Bad Id" }))).includes("err=invalid") && loc(await post("/youtube/add", rows({ mode: "existing", series: "no-such" }))).includes("err=invalid"));
check("an existing series id is refused for a new series", loc(await post("/youtube/add", rows({ id: "tadrib" }))).includes("err=series_exists"));
check("a title that is only spaces is refused", loc(await post("/youtube/add", (() => { const q = rows({}); const i = q.findIndex(x => x[0] === "title_" + IDS[2]); q[i] = [q[i][0], "   "]; return q; })())).includes("err=invalid"));
check("nothing was written by the refused attempts", !(await html("/series")).includes("tawheed-test"));

const ok = await post("/youtube/add", rows({}));
check("add: new series + five lessons in one go", loc(ok).includes("/series/tawheed-test") && loc(ok).includes("ok=yt_added"), loc(ok));
const sp = await html("/series/tawheed-test");
check("the series page in the portal lists the five lessons as published", IDS.every(id => sp.includes(id)) && (sp.match(/منشور/g) || []).length >= 5, sp.length);
const lp = await html("/lessons/" + IDS[2]);
check("the lesson edit form shows number, title and Hijri date as saved", /name="n"[^>]*value="3"/.test(lp) && lp.includes(TOP[2]) && /1448/.test(lp));
check("adding the same videos again adds nothing (existing ones are skipped)", loc(await post("/youtube/add", rows({ mode: "existing", series: "tawheed-test" }))).includes("err=yt_none"));
const au = await html("/audit");
check("audit log: series.add and lesson.add with source youtube", au.includes("series.add") && au.includes("lesson.add") && au.includes("youtube"));

/* ---- series flags in the edit form ---- */
let ep = await html("/series/tawheed-test/edit");
check("edit form: keepTitle ticked (set at creation), pin not, related list present without itself", /name="keepTitle"[^>]*checked/.test(ep) && !/name="pin"[^>]*checked/.test(ep) && /name="related" value="tadrib"/.test(ep) && !/name="related" value="tawheed-test"/.test(ep));
const ver = /name="ver" value="([0-9a-f]+)"/.exec(ep)[1];
const save = o => post("/series/save", [["id", "tawheed-test"], ["ver", o.ver || ver], ["title", "سماع كتاب التوحيد (اختبار)"], ["sec", "duroos"], ["unit", "المجلس"], ["ordered", "1"], ["status", "published"], ...(o.keepTitle ? [["keepTitle", "1"]] : []), ...(o.pin ? [["pin", "1"]] : []), ...(o.related || []).map(r => ["related", r])]);
check("save flags: pin + related (unknown and self ids dropped)", loc(await save({ keepTitle: true, pin: true, related: ["tadrib", "nope", "tawheed-test"] })).includes("ok=saved"));
ep = await html("/series/tawheed-test/edit");
check("flags shown after saving", /name="pin"[^>]*checked/.test(ep) && /name="related" value="tadrib"[^>]*checked/.test(ep) && !/name="related" value="nope"/.test(ep));
check("stale token refused", loc(await save({ ver: "0".repeat(16), keepTitle: true })).includes("err=conflict"));
check("saving the same flags says nothing changed", loc(await save({ ver: /name="ver" value="([0-9a-f]+)"/.exec(ep)[1], keepTitle: true, pin: true, related: ["tadrib"] })).includes("nochange"));

stub.close();
console.log(bad ? `${bad} FAILED` : "all YouTube-add checks passed");
process.exit(bad ? 1 : 0);
