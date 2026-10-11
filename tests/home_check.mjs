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
check("no file -> default order, all visible, default sizes", ids(state.home) === DEFAULT && state.home.blocks.every(b => b.on) && state.home.blocks.find(b => b.id === "shelf").count === 10 && state.home.blocks.find(b => b.id === "latest").count === 8 && !state.homeCustom);
const g = cleanHome({ blocks: [{ id: "latest", on: false, title: "  <b>x</b>‮\u0000  y  ", count: "99" }, { id: "latest" }, { id: "bogus" }, null, "str", { id: "shelf", count: 1, series: [sid, sid, "nope", 5, null] }] });
check("order kept, duplicates/unknown/garbage dropped, missing blocks appended", ids(g) === "latest,shelf,news,schedule,about,sections", ids(g));
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
console.log(bad ? `${bad} FAILED` : "all home layout unit checks passed");
process.exit(bad ? 1 : 0);
