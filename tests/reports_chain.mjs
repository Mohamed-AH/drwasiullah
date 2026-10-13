/* The summary report's totals must equal what the site shows once the database is exported (Publish) and built.
   usage: node tests/reports_chain.mjs <dir with data/library.json, makkah.json, haram.json, overrides.json, order.json exported from the same database> */
import fs from "node:fs";
import path from "node:path";
import { init, state, applyOverrides, applyOrder, mergeLibraries } from "../site/js/core.js";
const dir = process.argv[2], BASE = process.env.BASE || "http://localhost:8791";
const rd = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const cat = rd("site/catalogue.json"), lib = mergeLibraries(rd(path.join(dir, "data/library.json")), rd(path.join(dir, "data/makkah.json")), rd(path.join(dir, "data/haram.json")));
const { cat: C, lib: L } = applyOrder(applyOverrides(cat, rd(path.join(dir, "data/overrides.json"))), lib, rd(path.join(dir, "data/order.json")));
const DB = init(C, L);
const want = { lessons: DB.lessons.length, series: DB.series.length, books: DB.books.length, files: DB.books.reduce((a, b) => a + (b.files || []).length, 0), hours: Math.round(DB.lessons.filter(l => l.kind === "video").reduce((a, l) => a + (l.duration || 0), 0) / 3600) };
const html = await (await fetch(BASE + "/reports/summary", { headers: { "x-dev-email": "boss@example.com" } })).text();
const toInt = s => +s.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[,٬]/g, "");
const cards = [...html.matchAll(/<div class="card"><b>([^<]*)<\/b><span>([^<]*)<\/span>/g)].map(m => ({ n: toInt(m[1]), t: m[2] }));
const got = { lessons: cards[0].n, series: cards[1].n, books: cards[2].n, files: toInt(/\(([٠-٩,]+) ملف\)/.exec(cards[2].t)[1]), hours: cards[3].n };
const ok = JSON.stringify(got) === JSON.stringify(want);
console.log(ok ? `ok   reports summary = site totals after Publish (${want.lessons} lessons / ${want.series} series / ${want.books} books / ${want.files} files / ${want.hours} h)` : `FAIL reports totals differ from the site: report ${JSON.stringify(got)} vs site ${JSON.stringify(want)}`);
process.exit(ok ? 0 : 1);
