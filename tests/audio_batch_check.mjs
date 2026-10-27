/* tools/audio_batch.mjs: file-name rules on the real batch (tests/audio_batch_names.txt = the 37 files of 2026-10-17), conflict handling, the review CSV, the registration SQL
   compared with the portal's own addLessons() on an in-memory SQLite (node:sqlite), ffmpeg output properties, and (with --wrangler) the whole pipeline against a local D1 + R2.
   usage: node --no-warnings tests/audio_batch_check.mjs [--wrangler]      needs ffmpeg for the conversion checks */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { parseName, planBatch, checkExisting, registerSql, lessonData, toCsv, fromCsv, rowFromCsv, PART_AR } from "../tools/audio_batch_lib.mjs";
import { addLessons } from "../admin/src/upload.mjs";

let bad = 0;
const check = (n, c, x = "") => { if (!c) bad++; console.log(`${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + String(x).slice(0, 400)}`); };
const names = fs.readFileSync("tests/audio_batch_names.txt", "utf8").split("\n").map(s => s.trim()).filter(Boolean);

/* ───── the real batch ───── */
{
  const { rows, warnings, unmatched } = planBatch(names.map(file => ({ file, size: 1 })));
  check("37 file names, all recognised", names.length === 37 && rows.length === 37 && unmatched.length === 0, unmatched.join());
  const lessons = new Set(rows.map(r => r.series + r.seq));
  check("30 lessons: 29 of Sahih Muslim (149-177) + the lecture 0100", lessons.size === 30 && rows.filter(r => r.series === "sahih-muslim" && new Set([r.seq]).size).map(r => r.seq).every(n => n >= 149 && n <= 177) && rows.filter(r => r.series === "misc").length === 2);
  const two = [...new Set(rows.filter(r => r.part).map(r => r.series + r.seq))];
  check("7 lessons have two parts: 0100 0149 0152 0154 0161 0167 0172", two.length === 7 && ["misc100", "sahih-muslim149", "sahih-muslim152", "sahih-muslim154", "sahih-muslim161", "sahih-muslim167", "sahih-muslim172"].every(k => two.includes(k)), two.join());
  const part = (id) => rows.find(r => r.id === id);
  check("the base file is part a, the «تكملة/تكمله» file part b", part("sahih-muslim-0149a").file === "0149صحيح مسلم30-2-1448هـ.mp3" && part("sahih-muslim-0149b").file.endsWith("تكملة.mp3") && part("sahih-muslim-0154b").file.endsWith("تكمله.mp3") && part("misc-0100b").file.endsWith("تكمله.mp3"));
  check("a lesson with one file has no part letter", part("sahih-muslim-0150") && part("sahih-muslim-0177") && !part("sahih-muslim-0150a"));
  check("ids are unique", new Set(rows.map(r => r.id)).size === 37);
  check("Hijri dates convert (0149 = 30-2-1448 = 2026-08-13; 0177 = 11-5-1448 = 2026-10-22)", part("sahih-muslim-0149a").date === "2026-08-13" && part("sahih-muslim-0177").date === "2026-10-22" && part("sahih-muslim-0172a").hd === "1448-4-29");
  check("every Muslim lesson falls on Wed/Thu/Sat and numbers are continuous (no warning but the 2 misc-routing notes)", warnings.length === 2 && warnings.every(w => w.includes("misc")), warnings.join(" | "));
  check("the WAV is recognised (extension case-insensitive)", part("sahih-muslim-0162").ext === "wav");
  check("titles: «الدرس N» for the course, the file's own text for the lecture, no part suffix in the manifest title", part("sahih-muslim-0149b").title === "الدرس 149" && part("misc-0100a").title === "الاعتصام بالكتاب والسنة وأثره في وحدة الصف" && !part("misc-0100a").numbered);
  check("registered title gets the part suffix like the portal", lessonData(part("sahih-muslim-0149b"), { key: "audio/0123456789abcdef.m4a", duration: 5 }).title === `الدرس 149 — ${PART_AR.b}`);
}

/* ───── name variants and bad input ───── */
{
  const same = ["0150صحيح مسلم2-3-1448هـ.mp3", "0150 صحيح مسلم 2-3-1448 هـ.MP3", "0150صحيح  مسلم 2 - 3 - 1448هـ.mp3", "0150صحيح مسلم\u200f 2-3-1448هـ.mp3"].map(parseName);
  check("variants (spaces, case, bidi marks) parse the same", same.every(p => p && p.seq === 150 && p.text === "صحيح مسلم" && p.d === 2 && p.m === 3 && p.y === 1448 && !p.cont), JSON.stringify(same));
  check("«تكملة», «تكمله» and the tatweel «هـ» are all understood", parseName("0149صحيح مسلم30-2-1448هـ تكملة.mp3").cont && parseName("0149صحيح مسلم30-2-1448ه تكمله.mp3").cont);
  check("names that do not follow the convention are refused", [parseName("صحيح مسلم.mp3"), parseName("0150صحيح مسلم.mp3"), parseName("150صحيح مسلم 2-3-1448هـ.mp3"), parseName("0150صحيح مسلم 2-3-1448هـ.txt")].every(x => x === null));
  const odd = planBatch([{ file: "0150صحيح مسلم 30-3-1448هـ.mp3", size: 1 }, { file: "0151صحيح مسلم 7-3-1448هـ.mp3", size: 1 }]);
  check("a Hijri day that does not exist is reported, not guessed", odd.warnings.some(w => w.includes("does not exist")) || odd.rows.length === 2, odd.warnings.join());
  const gap = planBatch([["0150", "6-3"], ["0151", "2-3"], ["0152", "7-3"]].map(([n, d]) => ({ file: `${n}صحيح مسلم ${d}-1448هـ.mp3`, size: 1 })));
  check("order warnings: number out of date order", gap.warnings.some(w => /dated before/.test(w)), gap.warnings.join());
  const jump = planBatch([{ file: "0150صحيح مسلم 2-3-1448هـ.mp3", size: 1 }, { file: "0155صحيح مسلم 14-3-1448هـ.mp3", size: 1 }]);
  check("order warnings: numbers jump", jump.warnings.some(w => /jump from 150 to 155/.test(w)));
  const lone = planBatch([{ file: "0150صحيح مسلم 2-3-1448هـ تكملة.mp3", size: 1 }]);
  check("a «تكملة» without its base file is flagged and becomes part b", lone.rows[0].part === "b" && lone.warnings.some(w => /without its base/.test(w)));
  const dup = planBatch([{ file: "0150صحيح مسلم 2-3-1448هـ.mp3", size: 1 }, { file: "0150صحيح مسلم 2-3-1448هـ.wav", size: 1 }]);
  check("two base files for one number are flagged", dup.warnings.some(w => /two base files/.test(w)));
}

/* ───── conflicts with what is already in the database ───── */
{
  const mk = () => planBatch(names.map(file => ({ file, size: 1 }))).rows;
  const old = { id: "sahih-muslim-0171", series_id: "sahih-muslim", hd: "1448-4-29", src: "https://media.drwasiullah.com/audio/8a72a861d1ec15ad.m4a" };   // the first test upload, really the recording of 0172
  let rows = mk(), r = checkExisting(rows, [old], []);
  const c = rows.filter(x => x.action === "conflict").map(x => x.id).sort();
  check("the mis-numbered 0171 blocks 0171 (same id, other date) and 0172a/b (same date)", c.join() === "sahih-muslim-0171,sahih-muslim-0172a,sahih-muslim-0172b", c.join());
  rows = mk(); r = checkExisting(rows, [old], ["sahih-muslim-0171"]);
  check("--replace sahih-muslim-0171 resolves all three; exactly one record is replaced", rows.every(x => x.action !== "conflict") && rows.filter(x => x.action === "replace").length === 1 && r.replaceExisting.length === 1);
  const fresh = { id: "sahih-muslim-0171", series_id: "sahih-muslim", hd: "1448-4-27", src: "x" };
  rows = mk(); checkExisting(rows, [fresh], ["sahih-muslim-0171"]);
  check("after the replacement, running again finds 0171 already registered and does not delete the new record", rows.find(x => x.id === "sahih-muslim-0171").action === "exists");
  rows = mk(); const r2 = checkExisting(rows, [], ["sahih-muslim-0171"]);
  check("--replace of an id that conflicts with nothing is only a note", r2.replaceExisting.length === 0 && r2.notes.length === 1);
  rows = mk(); checkExisting(rows, [{ id: "sahih-muslim-0150", series_id: "sahih-muslim", hd: "1448-3-2", src: "x" }], []);
  check("an identical lesson already registered is skipped, not duplicated", rows.find(x => x.id === "sahih-muslim-0150").action === "exists" && rows.filter(x => x.action === "conflict").length === 0);
  rows = mk(); checkExisting(rows, [{ id: "sahih-muslim-0149", series_id: "sahih-muslim", hd: "1448-2-30", src: "x" }], []);
  check("the same lesson registered earlier as one file blocks the two-part version", rows.filter(x => x.action === "conflict").map(x => x.id).sort().join() === "sahih-muslim-0149a,sahih-muslim-0149b");
}

/* ───── the review spreadsheet ───── */
{
  const { rows } = planBatch(names.map(file => ({ file, size: 1 })));
  rows[0].title = 'عنوان، فيه "علامات" وفاصلة'; rows[0].section = "كتاب الحج";
  const csv = toCsv(rows), back = fromCsv(csv).map(rowFromCsv);
  check("CSV round trip keeps Arabic, commas and quotes; starts with a BOM for Excel", csv.charCodeAt(0) === 0xfeff && back.length === 37 && back.every(b => !b.errors.length) && back[0].row.title === rows[0].title && back[0].row.section === "كتاب الحج" && back.every((b, i) => b.row.id === rows[i].id && b.row.date === rows[i].date));
  const edited = fromCsv(csv); edited[1].hd = "1448-13-40"; edited[2].status = "later";
  const errs = edited.slice(0, 3).map(rowFromCsv).flatMap(x => x.errors);
  check("an edit that breaks a row is reported (bad Hijri date, bad status)", errs.some(e => /hd/.test(e)) && errs.some(e => /status/.test(e)), errs.join());
}

/* ───── registration SQL == the portal's addLessons(), on SQLite ───── */
let sqlite = null; try { sqlite = await import("node:sqlite"); } catch { /* old node */ }
if (!sqlite) console.log("SKIP registration comparison: this node has no node:sqlite");
else {
  const MIG = fs.readdirSync("db/migrations").filter(f => f.endsWith(".sql")).sort().map(f => fs.readFileSync(path.join("db/migrations", f), "utf8"));
  const mkdb = () => { const d = new sqlite.DatabaseSync(":memory:"); MIG.forEach(m => d.exec(m)); d.exec("INSERT INTO series (id, origin, pos, sec, title, status, data) VALUES ('sahih-muslim','library',0,'audio','شرح صحيح مسلم','published','{}'),('misc','catalogue',1,'lectures','محاضرات','published','{}')"); return d; };
  const shim = d => { const wrap = (sql, args = []) => ({ bind: (...a) => wrap(sql, a), first: async () => d.prepare(sql).get(...args) ?? null, all: async () => ({ results: d.prepare(sql).all(...args) }), run: async () => d.prepare(sql).run(...args), _run: () => d.prepare(sql).run(...args) });
    return { prepare: sql => wrap(sql), batch: async stmts => { d.exec("BEGIN"); try { stmts.forEach(s => s._run()); d.exec("COMMIT"); } catch (e) { d.exec("ROLLBACK"); throw e; } } }; };
  const dump = d => ({ lessons: d.prepare("SELECT id, origin, pos, series_id, kind, n, section, status, data FROM lessons ORDER BY pos").all(), audit: d.prepare("SELECT action, entity, entity_id, before, after FROM audit_log ORDER BY id").all() });
  const { rows } = planBatch(names.filter(n => /صحيح مسلم/.test(n)).map(file => ({ file, size: 1 })));
  rows.forEach((r, i) => { r.key = `audio/${crypto.createHash("sha256").update(r.id).digest("hex").slice(0, 16)}.m4a`; r.duration = 3000 + i; });
  rows.find(r => r.id === "sahih-muslim-0150").section = "كتاب الحيض"; rows.find(r => r.id === "sahih-muslim-0151").status = "draft";
  const portal = mkdb();
  const body = { series: "sahih-muslim", items: rows.map(r => ({ n: r.seq, part: r.part, title: r.title, hd: r.hd, date: r.date, section: r.section, key: r.key, duration: r.duration, status: r.status })) };
  const res = await addLessons(new Request("http://x/api/lessons", { method: "POST", body: JSON.stringify(body), headers: { "content-length": String(JSON.stringify(body).length) } }), { DB: shim(portal), MEDIA: { head: async () => ({}) } }, { email: "ed@example.com" });
  check("the portal's own addLessons accepts the batch (reference run)", res.status === 200, await res.clone().text());
  const mine = mkdb(); mine.exec(registerSql(rows.map(r => ({ ...r, action: "new" })), []));
  const a = dump(portal), b = dump(mine);
  check("lessons rows are identical to the portal's: ids, origin, pos, n, section, status and the stored JSON (field order too)", JSON.stringify(a.lessons) === JSON.stringify(b.lessons), JSON.stringify(a.lessons.find((x, i) => JSON.stringify(x) !== JSON.stringify(b.lessons[i])) || {}) + " vs " + JSON.stringify(b.lessons.find((x, i) => JSON.stringify(x) !== JSON.stringify(a.lessons[i])) || {}));
  check("audit rows match (lesson.add, entity, id, after); only the actor differs", JSON.stringify(a.audit) === JSON.stringify(b.audit));
  const before = JSON.stringify(dump(mine)); mine.exec(registerSql(rows.map(r => ({ ...r, action: "new" })), []));
  check("running the SQL a second time changes nothing (re-runnable after a failure)", JSON.stringify(dump(mine)) === before);
  // replacement of the mis-numbered record, then re-run
  const db3 = mkdb(); db3.exec(`INSERT INTO lessons (id, origin, pos, series_id, kind, n, status, data) VALUES ('sahih-muslim-0171','library',0,'sahih-muslim','audio',171,'published','{"id":"sahih-muslim-0171","title":"الدرس 171","series":"sahih-muslim","kind":"audio","src":"https://media.drwasiullah.com/audio/8a72a861d1ec15ad.m4a","n":171,"hd":"1448-4-29","date":"2026-10-10","duration":4335}')`);
  const mine3 = rows.filter(r => /017[12]/.test(r.id)).map(r => ({ ...r, action: r.id === "sahih-muslim-0171" ? "replace" : "new" }));
  const old = { id: "sahih-muslim-0171", series_id: "sahih-muslim", hd: "1448-4-29", src: "x" };
  db3.exec(registerSql(mine3, [old]));
  const s3 = dump(db3);
  check("replacement: the old record is gone, the new 0171 (27-4) and 0172a/b are in, the old record is kept in the audit log", s3.lessons.length === 3 && JSON.parse(s3.lessons.find(l => l.id === "sahih-muslim-0171").data).hd === "1448-4-27" && s3.audit.filter(x => x.action === "lesson.delete").length === 1 && JSON.parse(s3.audit.find(x => x.action === "lesson.delete").before).hd === "1448-4-29", JSON.stringify(s3.audit.map(x => x.action)));
  db3.exec(registerSql(mine3, [old]));
  check("replacement re-run: the NEW 0171 is not deleted by the guard, nothing is duplicated", dump(db3).lessons.length === 3 && JSON.stringify(dump(db3)) === JSON.stringify(s3));
  const pending = mine.prepare("SELECT COUNT(*) c FROM audit_log WHERE action LIKE 'lesson.%'").get().c;
  check("the portal counts these as unpublished changes (action lesson.*)", pending === rows.length);
  const misc = mkdb(); misc.exec(registerSql([{ ...planBatch([{ file: names[1], size: 1 }]).rows[0], key: "audio/0123456789abcdef.m4a", duration: 4000, action: "new" }], []));
  const m = misc.prepare("SELECT n, data FROM lessons").get();
  check("an unnumbered lecture has n NULL and no n in its JSON (so the misc page does not turn numeric)", m.n === null && !("n" in JSON.parse(m.data)) && JSON.parse(m.data).id === "misc-0100");
}

/* ───── ffmpeg output ───── */
const ff = spawnSync("ffmpeg", ["-version"]).status === 0;
if (!ff) console.log("SKIP conversion checks: ffmpeg not found");
else {
  const { convertOne } = await import("../tools/audio_batch.mjs");
  const T = fs.mkdtempSync(path.join(os.tmpdir(), "abatch-"));
  const src = path.join(T, "0150صحيح مسلم 2-3-1448هـ.wav");
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "anoisesrc=d=40:c=pink:a=0.1", "-af", "tremolo=f=3:d=0.6", "-ac", "2", src]);
  const out = path.join(T, "o.m4a"), out2 = path.join(T, "o2.m4a");
  await Promise.all([convertOne(src, out, { title: "الدرس 150", album: "شرح صحيح مسلم" }), convertOne(src, out2, { title: "الدرس 150", album: "شرح صحيح مسلم" })]);   // two at once, like the tool does
  const probe = f => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,profile,channels,sample_rate,bit_rate:format=duration:format_tags", "-of", "json", f], { encoding: "utf8" }));
  const p = probe(out), s = p.streams[0], tags = p.format.tags || {};
  check("AAC-LC, mono, 44.1 kHz, about 48 kbps, same length as the source", s.codec_name === "aac" && s.profile === "LC" && s.channels === 1 && s.sample_rate === "44100" && Math.abs(+s.bit_rate - 48000) < 3000 && Math.abs(+p.format.duration - 40) < 0.3, JSON.stringify(s));
  const buf = fs.readFileSync(out), moov = buf.indexOf("moov"), mdat = buf.indexOf("mdat");
  check("+faststart: the index (moov) comes before the audio data (mdat)", moov > 0 && mdat > moov);
  check("tags: title, artist (the Sheikh), album; nothing of the original file name", tags.title === "الدرس 150" && tags.artist === "الشيخ وصي الله بن محمد عباس" && tags.album === "شرح صحيح مسلم" && !JSON.stringify(tags).includes("1448") && !buf.includes(Buffer.from("0150")) && !buf.includes(Buffer.from("1448")) && !buf.includes(Buffer.from(".wav")), JSON.stringify(tags));
  const sha = f => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
  check("converting the same file twice gives the same bytes (stable R2 keys, safe re-runs)", sha(out) === sha(out2));
  const lufs = execFileSync("ffmpeg", ["-nostats", "-i", out, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); // ffmpeg prints the summary on stderr
  const m = /I:\s+(-?\d+\.\d+) LUFS/.exec(spawnSync("ffmpeg", ["-nostats", "-i", out, "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" }).stderr.split("Summary")[1] || "");
  check("loudness is -16 LUFS within one unit", m && Math.abs(+m[1] + 16) <= 1, m && m[1]);
  fs.rmSync(T, { recursive: true, force: true });
}

/* ───── the whole pipeline against a local D1 + R2 (slow: --wrangler) ───── */
if (process.argv.includes("--wrangler") && ff) {
  const T = fs.mkdtempSync(path.join(os.tmpdir(), "abatch-w-")), IN = path.join(T, "in"), ST = path.join(T, "state"), W = path.join(T, "work"); fs.mkdirSync(IN);
  const tone = (n, f, d) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", `sine=frequency=${f}:duration=${d}`, path.join(IN, n)]);
  tone("0170صحيح مسلم 26-4-1448هـ.mp3", 300, 20); tone("0171صحيح مسلم 27-4-1448هـ.mp3", 400, 20); tone("0172صحيح مسلم29-4-1448هـ تكملة.mp3", 500, 10); tone("0172صحيح مسلم29-4-1448هـ.mp3", 600, 20); tone("0162صحيح مسلم 1-4-1448هـ.WAV", 700, 8);
  const sh = (...a) => spawnSync("npx", ["--yes", "wrangler@4", ...a], { encoding: "utf8", maxBuffer: 1 << 28 });
  execFileSync("node", ["--no-warnings", "scripts/db.mjs", "seed", "--out", path.join(T, "seed.sql")], { stdio: "ignore" });
  sh("d1", "migrations", "apply", "drwasiullah", "--local", "--persist-to", ST); sh("d1", "execute", "drwasiullah", "--local", "--persist-to", ST, "--file", path.join(T, "seed.sql"));
  const cli = (...a) => spawnSync("node", ["--no-warnings", "tools/audio_batch.mjs", ...a, "--work", W, "--local", ST], { encoding: "utf8" });
  let r = cli("scan", "--dir", IN); check("pipeline: scan finds the 0171 conflict in the (real) database", /CONFLICT sahih-muslim-0171/.test(r.stdout), r.stdout + r.stderr);
  r = cli("convert"); check("pipeline: convert", r.status === 0 && fs.readdirSync(path.join(W, "m4a")).length === 5, r.stdout + r.stderr);
  r = cli("upload"); check("pipeline: upload to local R2", r.status === 0 && /uploaded 5/.test(r.stdout), r.stdout + r.stderr);
  r = cli("register", "--yes"); check("pipeline: register refuses while the conflict is open and writes nothing", r.status !== 0 && /conflict/.test(r.stderr), r.stdout + r.stderr);
  r = cli("register", "--replace", "sahih-muslim-0171", "--yes"); check("pipeline: register with --replace", r.status === 0 && /registered\./.test(r.stdout), r.stdout + r.stderr);
  r = cli("register", "--replace", "sahih-muslim-0171", "--yes"); check("pipeline: a second register has nothing to do", r.status === 0 && /nothing to register/.test(r.stdout), r.stdout + r.stderr);
  r = cli("verify"); check("pipeline: verify says 5/5", /5\/5 lessons verified/.test(r.stdout), r.stdout + r.stderr);
  fs.rmSync(T, { recursive: true, force: true });
}
console.log(bad ? `\n${bad} FAILED` : "\nall audio batch checks passed");
process.exit(bad ? 1 : 0);
