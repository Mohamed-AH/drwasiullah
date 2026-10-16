/* i18n hygiene (no browser, no build):
   1. no Arabic text is hard-coded outside the dictionary (site/js/i18n.js) — lines that must contain Arabic (regexes, data keys) carry the marker comment i18n-allow;
   2. every dictionary key used in the code exists, and every dictionary key is used;
   3. every language module in site/i18n/ only uses keys that exist in the Arabic dictionary and has the same value kinds (string / function / array). */
import fs from "node:fs";
import path from "node:path";
import { AR } from "../site/js/i18n.js";
let bad = 0;
const check = (n, c, x = "") => { if (!c) bad++; console.log(`${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };

const FILES = ["site/js/views.js", "site/js/app.js", "site/js/live.js", "site/js/core.js", "site/shell.html", "scripts/build.mjs", "worker/index.js"];
const strip = src => src.replace(/\/\*(?!\s*i18n-allow)[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " ")).split("\n").map(l => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n");
const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
const leaks = [];
for (const f of FILES) strip(fs.readFileSync(f, "utf8")).split("\n").forEach((l, i) => { if (ARABIC.test(l) && !l.includes("i18n-allow")) leaks.push(`${f}:${i + 1}: ${l.trim().slice(0, 90)}`); });
check("no hard-coded Arabic text outside site/js/i18n.js", leaks.length === 0, "\n  " + leaks.join("\n  "));

/* keys */
const prefixes = new Set(Object.keys(AR).map(k => k.split(".")[0]));
const used = new Set(), src = FILES.map(f => fs.readFileSync(f, "utf8")).join("\n");
for (const m of src.matchAll(/["'`]([a-zA-Z]+(?:\.[a-zA-Z0-9$_{}]+)+)["'`]/g)) {
  const k = m[1];
  if (!prefixes.has(k.split(".")[0])) continue;
  if (k.includes("${")) { if (k === "sec.${s.id}.title" || k === "sec.${s.id}.desc") for (const id of ["duroos", "audio", "lectures", "khutab", "urdu", "books"]) used.add(k.replace("${s.id}", id)); continue; }
  used.add(k);
}
for (const m of src.matchAll(/["'`]([a-zA-Z]+)["'`]\s*\]/g)) if (Object.hasOwn(AR, m[1])) used.add(m[1]);                  // AR["weekdays"]
for (const k of ["lang.hint.msg", "lang.hint.go", "lang.hint.close"]) if (src.includes('D["' + k + '"]')) used.add(k);
for (const k of ["skip", "hours"]) if (new RegExp(`t\\(\\s*"${k}"`).test(src)) used.add(k);
const missing = [...used].filter(k => !Object.hasOwn(AR, k)), unused = Object.keys(AR).filter(k => !used.has(k));
check("every key used in the code exists in the Arabic dictionary", missing.length === 0, missing.join(", "));
check("every Arabic dictionary key is used somewhere", unused.length === 0, unused.join(", "));

/* other languages (site/i18n/<lang>.js) */
const dir = "site/i18n", kind = v => typeof v === "function" ? "fn" : Array.isArray(v) ? "array" : typeof v;
const mods = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith(".js")) : [];
for (const f of mods) {
  const d = (await import(path.resolve(dir, f))).default, extra = Object.keys(d).filter(k => !Object.hasOwn(AR, k)), wrong = Object.keys(d).filter(k => Object.hasOwn(AR, k) && kind(d[k]) !== kind(AR[k])), lack = Object.keys(AR).filter(k => !Object.hasOwn(d, k));
  check(`${f}: no unknown keys, same value kinds`, !extra.length && !wrong.length, `unknown: ${extra.join(",")} kinds: ${wrong.join(",")}`);
  check(`${f}: complete (all ${Object.keys(AR).length} keys)`, !lack.length, `missing: ${lack.join(", ")}`);
}
if (!mods.length) console.log("info no language modules yet (site/i18n/*.js)");
console.log(bad ? `${bad} FAILED` : `all i18n checks passed (${Object.keys(AR).length} keys)`);
process.exit(bad ? 1 : 0);
