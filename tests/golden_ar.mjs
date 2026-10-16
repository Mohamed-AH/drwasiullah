/* "The Arabic site did not change": builds the site with the code at <ref> (default origin/main) and with the working tree, BOTH on the current data,
   and compares every generated file (HTML pages, sitemap, robots, redirects, data JSON, assets) byte for byte. The js/ folder is excluded (its sources
   change on purpose; behaviour is covered by e2e/xss/a11y).
     node tests/golden_ar.mjs [ref]        e.g. node tests/golden_ar.mjs HEAD   (before committing a refactor) */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
const ref = process.argv[2] || "origin/main", ROOT = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "golden-")), wt = path.join(tmp, "base");
const run = (cmd, args, opt = {}) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opt });
let bad = 0;
try {
  run("git", ["worktree", "add", "--detach", wt, ref]);
  for (const f of ["catalogue.json", "data"]) fs.cpSync(path.join(ROOT, "site", f), path.join(wt, "site", f), { recursive: true });   // same data for both builds
  const outA = path.join(tmp, "a"), outB = path.join(tmp, "b");
  const a = run("node", ["scripts/build.mjs"], { cwd: wt, env: { ...process.env, DIST: outA } });
  if (!fs.existsSync(outA)) fs.cpSync(path.join(wt, "dist"), outA, { recursive: true });                       // an older build script has no DIST switch
  const b = run("node", ["scripts/build.mjs"], { env: { ...process.env, DIST: outB } });
  const list = d => { const out = []; (function walk(p) { for (const e of fs.readdirSync(p, { withFileTypes: true })) { const f = path.join(p, e.name); e.isDirectory() ? walk(f) : out.push(path.relative(d, f)); } })(d); return out.filter(x => !x.startsWith("js" + path.sep)).sort(); };
  const fa = list(outA), fb = list(outB), sa = new Set(fa), sb = new Set(fb);
  const onlyA = fa.filter(x => !sb.has(x)), onlyB = fb.filter(x => !sa.has(x));
  const diff = fa.filter(x => sb.has(x) && !crypto.createHash("sha1").update(fs.readFileSync(path.join(outA, x))).digest().equals(crypto.createHash("sha1").update(fs.readFileSync(path.join(outB, x))).digest()));
  console.log(`baseline (${ref}): ${a.trim().split("\n").pop()}\ncurrent: ${b.trim().split("\n").pop()}`);
  const ok = !onlyA.length && !onlyB.length && !diff.length;
  if (!ok) bad++;
  console.log(ok ? `ok   Arabic output identical: ${fa.length} files (everything except js/) match byte for byte` : `FAIL differences — only in baseline: ${onlyA.slice(0, 5)} | only in current: ${onlyB.slice(0, 5)} | changed: ${diff.slice(0, 8)} (${diff.length} files)`);
} finally {
  try { run("git", ["worktree", "remove", "--force", wt]); } catch {}
  fs.rmSync(tmp, { recursive: true, force: true });
}
process.exit(bad ? 1 : 0);
