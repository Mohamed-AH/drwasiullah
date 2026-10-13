/* Phase 8: reports (HTTP). Run through tests/admin_run_all.sh, which first inserts the REPORT FIXTURES below (see tests/reports_fixtures.sql). */
const BASE = process.env.BASE || "http://localhost:8791";
let bad = 0;
const check = (name, cond, extra = "") => { if (!cond) bad++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + String(extra).slice(0, 300)}`); };
const A = "boss@example.com", E = "ed@example.com";
const get = (path, email = A) => fetch(BASE + path, { redirect: "manual", headers: { "x-dev-email": email } });
const html = async (path, email = A) => (await get(path, email)).text();
const csvOf = async path => { const r = await get(path); const b = new Uint8Array(await r.arrayBuffer()); return { r, bom: b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf, t: new TextDecoder().decode(b.slice(3)) }; };

/* permissions */
const paths = ["/reports", "/reports/summary", "/reports/quality", "/reports/series?id=tadrib", "/reports/lessons.csv", "/reports/series.csv", "/reports/books.csv"];
const eds = await Promise.all(paths.map(p => get(p, E)));
check("an editor gets 404 for every report and CSV; menu hides it", eds.every(r => r.status === 404) && !(await html("/", E)).includes('href="/reports"') && (await html("/")).includes('href="/reports"'), eds.map(r => r.status).join());

let h = await html("/reports");
check("index links the reports and offers a series picker", ["/reports/summary", "/reports/quality", "/reports/lessons.csv", "/reports/books.csv", "/reports/series.csv"].every(x => h.includes(`href="${x}"`)) && /<select name="id">[\s\S]*value="tadrib"/.test(h));

h = await html("/reports/summary");
check("summary: cards, sections table, series table, Hijri notes; print button + script only", /class="card"/.test(h) && h.includes("المحتوى بحسب الأقسام") && h.includes("السلاسل العلمية") && h.includes("data-print") && h.includes("تاريخ نشر المقطع") && (h.match(/<script/g) || []).length === 1);
check("summary: the empty series fixture is NOT counted, tadrib is", !h.includes("سلسلة فارغة للتقرير") && h.includes("شرح تدريب الراوي"));
check("summary: dates are Hijri only (no Gregorian year in the series periods)", !/\b20[12]\d\b/.test(h.replace(/<[^>]*>/g, "")), "found a Gregorian year");

h = await html("/reports/quality");
const hq = await html("/reports/quality?series=tadrib");
check("quality: all seven sections present", ["أرقام دروس مكررة", "دروس بلا رقم في سلسلة مرقّمة", "دروس بلا تاريخ", "دروس صوتية بلا مدة", "مواد غير منشورة", "سلاسل منشورة بلا دروس منشورة", "كتب بلا ملفات"].every(x => h.includes(x)));
check("quality (one series): undated fixture listed with its series, title escaped", hq.includes("&lt;b&gt;بلا تاريخ") && !hq.includes("<b>بلا تاريخ") && /href="\/lessons\/rpt-nodate"/.test(hq) && hq.includes("كل السلاسل"));
check("quality: duplicate number (1) in tadrib reports both lessons", /الرقم ١:/.test(hq) && hq.includes('href="/lessons/rpt-dup"') && hq.includes('href="/lessons/tadrib-0001"'));
check("quality: draft fixture listed with its status tag; empty series listed", hq.includes('href="/lessons/rpt-draft"') && /tag-draft/.test(hq) && h.includes("سلسلة فارغة للتقرير") && !hq.includes("سلسلة فارغة للتقرير"));

h = await html("/reports/series?id=tadrib");
check("series report: fixtures — published ones shown, draft hidden, no status column", h.includes("&lt;b&gt;بلا تاريخ") && !h.includes("مسودة تقرير") && !h.includes("<th>الحالة</th>"));
const ha = await html("/reports/series?id=tadrib&all=1");
check("with ?all=1 the draft appears with a status column", ha.includes("مسودة تقرير") && ha.includes("<th>الحالة</th>") && ha.includes("يشمل غير المنشور"));
check("quality for an unknown series falls back to all series", (await html("/reports/quality?series=no-such")).includes("سلسلة فارغة للتقرير"));
check("unknown series: 404", (await get("/reports/series?id=no-such")).status === 404 && (await get("/reports/series")).status === 404);

/* CSV */
let c = await csvOf("/reports/lessons.csv");
check("lessons.csv: BOM, header, attachment", c.bom && c.r.headers.get("content-type").startsWith("text/csv") && /attachment; filename="lessons\.csv"/.test(c.r.headers.get("content-disposition")) && c.t.startsWith("id,series_id,series,n,section,kind,status,title,hijri_date,gregorian_date,origin,duration_seconds\r\n"), c.t.slice(0, 200));
check("lessons.csv: every status included; formula-looking title neutralised", /\nrpt-draft,tadrib,[^\n]*,draft,/.test(c.t) && c.t.includes("'=SUM(1)") && !/,=SUM\(1\)/.test(c.t));
check("lessons.csv: covers the whole library (thousands of rows)", c.t.split("\r\n").length > 3000, c.t.split("\r\n").length);
c = await csvOf("/reports/lessons.csv?series=tadrib");
check("lessons.csv?series= keeps only that series", c.t.split("\r\n").filter(Boolean).slice(1).every(l => l.includes(",tadrib,")) && c.t.includes("rpt-nodate") && /filename="lessons-tadrib\.csv"/.test(c.r.headers.get("content-disposition")));
c = await csvOf("/reports/series.csv");
check("series.csv: header and a tadrib row with counts; the empty series has 0 published", c.bom && c.t.startsWith("id,title,section,status,lessons_published,lessons_total,video_hours,first_hijri,last_hijri") && /\ntadrib,/.test(c.t) && /\nrpt-empty,[^\n]*,published,0,0,/.test(c.t), c.t.slice(0, 300));
c = await csvOf("/reports/books.csv");
check("books.csv: header and rows", c.bom && c.t.startsWith("id,title,group,status,files") && c.t.split("\r\n").length > 20);

const css = await (await get("/admin.css")).text();
check("print stylesheet hides the menu and buttons", /@media print\{header\.top,\.noprint/.test(css));
console.log(bad ? `${bad} FAILED` : "all report checks passed");
process.exit(bad ? 1 : 0);
