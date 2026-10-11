/* Unit test of applyOverrides (site/js/core.js): the editors' patches on top of the YouTube catalogue. No server needed. */
import { applyOverrides } from "../site/js/core.js";

let bad = 0;
const check = (name, cond, extra = "") => { if (!cond) bad++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + JSON.stringify(extra)}`); };
const cat = () => ({ updated: "2026-10-11", channel: "c", subjects: ["s"], series: [{ id: "muslim", title: "م", sec: "duroos", description: "d" }, { id: "nuzha", title: "ن", sec: "duroos" }],
  lessons: [{ id: "a", title: "A", series: "muslim", n: 1, date: "2026-01-01", duration: 5 }, { id: "b", title: "B", series: "muslim", date: "2026-01-02", section: "كتاب" }, { id: "c", title: "C", series: "nuzha", n: 3, date: "2026-01-03" }] });

check("no overrides: the same catalogue", JSON.stringify(applyOverrides(cat(), null)) === JSON.stringify(cat()) && JSON.stringify(applyOverrides(cat(), {})) === JSON.stringify(cat()));
let r = applyOverrides(cat(), { lessons: { a: { title: "A2", n: 9, section: "باب" }, b: { n: 4, section: null } } });
check("title, number and section patched; null removes a field", r.lessons[0].title === "A2" && r.lessons[0].n === 9 && r.lessons[0].section === "باب" && r.lessons[1].n === 4 && !("section" in r.lessons[1]));
check("untouched fields (date, duration, id) stay", r.lessons[0].date === "2026-01-01" && r.lessons[0].duration === 5 && r.lessons[0].id === "a");
r = applyOverrides(cat(), { lessons: { a: { series: "nuzha" } } });
check("a lesson can move to another series", r.lessons[0].series === "nuzha" && r.series.length === 2);
r = applyOverrides(cat(), { lessons: { b: { hidden: true } } });
check("hidden lesson is removed", r.lessons.map(l => l.id).join() === "a,c");
r = applyOverrides(cat(), { series: { muslim: { hidden: true } } });
check("hidden series removes the series and all its lessons", r.series.map(s => s.id).join() === "nuzha" && r.lessons.map(l => l.id).join() === "c");
r = applyOverrides(cat(), { series: { nuzha: { title: "نزهة", description: "وصف", sec: "audio" } } });
check("series title, description and section patched", r.series[1].title === "نزهة" && r.series[1].description === "وصف" && r.series[1].sec === "audio");
r = applyOverrides(cat(), { lessons: { a: { title: "", n: -3, series: "../evil", hd: "x", date: "no", id: "hijack", duration: 1, src: "https://evil" } , zzz: { title: "ghost" } }, series: { muslim: { id: "x", count: 5, sec: "NOT VALID!" } } });
check("invalid values and unknown fields are ignored (id, duration, src can never be patched)", r.lessons[0].title === "A" && r.lessons[0].n === 1 && r.lessons[0].series === "muslim" && r.lessons[0].id === "a" && r.lessons[0].duration === 5 && !("src" in r.lessons[0]) && r.series[0].sec === "duroos" && r.series[0].id === "muslim", r);
check("a patch for a lesson that no longer exists is harmless", applyOverrides(cat(), { lessons: { zzz: { title: "x" } } }).lessons.length === 3);
check("garbage documents are harmless", [applyOverrides(cat(), "x"), applyOverrides(cat(), { lessons: [] }), applyOverrides(cat(), { lessons: { a: null, b: 5 } }), applyOverrides(cat(), { lessons: { __proto__: { title: "p" } } })].every(x => x.lessons.length === 3));
check("the original object is not modified", (() => { const c = cat(), before = JSON.stringify(c); applyOverrides(c, { lessons: { a: { title: "X", hidden: false } }, series: { muslim: { title: "Y" } } }); return JSON.stringify(c) === before; })());
if (bad) { console.error(`!! ${bad} failed`); process.exit(1); }
console.log("all override checks passed");
