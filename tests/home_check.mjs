/* cleanHome() (site/js/core.js) and the home page it drives: defaults, hostile input, rendering. No browser needed. */
import fs from "node:fs";
import { init, state, cleanHome, HOME_BLOCKS } from "../site/js/core.js";
import { resolve } from "../site/js/views.js";
let bad = 0;
const check = (n, c, x = "") => { if (!c) bad++; console.log(`${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };
const rd = f => JSON.parse(fs.readFileSync(f, "utf8"));
const cat = rd("site/catalogue.json"), lib = rd("site/data/library.json");
const sid = cat.series[0].id;
const ids = h => h.blocks.map(b => b.id).join(",");
const DEFAULT = HOME_BLOCKS.map(b => b.id).join(",");

init(cat, lib, null, null, null, null);
check("no file -> default order, all visible, default sizes", ids(state.home) === DEFAULT && state.home.blocks.every(b => b.on === (b.id !== "featured")) && state.home.blocks.find(b => b.id === "shelf").count === 10 && state.home.blocks.find(b => b.id === "latest").count === 8 && !state.homeCustom);
const g = cleanHome({ blocks: [{ id: "latest", on: false, title: "  <b>x</b>‮\u0000  y  ", count: "99" }, { id: "latest" }, { id: "bogus" }, null, "str", { id: "shelf", count: 1, series: [sid, sid, "nope", 5, null] }] });
check("order kept, duplicates/unknown/garbage dropped, missing blocks appended", ids(g) === "latest,shelf,featured,news,schedule,about,sections", ids(g));
const L = g.blocks[0], S = g.blocks[1];
check("visibility + count clamp + title cleaned (controls and bidi stripped, spaces collapsed, capped)", L.on === false && L.count === 24 && L.title === "<b>x</b> y", JSON.stringify(L));
check("shelf: count clamped up, series de-duplicated and filtered to real ones", S.count === 3 && JSON.stringify(S.series) === JSON.stringify([sid]), JSON.stringify(S));
check("title capped at 60 characters", cleanHome({ blocks: [{ id: "news", title: "ا".repeat(500) }] }).blocks[0].title.length === 60);
for (const bad of [null, undefined, 5, "x", [], {}, { blocks: "no" }, { blocks: {} }]) if (ids(cleanHome(bad)) !== DEFAULT) { check("garbage document -> default", false, JSON.stringify(bad)); }

init(cat, lib, null, null, null, { blocks: [{ id: "latest", title: "<img src=x onerror=alert(1)>", count: 5 }, { id: "sections", on: false }, { id: "shelf", series: [sid], count: 4 }] });
const page = resolve("/");
const h = page.html;
check("custom heading is escaped in the page", h.includes("&lt;img src=x onerror=alert(1)&gt;") && !h.includes("<img src=x"), h.slice(0, 80));
check("hidden block absent, chosen order kept (latest before shelf), hero first", !h.includes('class="tiles"') && h.indexOf('class="hero"') < h.indexOf('class="grid"') && h.indexOf('class="grid"') < h.indexOf('class="shelf-wrap"'));
check("shelf shows exactly the chosen series; latest shows its count", (h.match(/class="spine/g) || []).length === 1 && (h.match(/<a class="card"/g) || []).length === 5, `${(h.match(/class="spine/g) || []).length} / ${(h.match(/<a class="card"/g) || []).length}`);
check("the page tells the browser to fetch home.json", state.homeCustom === true);

/* the featured series block: off by default, needs a real series, shows the lessons in order with a start button */
init(cat, lib, null, null, null, null);
check("featured is off by default and renders nothing; default page has no featured card", state.home.blocks.find(b => b.id === "featured").on === false && !resolve("/").html.includes('class="feat"'));
check("featured: unknown / non-string series dropped, a real one kept", cleanHome({ blocks: [{ id: "featured", on: true, series: "nope" }] }).blocks[0].series === "" && cleanHome({ blocks: [{ id: "featured", on: true, series: { a: 1 } }] }).blocks[0].series === "" && cleanHome({ blocks: [{ id: "featured", on: true, series: sid }] }).blocks[0].series === sid);
init(cat, lib, null, null, null, { blocks: [{ id: "featured", on: true, title: "<i>x</i>", series: sid }] });
const fh = resolve("/").html, fs0 = state.DB.series.find(x => x.id === sid), first = state.DB.lessons.filter(l => l.series === sid).sort((a, b) => (a.ord ?? 1e9) - (b.ord ?? 1e9) || (a.n ?? 1e9) - (b.n ?? 1e9) || a.o - b.o)[0];
check("featured on: card with series link, start button to its first lesson, custom heading escaped, before the other blocks", fh.includes('class="feat"') && fh.includes(`href="/series/${sid}/"`) && fh.includes(`class="btn" href="/lesson/${first.id}/"`) && fh.includes("&lt;i&gt;x&lt;/i&gt;") && !fh.includes("<i>x</i>") && fh.indexOf('class="feat"') < fh.indexOf('class="sched') + 1e9 && fh.indexOf('class="hero"') < fh.indexOf('class="feat"'), fh.slice(fh.indexOf('class="feat"'), fh.indexOf('class="feat"') + 200));
check("featured with no series chosen renders nothing", !(init(cat, lib, null, null, null, { blocks: [{ id: "featured", on: true }] }), resolve("/").html.includes('class="feat"')));

/* series flags: keepTitle shows the topic beside the number, related is shown from both sides, pin puts a series first in its section */
const ext = JSON.parse(JSON.stringify(lib));
ext.series.push({ id: "t-a", title: "سلسلة أ", sec: "duroos", unit: "المجلس", ordered: true, keepTitle: true, related: ["t-b"], pin: true }, { id: "t-b", title: "سلسلة ب", sec: "duroos", unit: "المجلس", ordered: true });
ext.lessons.push({ id: "aaaaaaaaaa1", title: "باب فضل التوحيد", series: "t-a", kind: "video", n: 1, date: "2026-12-01", hd: "1448-6-12" }, { id: "aaaaaaaaaa2", title: "باب الخوف من الشرك", series: "t-a", kind: "video", n: 2, date: "2026-12-02", hd: "1448-6-13" },
  { id: "bbbbbbbbbb1", title: "عنوان طويل ليوتيوب", series: "t-b", kind: "video", n: 1, date: "2026-12-03" });
init(cat, ext, null, null, null, null);
const sa = resolve("/series/t-a/").html, sb = resolve("/series/t-b/").html, sec = resolve("/section/duroos/").html;
check("keepTitle: rows show the topic, not «المجلس N»; other series keep the label", sa.includes("باب فضل التوحيد") && !sa.includes("المجلس ١") && sb.includes("المجلس ١") && !sb.includes("عنوان طويل ليوتيوب</span>"));
check("lesson page of a keepTitle series: number and topic in the title", resolve("/lesson/aaaaaaaaaa1/").title.includes("المجلس ١") && resolve("/lesson/aaaaaaaaaa1/").title.includes("باب فضل التوحيد"), resolve("/lesson/aaaaaaaaaa1/").title);
check("related: shown on both series pages, absent elsewhere", sa.includes('class="related"') && sa.includes('href="/series/t-b/"') && sb.includes('class="related"') && sb.includes('href="/series/t-a/"') && !resolve("/series/" + sid + "/").html.includes('class="related"'));
check("pin: the pinned series is the first card of its section page", sec.indexOf('href="/series/t-a/"') > 0 && sec.indexOf('class="card scard" href="/series/t-a/"') < sec.indexOf('class="card scard" href="/series/t-b/"') && sec.indexOf('class="card scard"') === sec.indexOf('class="card scard" href="/series/t-a/"'));
console.log(bad ? `${bad} FAILED` : "all home layout unit checks passed");
process.exit(bad ? 1 : 0);
