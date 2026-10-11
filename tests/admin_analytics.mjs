/* Phase 7: the analytics dashboard (HTTP). Run through tests/admin_run_all.sh, which first inserts known counters (see SEED below). */
import { num } from "../admin/src/html.mjs";
import { cell } from "../admin/src/analytics.mjs";
const BASE = process.env.BASE || "http://localhost:8791", VIDEO = process.env.VIDEO_ID;
let bad = 0;
const check = (name, cond, extra = "") => { if (!cond) bad++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + String(extra)}`); };
const A = "boss@example.com", E = "ed@example.com";
const get = (path, email = A) => fetch(BASE + path, { redirect: "manual", headers: { "x-dev-email": email } });
const html = async (path, email = A) => (await get(path, email)).text();
/* the four numbers of the cards, in order: plays, downloads, watches */
const cards = h => [...h.matchAll(/<div class="card"><b>([^<]*)<\/b><span>([^<]*)<\/span>/g)].map(m => ({ n: m[1], t: m[2] }));
const rows = (h, label) => { const m = new RegExp(`aria-label="${label}"[\\s\\S]*?</table>`).exec(h); return m ? [...m[0].matchAll(/<tr><td>([\s\S]*?)<\/tr>/g)].map(r => r[0]) : []; };

/* SEED (inserted by the shell script), relative to today in Makkah time:
   0d tadrib-0001 play 5, download 2 | -1d tadrib-0001 play 3, tadrib-0002 play 7 | -3d VIDEO watch 4 | -10d tadrib-0001 play 2
   -20d tadrib-0002 download 6, play 1 | -45d tadrib-0001 play 10 | -200d tadrib-0002 play 2 | -700d tadrib-0001 play 1 */
let h = await html("/analytics?range=7");
let c = cards(h);
check("7 days: plays 15, downloads 2, watches 4", c[0].n === num(15) && c[1].n === num(2) && c[2].n === num(4), JSON.stringify(c));
check("7 days: change vs the previous 7 days (15 vs 2 plays = +650%)", c[0].t.includes("+٦٥٠٪"), c[0].t);
check("downloads: previous period had none -> «جديد»", c[1].t.includes("جديد"), c[1].t);
h = await html("/analytics");
c = cards(h);
check("default = 30 days: plays 18, downloads 8, watches 4", c[0].n === num(18) && c[1].n === num(8) && c[2].n === num(4), JSON.stringify(c));
check("chart is an accessible SVG with a legend and a table behind it", /<svg [^>]*class="chart"[^>]*role="img" aria-label="[^"]+"/.test(h) && h.includes('class="legend"') && h.includes("<details><summary>عرض الجدول"));
check("daily bars for 30 days (one tooltip per day)", (h.match(/<g><title>/g) || []).length === 30, String((h.match(/<g><title>/g) || []).length));
check("no script tags on the page", !/<script/i.test(h.replace(/<script src="\/admin\.js"[^>]*><\/script>/g, "")));
h = await html("/analytics?range=90"); c = cards(h);
check("90 days: plays 28 (adds the one 45 days ago); bars still daily", c[0].n === num(28) && (h.match(/<g><title>/g) || []).length === 90, JSON.stringify(c));
h = await html("/analytics?range=365"); c = cards(h);
check("365 days: plays 30; weekly buckets", c[0].n === num(30) && /أسبوعيًا/.test(h) && (h.match(/<g><title>/g) || []).length > 40 && (h.match(/<g><title>/g) || []).length < 60, (h.match(/<g><title>/g) || []).length);
h = await html("/analytics?range=all"); c = cards(h);
check("all: plays 31; monthly buckets; no comparison text", c[0].n === num(31) && /شهريًا/.test(h) && !c[0].t.includes("عن الفترة السابقة"), JSON.stringify(c[0]));

h = await html("/analytics?range=7&series=tadrib"); c = cards(h);
check("series filter: only that series (watch 0, plays 15), no per-series table", c[0].n === num(15) && c[2].n === num(0) && !h.includes("<h2>حسب السلسلة"), JSON.stringify(c));
h = await html("/analytics?range=7&series=no-such-series");
check("unknown series ignored (all series shown)", cards(h)[2].n === num(4) && h.includes("<h2>حسب السلسلة"));
h = await html("/analytics?range=evil&event=evil&series=%22%3E%3Cscript%3E");
check("junk filters fall back to the defaults and are not echoed", cards(h)[0].n === num(18) && !h.includes("<script>alert") && !h.includes('"><script'));

h = await html("/analytics");
let top = rows(h, "أكثر الدروس");
check("top lessons by plays: tadrib-0001 (10) before tadrib-0002 (8)", top.length >= 2 && top[0].includes("/lessons/tadrib-0001") && top[1].includes("/lessons/tadrib-0002"), top.map(x => x.slice(0, 80)).join(" | "));
h = await html("/analytics?event=download"); top = rows(h, "أكثر الدروس");
check("top lessons by downloads: tadrib-0002 (6) first", top[0].includes("/lessons/tadrib-0002"), top[0]);
h = await html("/analytics?range=30"); const bs = rows(h, "حسب السلسلة");
check("by series: tadrib first with its share, the video series listed too", bs[0].includes("/analytics?series=tadrib") && /٪/.test(bs[0]) && bs.length >= 2, bs.map(x => x.slice(0, 90)).join(" | "));

/* CSV */
const r = await get("/analytics.csv?range=30"); const buf = new Uint8Array(await r.arrayBuffer()), bom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, t = new TextDecoder().decode(buf.slice(3));
check("CSV: UTF-8 with BOM and attachment headers", bom && r.headers.get("content-type").startsWith("text/csv") && /attachment; filename="analytics-/.test(r.headers.get("content-disposition")), `${bom} ${r.headers.get("content-type")} ${r.headers.get("content-disposition")}`);
check("CSV: header line", t.startsWith("lesson_id,title,series_id,series,plays,downloads,watches,from,to\r\n"), JSON.stringify(t.slice(0, 120)));
check("CSV: tadrib-0001 has 10 plays, 2 downloads, 0 watches; tadrib-0002 is listed", /\ntadrib-0001,.*,tadrib,.*,10,2,0,/.test(t) && /\ntadrib-0002,/.test(t), JSON.stringify(t.slice(0, 600)));
check("CSV honours the series filter", !(await (await get("/analytics.csv?range=30&series=tadrib")).text()).includes(VIDEO));
check("CSV cells that could run as formulas are neutralised, quotes escaped", cell("=HYPERLINK(1)") === "'=HYPERLINK(1)" && cell("+1") === "'+1" && cell('a"b,c') === '"a""b,c"' && cell("عادي") === "عادي");

/* permissions */
check("an editor gets 404 for the page and the CSV; the menu hides it", (await get("/analytics", E)).status === 404 && (await get("/analytics.csv", E)).status === 404 && !(await html("/", E)).includes('href="/analytics"'));
console.log(bad ? `${bad} FAILED` : "all analytics dashboard checks passed");
process.exit(bad ? 1 : 0);
