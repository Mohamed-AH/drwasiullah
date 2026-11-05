#!/usr/bin/env node
/* Publish guard: refuses a Publish whose export would remove a large share of the site by accident.
   Run by .github/workflows/publish.yml after the database export and before the commit:

     node scripts/publish_guard.mjs [--ref HEAD] [--allow]

   Compares the counts in the freshly exported data files (working tree) with the committed ones (git <ref>).
   A count may fall by a small amount or a small share; anything bigger fails, unless --allow (workflow input allow_drop). */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const FILES = ["data/library.json", "data/makkah.json", "data/haram.json"];
export const LISTS = { lessons: { minDrop: 10, ratio: 0.05 }, series: { minDrop: 3, ratio: 0.2 }, books: { minDrop: 3, ratio: 0.2 } };

export function counts(files) {                      // files: { "data/library.json": parsed | null, ... } -> { "data/library.json lessons": n, ..., "lessons (all files)": n }
  const out = {}; let total = 0;
  for (const [name, doc] of Object.entries(files)) {
    if (!doc || typeof doc !== "object") continue;
    for (const k of Object.keys(LISTS)) if (Array.isArray(doc[k])) { out[`${name} ${k}`] = doc[k].length; if (k === "lessons") total += doc[k].length; }
  }
  out["lessons (all files)"] = total;
  return out;
}

/* -> list of problems (empty = fine). A metric missing from `before` is new and never a problem. */
export function compare(before, after) {
  const bad = [];
  for (const [key, was] of Object.entries(before)) {
    const now = Object.prototype.hasOwnProperty.call(after, key) ? after[key] : 0;
    const kind = key.endsWith("lessons") || key === "lessons (all files)" ? "lessons" : key.endsWith("series") ? "series" : "books";
    const { minDrop, ratio } = LISTS[kind], drop = was - now;
    if (drop >= minDrop && drop > was * ratio) bad.push({ key, was, now, drop });
  }
  return bad;
}

function fromGit(ref, name) {
  try { return JSON.parse(execFileSync("git", ["show", `${ref}:site/${name}`], { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64e6 }).toString("utf8")); } catch { return null; }
}
function fromDisk(name) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "site", name), "utf8")); } catch { return null; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), ref = a.includes("--ref") ? a[a.indexOf("--ref") + 1] : "HEAD", allow = a.includes("--allow");
  const before = {}, after = {};
  for (const n of FILES) { before[n] = fromGit(ref, n); after[n] = fromDisk(n); }
  const b = counts(before), c = counts(after), bad = compare(b, c);
  console.log("publish guard: " + Object.keys(b).map(k => `${k}: ${b[k]} -> ${c[k] ?? 0}`).join(" | "));
  if (!bad.length) { console.log("publish guard: ok"); process.exit(0); }
  const lines = bad.map(x => `  ${x.key}: ${x.was} -> ${x.now} (-${x.drop})`).join("\n");
  if (allow) { console.log(`publish guard: large drop ALLOWED by allow_drop:\n${lines}`); process.exit(0); }
  console.error(`::error::Publish stopped: this export would remove a lot of content from the site:\n${lines}\nIf this is intended (for example a whole series was hidden on purpose), run this workflow by hand (GitHub > Actions > Publish from the admin portal > Run workflow) and tick allow_drop. Otherwise check the portal's audit log (السجل) and fix or restore the database first (docs/restore-guide.md).`);
  process.exit(1);
}
