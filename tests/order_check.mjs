/* applyOrder (site/js/core.js): the editors' saved display order of a series. Unit rules + a real build with an order.json (run from the repo root). */
import { applyOrder } from "../site/js/core.js";
import { execFileSync } from "node:child_process";
import fs from "node:fs";

let bad = 0;
const check = (name, cond, extra = "") => { if (!cond) bad++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + JSON.stringify(extra)}`); };
const cat = () => ({ updated: "x", series: [{ id: "v", title: "V", sec: "duroos" }], lessons: [{ id: "v1", series: "v", n: 1 }, { id: "v2", series: "v", n: 2 }, { id: "v3", series: "v", n: 3 }, { id: "o1", series: "o", n: 1 }] });
const lib = () => ({ series: [{ id: "a", title: "A", sec: "audio" }, { id: "o", title: "O", sec: "audio" }], lessons: [{ id: "a1", series: "a" }, { id: "a2", series: "a" }, { id: "a3", series: "a", n: 2 }, { id: "a4", series: "a" }], books: [] });
const ords = (r, s) => [...r.cat.lessons, ...r.lib.lessons].filter(l => l.series === s).map(l => `${l.id}:${l.ord ?? "-"}`).join(" ");

let r = applyOrder(cat(), lib(), null);
check("no order file: nothing changes", JSON.stringify(r.cat) === JSON.stringify(cat()) && JSON.stringify(r.lib) === JSON.stringify(lib()));
r = applyOrder(cat(), lib(), {});
check("empty order: nothing changes", !r.cat.lessons.some(l => "ord" in l) && !r.cat.series.some(s => s.manual));
r = applyOrder(cat(), lib(), { v: ["v3", "v1", "v2"] });
check("YouTube series: positions follow the list", ords(r, "v") === "v1:2 v2:3 v3:1", ords(r, "v"));
check("the series is flagged manual; others are untouched", r.cat.series[0].manual === true && !r.lib.series.some(s => s.manual) && !r.lib.lessons.some(l => "ord" in l));
r = applyOrder(cat(), lib(), { a: ["a4", "a2"] });
check("library series: listed first, then the unlisted by number then original position", ords(r, "a") === "a1:4 a2:2 a3:3 a4:1", ords(r, "a"));
r = applyOrder(cat(), lib(), { a: ["a2", "zzz", "a2", "o1", 5, null, "a1"] });
check("unknown ids, ids of another series, duplicates and junk are ignored", ords(r, "a") === "a1:2 a2:1 a3:3 a4:4", ords(r, "a"));
check("lesson of another series is not renumbered by someone else's list", ords(r, "o") === "o1:-");
r = applyOrder(cat(), lib(), { v: ["v2", "v1"], a: ["a3"], nope: ["x"], o: "not a list" });
check("several series at once; missing series and non-lists are skipped", ords(r, "v") === "v1:2 v2:1 v3:3" && ords(r, "a") === "a1:2 a2:3 a3:1 a4:4" && ords(r, "o") === "o1:-" && r.cat.series[0].manual && r.lib.series[0].manual && !r.lib.series[1].manual);
check("a lesson moved into the series by a patch counts (membership is by series id at build time)", (() => { const c = cat(); c.lessons[3].series = "v"; const x = applyOrder(c, lib(), { v: ["o1", "v1"] }); return ords(x, "v") === "v1:2 v2:3 v3:4 o1:1"; })());
check("inputs are not modified", (() => { const c = cat(), l = lib(), b = JSON.stringify([c, l]); applyOrder(c, l, { v: ["v3"], a: ["a2"] }); return JSON.stringify([c, l]) === b; })());
check("__proto__ / inherited keys are ignored", (() => { const o = JSON.parse('{"__proto__": ["v1"], "constructor": ["v1"]}'); return !applyOrder(cat(), lib(), o).cat.series[0].manual; })());

/* real build */
const FILE = "site/data/order.json";
const had = fs.existsSync(FILE), keep = had ? fs.readFileSync(FILE) : null;
try {
  const ids = JSON.parse(fs.readFileSync("site/data/library.json", "utf8")).lessons.filter(l => l.series === "tadrib").map(l => l.id);
  const order = ids.slice().reverse();                       // tadrib in reverse
  fs.writeFileSync(FILE, JSON.stringify({ tadrib: order }));
  execFileSync("node", ["scripts/build.mjs"], { stdio: "ignore" });
  const built = JSON.parse(fs.readFileSync("dist/data/library.json", "utf8")).lessons.filter(l => l.series === "tadrib");
  check("build: lessons of the series carry ord in dist/data/library.json", built.length === ids.length && built.every(l => Number.isInteger(l.ord)) && built.find(l => l.id === order[0]).ord === 1, built.slice(0, 2));
  const first = fs.readFileSync(`dist/lesson/${order[0]}/index.html`, "utf8"), last = fs.readFileSync(`dist/lesson/${order[order.length - 1]}/index.html`, "utf8");
  check("build: previous/next buttons follow the saved order (first of the list has no previous, a next)", /rel="next"/.test(first) && !/rel="prev"/.test(first) && /rel="prev"/.test(last) && !/rel="next"/.test(last));
  const series = fs.readFileSync("dist/series/tadrib/index.html", "utf8");
  check("build: the series page lists the first of the saved order first", series.indexOf(`/lesson/${order[0]}/`) < series.indexOf(`/lesson/${order[1]}/`) && series.indexOf(`/lesson/${order[1]}/`) < series.indexOf(`/lesson/${order[order.length - 1]}/`));
  check("order.json itself is not published", !fs.existsSync("dist/data/order.json"));
  const other = fs.readFileSync("dist/series/nuzha-audio/index.html", "utf8");
  check("a series without a saved order keeps its number order", other.indexOf("/lesson/nuzha-audio-0001/") < other.indexOf("/lesson/nuzha-audio-0002/"));
} finally {
  if (had) fs.writeFileSync(FILE, keep); else fs.rmSync(FILE, { force: true });
  execFileSync("node", ["scripts/build.mjs"], { stdio: "ignore" });
}
if (bad) { console.error(`!! ${bad} failed`); process.exit(1); }
console.log("all order checks passed");
