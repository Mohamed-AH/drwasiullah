#!/usr/bin/env node
/* Batch audio ingest: a folder of lesson recordings -> optimised m4a in R2 -> lessons registered in D1 (pending in the portal until Publish).
   Runs on the owner's machine: needs Node 20+, ffmpeg + ffprobe on PATH, and `npx wrangler login` (R2 + D1 access). No keys, no npm packages.
   Runbook: docs/audio-batch.md.   Stages (each can be repeated; state is kept in the work folder, so a failure resumes where it stopped):
     scan      read the folder, parse the names, write manifest.csv (open it in Excel, fix what you like) and print warnings
     convert   ffmpeg: mono, AAC-LC 48 kbps, -16 LUFS two-pass, +faststart, tags stripped  -> <work>/m4a/<id>.m4a   (+ duration, sha256)
     upload    wrangler r2 object put  audio/<sha256[:16]>.m4a  (content-addressed, same keys as the portal)
     register  writes register.sql and runs it on D1 (asks for YES): inserts the lessons, replaces mis-numbered ones listed with --replace
     verify    checks D1 rows, R2 objects and the public URLs, writes report.csv
   Nothing is published by this tool: open the portal, look at «التغييرات غير المنشورة», listen to a few, then press Publish.
   Options: --dir <folder of recordings> --work <folder> (default tools/audio_batch_work) --only id,id --replace id,id --offline (scan without asking D1)
            --local <dir>  use a local wrangler state (tests) instead of the real Cloudflare account   --yes  do not ask for confirmation   --dry-run  (register) only write register.sql */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import readline from "node:readline/promises";
import { planBatch, checkExisting, registerSql, toCsv, fromCsv, rowFromCsv, MEDIA_BASE, SHEIKH, PART_AR } from "./audio_batch_lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DB = "drwasiullah", BUCKET = "drwasiullah-media", WIN = process.platform === "win32";
const SERIES_TITLE = { "sahih-muslim": "شرح صحيح مسلم", misc: "محاضرات وفوائد متفرقة" };

/* ───── tiny helpers ───── */
function parseArgs(argv) {
  const o = { _: [], flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { o._.push(a); continue; }
    const k = a.slice(2);
    if (["offline", "yes", "dry-run", "force"].includes(k)) o.flags.add(k); else o[k] = argv[++i];
  }
  return o;
}
const list = s => String(s || "").split(",").map(x => x.trim()).filter(Boolean);
const sha256 = file => new Promise((res, rej) => { const h = crypto.createHash("sha256"); fs.createReadStream(file).on("data", d => h.update(d)).on("end", () => res(h.digest("hex"))).on("error", rej); });
const mb = n => (n / 1048576).toFixed(1) + " MB";
const quote = a => WIN ? `"${String(a).replace(/"/g, '\\"')}"` : a;
function run(cmd, args, { input, allowFail = false } = {}) {                  // Windows: .cmd shims (npx) need a shell, so quote the arguments by hand
  const r = WIN && /^(npx|npm)$/.test(cmd) ? spawnSync(`${cmd}.cmd ${args.map(quote).join(" ")}`, { shell: true, encoding: "utf8", input, maxBuffer: 256 << 20 })
    : spawnSync(cmd, args, { encoding: "utf8", input, maxBuffer: 256 << 20 });
  if (r.error) throw new Error(`${cmd}: ${r.error.message}${r.error.code === "ENOENT" ? " (is it installed and on PATH?)" : ""}`);
  if (r.status !== 0 && !allowFail) throw new Error(`${cmd} ${args.slice(0, 4).join(" ")} … failed (exit ${r.status}):\n${(r.stderr || r.stdout || "").slice(-1500)}`);
  return r;
}

/* ───── wrangler (real account, or a local state folder for tests) ───── */
function wrangler(opts, args) { return run("npx", ["--yes", "wrangler@4", ...args], {}); }
const where = opts => opts.local ? ["--local", "--persist-to", path.resolve(opts.local)] : ["--remote"];
function d1(opts, sqlFile, { json = false } = {}) {
  const r = wrangler(opts, ["d1", "execute", DB, ...where(opts), "--file", sqlFile, ...(json ? ["--json"] : []), ...(opts.local ? [] : ["--yes"])]);
  if (!json) return r.stdout;
  const t = r.stdout, a = t.indexOf("["), b = t.lastIndexOf("]");
  if (a < 0) throw new Error("unexpected wrangler output:\n" + t.slice(-800));
  return JSON.parse(t.slice(a, b + 1));
}
function d1Select(opts, work, sql) {
  const f = path.join(work, "_query.sql"); fs.writeFileSync(f, sql + "\n");
  const res = d1(opts, f, { json: true });
  return (res[res.length - 1] && res[res.length - 1].results) || [];
}
const inList = ids => ids.map(i => `'${i.replace(/'/g, "''")}'`).join(",");

/* ───── manifest + state ───── */
const paths = work => ({ csv: path.join(work, "manifest.csv"), state: path.join(work, "state.json"), m4a: path.join(work, "m4a"), sql: path.join(work, "register.sql"), report: path.join(work, "report.csv"), existing: path.join(work, "existing.json") });
const loadState = P => fs.existsSync(P.state) ? JSON.parse(fs.readFileSync(P.state, "utf8")) : { byId: {} };
const saveState = (P, s) => fs.writeFileSync(P.state, JSON.stringify(s, null, 1));
function loadRows(P, only) {
  if (!fs.existsSync(P.csv)) throw new Error(`no ${P.csv}: run  node tools/audio_batch.mjs scan --dir <folder>  first`);
  const rows = [], bad = [];
  for (const o of fromCsv(fs.readFileSync(P.csv, "utf8"))) {
    const { row, errors } = rowFromCsv(o);
    if (errors.length) { bad.push(`${o.file}: ${errors.join(", ")}`); continue; }
    if (row.status === "skip") continue;
    if (only.length && !only.includes(row.id)) continue;
    rows.push(row);
  }
  if (bad.length) throw new Error("manifest.csv has errors:\n  " + bad.join("\n  "));
  const ids = new Set(); for (const r of rows) { if (ids.has(r.id)) throw new Error(`manifest.csv: id ${r.id} appears twice`); ids.add(r.id); }
  return rows;
}

/* ───── scan ───── */
async function scan(o) {
  if (!o.dir) throw new Error("--dir <folder with the recordings> is required");
  const P = paths(o.work); fs.mkdirSync(P.m4a, { recursive: true });
  if (fs.existsSync(P.csv) && !o.flags.has("force")) throw new Error(`${P.csv} already exists (it may contain your edits). Delete it or add --force to scan again.`);
  const files = fs.readdirSync(o.dir, { withFileTypes: true }).filter(e => e.isFile()).map(e => ({ file: e.name, size: fs.statSync(path.join(o.dir, e.name)).size }));
  const { rows, warnings, unmatched } = planBatch(files);
  let existing = [];
  if (!o.flags.has("offline")) {
    const series = [...new Set(rows.map(r => r.series))];
    existing = d1Select(o, o.work, `SELECT id, series_id, status, json_extract(data,'$.hd') AS hd, json_extract(data,'$.src') AS src FROM lessons WHERE series_id IN (${inList(series)});`);
    fs.writeFileSync(P.existing, JSON.stringify(existing, null, 1));
  }
  const { notes } = checkExisting(rows, existing, list(o.replace));
  fs.writeFileSync(P.csv, toCsv(rows));
  fs.writeFileSync(path.join(o.work, "source_dir.txt"), path.resolve(o.dir));
  const lessons = new Set(rows.map(r => r.series + r.seq)).size;
  console.log(`${files.length} files in the folder: ${rows.length} recognised (${lessons} lessons, ${rows.filter(r => r.part).length} are parts), ${unmatched.length} not recognised`);
  for (const f of unmatched) console.log("  ?? NOT RECOGNISED:", f);
  for (const w of [...warnings, ...notes]) console.log("  !!", w);
  const by = {}; for (const r of rows) by[r.action] = (by[r.action] || 0) + 1;
  console.log("  status:", Object.entries(by).map(([k, v]) => `${v} ${k}`).join(", "));
  for (const r of rows.filter(r => r.action === "conflict")) console.log(`  CONFLICT ${r.id}: ${r.note}`);
  console.log(`\nReview ${P.csv} (title, section, status…), then:  node tools/audio_batch.mjs convert --work "${o.work}"`);
  if (unmatched.length) process.exitCode = 2;
}

/* ───── convert ───── */
const probeDuration = f => Math.round(parseFloat(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).stdout) || 0);
function loudnormJson(src) {
  const r = run("ffmpeg", ["-hide_banner", "-nostats", "-i", src, "-vn", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"]);
  const t = r.stderr, a = t.lastIndexOf("{"), b = t.lastIndexOf("}");
  try { const j = JSON.parse(t.slice(a, b + 1)); return Number.isFinite(+j.input_i) ? j : null; } catch { return null; }
}
export function convertOne(src, dest, meta) {
  const ln = loudnormJson(src);
  const filter = (ln ? `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${ln.input_i}:measured_TP=${ln.input_tp}:measured_LRA=${ln.input_lra}:measured_thresh=${ln.input_thresh}:offset=${ln.target_offset}:linear=true`
    : "loudnorm=I=-16:TP=-1.5:LRA=11") + ",aresample=44100";                              // silent / unmeasurable files fall back to one-pass
  const tmp = dest + ".part.m4a";
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-vn", "-map_metadata", "-1", "-af", filter, "-ac", "1", "-c:a", "aac", "-b:a", "48k",
    "-fflags", "+bitexact", "-flags:a", "+bitexact", "-movflags", "+faststart", "-metadata", `title=${meta.title}`, "-metadata", `artist=${SHEIKH}`, "-metadata", `album=${meta.album}`, tmp]);
  fs.renameSync(tmp, dest);
  return { measured: ln ? +ln.input_i : null };
}
async function convert(o) {
  const P = paths(o.work), rows = loadRows(P, list(o.only)), state = loadState(P), srcDir = o.dir || fs.readFileSync(path.join(o.work, "source_dir.txt"), "utf8");
  fs.mkdirSync(P.m4a, { recursive: true });
  const todo = rows.filter(r => r.action !== "exists");
  let done = 0, saved = 0, skipped = 0;
  for (const r of todo) {
    const src = path.join(srcDir, r.file), st = fs.statSync(src), dest = path.join(P.m4a, `${r.id}.m4a`), cur = state.byId[r.id];
    if (cur && cur.srcSize === st.size && cur.srcMtime === Math.round(st.mtimeMs) && fs.existsSync(dest) && !o.flags.has("force")) { skipped++; continue; }
    const t0 = Date.now(), title = (r.title || "") + (r.part ? ` — ${PART_AR[r.part]}` : "");
    const info = convertOne(src, dest, { title, album: SERIES_TITLE[r.series] || r.series });
    const size = fs.statSync(dest).size, sha = await sha256(dest), duration = probeDuration(dest);
    state.byId[r.id] = { file: r.file, srcSize: st.size, srcMtime: Math.round(st.mtimeMs), size, sha, key: `audio/${sha.slice(0, 16)}.m4a`, duration, measuredLufs: info.measured, uploaded: false, registered: false };
    saveState(P, state); done++; saved += st.size - size;
    console.log(`  ${r.id}: ${mb(st.size)} -> ${mb(size)}, ${Math.round(duration / 60)} min  (${Math.round((Date.now() - t0) / 1000)} s)  [${done + skipped}/${todo.length}]`);
  }
  console.log(`converted ${done}, already done ${skipped}; saved ${mb(saved)} against the originals.  Next:  node tools/audio_batch.mjs upload --work "${o.work}"`);
}

/* ───── upload ───── */
async function upload(o) {
  const P = paths(o.work), rows = loadRows(P, list(o.only)), state = loadState(P);
  let n = 0;
  for (const r of rows.filter(r => r.action !== "exists")) {
    const s = state.byId[r.id];
    if (!s) throw new Error(`${r.id} is not converted yet (run convert first)`);
    if (s.uploaded && !o.flags.has("force")) continue;
    const file = path.join(P.m4a, `${r.id}.m4a`);
    if (!fs.existsSync(file) || fs.statSync(file).size !== s.size) throw new Error(`${file} changed since it was converted: run convert --force`);
    // the key is the file's own hash, so putting the same bytes again is harmless and a different file can never take its place
    wrangler(o, ["r2", "object", "put", `${BUCKET}/${s.key}`, "--file", file, "--content-type", "audio/mp4", "--cache-control", "public, max-age=31536000, immutable", ...where(o)]);
    s.uploaded = true; saveState(P, state); n++;
    console.log(`  uploaded ${r.id} -> ${s.key} (${mb(s.size)})`);
  }
  console.log(`uploaded ${n}.  Next:  node tools/audio_batch.mjs register --work "${o.work}"` + (list(o.replace).length ? ` --replace ${o.replace}` : ""));
}

/* ───── register ───── */
async function register(o) {
  const P = paths(o.work), rows = loadRows(P, list(o.only)), state = loadState(P);
  const series = [...new Set(rows.map(r => r.series))];
  const existing = d1Select(o, o.work, `SELECT id, series_id, status, json_extract(data,'$.hd') AS hd, json_extract(data,'$.src') AS src FROM lessons WHERE series_id IN (${inList(series)});`);
  const { replaceExisting, notes } = checkExisting(rows, existing, list(o.replace));
  notes.forEach(n => console.log("  !!", n));
  const conflicts = rows.filter(r => r.action === "conflict");
  if (conflicts.length) { for (const r of conflicts) console.log(`  CONFLICT ${r.id}: ${r.note}`); throw new Error(`${conflicts.length} conflict(s): nothing was written. Fix manifest.csv or use --replace <id> for the mis-numbered record.`); }
  const ready = rows.filter(r => r.action !== "exists" && r.action !== "skip");
  for (const r of ready) { const s = state.byId[r.id]; if (!s || !s.uploaded) throw new Error(`${r.id} is not uploaded yet (run convert and upload first)`); r.key = s.key; r.duration = s.duration; }
  if (!ready.length && !replaceExisting.length) { console.log("nothing to register: every lesson in the manifest is already in the database."); return; }
  const sql = registerSql(ready, replaceExisting);
  fs.writeFileSync(P.sql, sql);
  console.log(`${ready.filter(r => r.action === "new").length} new lesson(s), ${ready.filter(r => r.action === "replace").length} replacing a mis-numbered one, ${rows.filter(r => r.action === "exists").length} already registered (skipped).`);
  for (const e of replaceExisting) console.log(`  will DELETE ${e.id} (dated ${e.hd}, ${e.src}) — its audit entry keeps the old record`);
  if (o.flags.has("dry-run")) { console.log(`dry run: SQL written to ${P.sql}`); return; }
  if (!o.flags.has("yes") && !process.stdin.isTTY) throw new Error(`this terminal cannot ask a question (Git Bash / mintty). Read the plan above and ${P.sql}, then run the same command again with --yes   (or start it as: winpty node tools/audio_batch.mjs ...)`);
  if (!o.flags.has("yes")) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const a = await rl.question(`Write this to ${o.local ? "the LOCAL test database" : "the LIVE database (nothing goes public until you press Publish)"}? Type YES: `); rl.close();
    if (a.trim() !== "YES") { console.log("cancelled, nothing was written."); return; }
  }
  d1(o, P.sql);
  for (const r of ready) state.byId[r.id].registered = true;
  saveState(P, state);
  console.log(`registered. Open the portal: the lessons are under the unpublished changes. Listen to a few, then Publish.   Next:  node tools/audio_batch.mjs verify --work "${o.work}"`);
}

/* ───── verify ───── */
async function verify(o) {
  const P = paths(o.work), rows = loadRows(P, list(o.only)), state = loadState(P);
  const got = d1Select(o, o.work, `SELECT id, status, n, json_extract(data,'$.src') AS src, json_extract(data,'$.duration') AS duration, json_extract(data,'$.hd') AS hd, json_extract(data,'$.date') AS date FROM lessons WHERE id IN (${inList(rows.map(r => r.id))});`);
  const byId = new Map(got.map(g => [g.id, g]));
  const out = ["id,status,hd,date,duration_s,size_mb,url,problem"]; let bad = 0;
  for (const r of rows) {
    const s = state.byId[r.id] || {}, g = byId.get(r.id), problems = [];
    if (!g) problems.push("not in D1");
    else {
      if (g.src !== `${MEDIA_BASE}/${s.key}`) problems.push(`D1 points to ${g.src}`);
      if (g.hd !== r.hd) problems.push(`date ${g.hd} != ${r.hd}`);
    }
    if (s.key && !o.local) {
      try { const h = await fetch(`${MEDIA_BASE}/${s.key}`, { method: "HEAD" }); if (!h.ok) problems.push(`R2 URL answers ${h.status}`); else if (+h.headers.get("content-length") !== s.size) problems.push("R2 size differs from the local file"); }
      catch (e) { problems.push("R2 URL unreachable: " + e.message); }
    } else if (s.key && o.local) {
      const t = path.join(os.tmpdir(), `ab-${process.pid}.m4a`); const rr = run("npx", ["--yes", "wrangler@4", "r2", "object", "get", `${BUCKET}/${s.key}`, "--file", t, "--local", "--persist-to", path.resolve(o.local)], { allowFail: true });
      if (rr.status !== 0 || !fs.existsSync(t) || fs.statSync(t).size !== s.size) problems.push("R2 object missing or different size (local)"); fs.rmSync(t, { force: true });
    } else problems.push("not uploaded");
    if (problems.length) bad++;
    out.push([r.id, g ? g.status : "", r.hd, r.date, s.duration || "", s.size ? (s.size / 1048576).toFixed(1) : "", s.key ? `${MEDIA_BASE}/${s.key}` : "", problems.join("; ")].map(v => /[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(","));
  }
  fs.writeFileSync(P.report, "﻿" + out.join("\r\n") + "\r\n");
  const tot = rows.reduce((a, r) => a + ((state.byId[r.id] || {}).duration || 0), 0);
  console.log(`${rows.length - bad}/${rows.length} lessons verified (${Math.round(tot / 3600 * 10) / 10} hours of audio). Report: ${P.report}`);
  if (bad) { console.log(`${bad} with problems — see the last column of the report.`); process.exitCode = 1; }
}

/* ───── main ───── */
export async function main(argv) {
  const o = parseArgs(argv), cmd = o._[0];
  o.work = path.resolve(o.work || path.join(HERE, "audio_batch_work")); fs.mkdirSync(o.work, { recursive: true });
  const cmds = { scan, convert, upload, register, verify };
  if (!cmds[cmd]) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 16).map(l => l.replace(/^\/\* ?|^ {3}/, "")).join("\n")); process.exitCode = cmd ? 1 : 0; return; }
  try { await cmds[cmd](o); } catch (e) { console.error("\nSTOPPED: " + e.message); process.exitCode = process.exitCode || 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main(process.argv.slice(2));
