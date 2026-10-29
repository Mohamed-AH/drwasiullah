/* tools/audio_batch.mjs: file-name rules on the real batch (tests/audio_batch_names.txt = the 37 files of 2026-10-17), conflict handling, the review CSV, the registration SQL
   compared with the portal's own addLessons() on an in-memory SQLite (node:sqlite), ffmpeg output properties, and (with --wrangler) the whole pipeline against a local D1 + R2.
   usage: node --no-warnings tests/audio_batch_check.mjs [--wrangler]      needs ffmpeg for the conversion checks */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { parseName, planBatch, checkExisting, registerSql, lessonData, toCsv, fromCsv, rowFromCsv, PART_AR, parseTime, analyzeProfile, parseRms, parseRanges, fmtRanges, mergeRanges, mapToSource, removeFilter, findQuietRuns } from "../tools/audio_batch_lib.mjs";
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

/* ───── silence detection and trimming (pure part) ───── */
{
  check("parseTime: 35:10, 1:05:30, 95, 95.5, empty, garbage", parseTime("35:10") === 2110 && parseTime("1:05:30") === 3930 && parseTime("95") === 95 && parseTime("95.5") === 95.5 && parseTime("") === null && Number.isNaN(parseTime("abc")) && Number.isNaN(parseTime("1:2:3:4")));
  const speech = n => Array.from({ length: n }, (_, i) => -22 + (i % 5));
  const lead = analyzeProfile([...Array(35).fill(-Infinity), ...speech(60)]);
  check("a 35-minute blank start is flagged as LEADING SILENCE", lead.lead === 35 && lead.flags.some(f => /LEADING SILENCE ~35/.test(f)), lead.flags.join());
  const low = analyzeProfile([...Array(35).fill(-71), ...speech(60)]);
  check("a start with only faint noise (-71 dB) is flagged too", low.lead === 35);
  const tr = analyzeProfile([...speech(70), -90, -90, -90]);
  check("a silent end is flagged as TRAILING", tr.trail === 3 && tr.lead === 0);
  const gap = analyzeProfile([...speech(30), ...Array(5).fill(-80), ...speech(30)]);
  check("a gap of 5 minutes inside is flagged; a quiet single minute is not", gap.gaps.length === 1 && gap.gaps[0].from === 30 && analyzeProfile([...speech(30), -60, ...speech(30)]).flags.length === 0, gap.flags.join());
  check("a normal lesson has no flags; a silent file is reported", analyzeProfile(speech(80)).flags.length === 0 && analyzeProfile([-Infinity, -Infinity, -Infinity]).flags[0] === "WHOLE FILE IS SILENT");
  check("ffmpeg's printed levels are parsed (including -inf)", JSON.stringify(parseRms("lavfi.astats.Overall.RMS_level=-23.5\nx\nlavfi.astats.Overall.RMS_level=-inf\n")) === "[-23.5,null]" || (parseRms("lavfi.astats.Overall.RMS_level=-23.5\nlavfi.astats.Overall.RMS_level=-inf")[1] === -Infinity));
  const e = rowFromCsv({ file: "x", series: "sahih-muslim", seq: "150", part: "", hd: "1448-3-2", status: "published", numbered: "yes", trim_start: "35:10", trim_end: "1:20:00" });
  check("trim columns are read from the CSV (35:10 = 2110 s) and checked", !e.errors.length && e.row.trimStart === 2110 && e.row.trimEnd === 4800 && rowFromCsv({ file: "x", series: "misc", seq: "1", hd: "1448-3-2", status: "published", trim_start: "10:00", trim_end: "5:00" }).errors.some(x => /after trim_start/.test(x)) && rowFromCsv({ file: "x", series: "misc", seq: "1", hd: "1448-3-2", status: "published", trim_start: "soon" }).errors.some(x => /trim_start/.test(x)));
}

/* ───── quiet stretches inside a recording: pure helpers ───── */
{
  const sp = n => Array(n).fill(-24);
  const one = findQuietRuns([...sp(100), ...Array(150).fill(-70), ...sp(100)]).runs;
  check("findQuietRuns: a 150 s quiet stretch is found at 100-250 s", one.length === 1 && one[0].from === 100 && one[0].to === 250, JSON.stringify(one));
  check("findQuietRuns: a cough (2 loud seconds) inside the stretch does not split it", findQuietRuns([...sp(100), ...Array(70).fill(-70), -30, -30, ...Array(80).fill(-70), ...sp(100)]).runs.length === 1);
  check("findQuietRuns: a pause shorter than a minute is left alone", findQuietRuns([...sp(100), ...Array(50).fill(-70), ...sp(100)]).runs.length === 0 && findQuietRuns([...sp(100), ...Array(59).fill(-70), ...sp(100)]).runs.length === 0);
  check("parseRanges / fmtRanges / mergeRanges", JSON.stringify(parseRanges("13:02-32:15;50:00-52:10").ranges) === "[[782,1935],[3000,3130]]" && fmtRanges([[782, 1935]]) === "0:13:02-0:32:15" && parseRanges("5-3").error && parseRanges("1-5;4-9").error === "ranges overlap" && JSON.stringify(mergeRanges([[0, 10]], [[10, 20], [30, 40]])) === "[[0,20],[30,40]]");
  check("mapToSource undoes the start trim and the removed ranges", mapToSource(100, 10, [[50, 80]]) === 140 && mapToSource(30, 10, [[50, 80]]) === 40);
  check("removeFilter: ranges are shifted by the start trim", removeFilter([[782, 1935]], 0).includes("between(t,782.000,1935.000)") && removeFilter([[782, 1935]], 600).includes("between(t,182.000,1335.000)") && removeFilter([], 0) === "");
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
  // a recording that starts with 3 minutes of blank, then speech-like sound, then 2 minutes of blank
  const blank = path.join(T, "0300صحيح مسلم 3-5-1448هـ.mp3");
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=180", "-f", "lavfi", "-i", "anoisesrc=d=240:c=pink:a=0.1", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=120", "-filter_complex", "[1:a]tremolo=f=3:d=0.6[s];[0:a][s][2:a]concat=n=3:v=0:a=1", blank]);
  const { profileFile } = await import("../tools/audio_batch.mjs");
  const conv = path.join(T, "c.m4a"); await convertOne(blank, conv, { title: "t", album: "a" });
  const prof = analyzeProfile(await profileFile(conv));
  check("ffmpeg profile of a real file finds 3 minutes of blank at the start and 2 at the end", prof.lead === 3 && prof.trail === 2 && prof.flags.length === 2, JSON.stringify(prof.flags));
  const cut = path.join(T, "cut.m4a"); await convertOne(blank, cut, { title: "t", album: "a" }, { start: 180, end: 420 });
  const dur = +JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", cut], { encoding: "utf8" })).format.duration;
  check("trim_start / trim_end cut the file (180 s .. 420 s = 240 s) and the result has no blank stretch", Math.abs(dur - 240) < 1 && analyzeProfile(await profileFile(cut)).flags.length === 0, String(dur));
  // the CLI: scan -> convert -> check suggests the trim -> edit the CSV -> convert again (only that file) -> check is clean
  const IN = path.join(T, "in"), W = path.join(T, "w"); fs.mkdirSync(IN); fs.copyFileSync(blank, path.join(IN, path.basename(blank)));
  const cli = (...a) => spawnSync("node", ["--no-warnings", "tools/audio_batch.mjs", ...a, "--work", W], { encoding: "utf8" });
  cli("scan", "--dir", IN, "--offline"); cli("convert");
  let r = cli("check");
  const sug = /trim_start = (\d+:\d\d:\d\d)/.exec(r.stdout), sugEnd = /trim_end = (\d+:\d\d:\d\d)/.exec(r.stdout);
  check("CLI check flags the file and suggests a start close to 3:00 and an end close to 7:00", sug && sugEnd && Math.abs(parseTime(sug[1]) - 180) <= 6 && Math.abs(parseTime(sugEnd[1]) - 420) <= 6, r.stdout);
  const csv = fs.readFileSync(path.join(W, "manifest.csv"), "utf8").split("\r\n"), head = csv[0].split(",");
  const cells = csv[1].split(","); cells[head.indexOf("trim_start")] = sug[1]; cells[head.indexOf("trim_end")] = sugEnd[1]; csv[1] = cells.join(",");
  fs.writeFileSync(path.join(W, "manifest.csv"), csv.join("\r\n"));
  r = cli("convert"); check("after editing the trim columns, convert redoes the file", /trimmed/.test(r.stdout), r.stdout + r.stderr);
  r = cli("convert"); check("a second convert skips it (nothing changed)", /already done 1/.test(r.stdout), r.stdout);
  // cut: the original is replaced by the cut file, the untouched original is kept
  const IN2 = path.join(T, "in2"), W2 = path.join(T, "w2"); fs.mkdirSync(IN2); const nm = path.basename(blank); fs.copyFileSync(blank, path.join(IN2, nm));
  const cli2 = (...a) => spawnSync("node", ["--no-warnings", "tools/audio_batch.mjs", ...a, "--work", W2], { encoding: "utf8" });
  cli2("scan", "--dir", IN2, "--offline"); fs.writeFileSync(path.join(T, "trims.txt"), "# comment\nsahih-muslim-0300 3:00 7:00\n");
  const durOf = f => +JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", f], { encoding: "utf8" })).format.duration;
  r = cli2("cut", "--trims", path.join(T, "trims.txt"));
  check("cut: the original is cut (180 s - 2 s lead-in .. 420 s = 242 s) and the untouched original is kept in a backup folder", r.status === 0 && Math.abs(durOf(path.join(IN2, nm)) - 242) < 1 && Math.abs(durOf(path.join(IN2, "_originals_before_cut", nm)) - 540) < 1, r.stdout + r.stderr);
  r = cli2("cut", "--trims", path.join(T, "trims.txt"));
  check("cut again starts from the backup, not from the already cut file", r.status === 0 && Math.abs(durOf(path.join(IN2, nm)) - 242) < 1 && Math.abs(durOf(path.join(IN2, "_originals_before_cut", nm)) - 540) < 1, r.stdout + r.stderr);
  fs.writeFileSync(path.join(T, "bad.txt"), "sahih-muslim-0999 3:00\nsahih-muslim-0300 soon\n");
  r = cli2("cut", "--trims", path.join(T, "bad.txt")); check("cut refuses a wrong id or time and changes nothing", r.status !== 0 && /no such id/.test(r.stderr) && /expected/.test(r.stderr) && Math.abs(durOf(path.join(IN2, nm)) - 242) < 1);
  // gaps: a recording = 2 min speech, 150 s of quiet (a prayer break), 2 min speech; and one that starts with 150 s of quiet
  const IN3 = path.join(T, "in3"), W3 = path.join(T, "w3"); fs.mkdirSync(IN3);
  const gapFile = path.join(IN3, "0301صحيح مسلم 4-5-1448هـ.mp3"), leadFile = path.join(IN3, "0302صحيح مسلم 6-5-1448هـ.mp3");
  const speech = d => `anoisesrc=d=${d}:c=pink:a=0.1`, quietNoise = d => `anoisesrc=d=${d}:c=pink:a=0.0004`;
  const mk = (out, parts) => execFileSync("ffmpeg", ["-loglevel", "error", "-y", ...parts.flatMap(p => ["-f", "lavfi", "-i", p]), "-filter_complex", parts.map((_, i) => `[${i}:a]${i % 2 === (parts.length === 3 ? 0 : 1) ? "tremolo=f=3:d=0.6" : "anull"}[a${i}]`).join(";") + ";" + parts.map((_, i) => `[a${i}]`).join("") + `concat=n=${parts.length}:v=0:a=1`, out]);
  mk(gapFile, [speech(120), quietNoise(150), speech(120)]); mk(leadFile, [quietNoise(150), speech(120)]);
  const cli3 = (...a) => spawnSync("node", ["--no-warnings", "tools/audio_batch.mjs", ...a, "--work", W3], { encoding: "utf8" });
  cli3("scan", "--dir", IN3, "--offline"); cli3("convert");
  r = cli3("gaps", "--clips");
  check("gaps: finds the 150 s break inside 0301 (remove ~2:01-4:29) and the quiet start of 0302 (trim_start ~2:28)", /sahih-muslim-0301: quiet for 2\.5 min/.test(r.stdout) && /sahih-muslim-0302: quiet at the START/.test(r.stdout) && fs.existsSync(path.join(W3, "gap_clips")) && fs.readdirSync(path.join(W3, "gap_clips")).length >= 2, r.stdout + r.stderr);
  check("gaps without --apply changes nothing", !/remove/.test(fs.readFileSync(path.join(W3, "manifest.csv"), "utf8").split("\r\n")[1]) && /nothing was changed/.test(r.stdout));
  r = cli3("gaps", "--apply"); const man = fs.readFileSync(path.join(W3, "manifest.csv"), "utf8");
  check("gaps --apply writes the remove range and the trim into manifest.csv", /0:02:0\d-0:04:2\d/.test(man) && /0:02:2\d/.test(man), man);
  r = cli3("convert");
  const d1 = durOf(path.join(W3, "m4a", "sahih-muslim-0301.m4a")), d2 = durOf(path.join(W3, "m4a", "sahih-muslim-0302.m4a"));
  check("convert removes the stretch: 0301 = 120 + 120 s + a ~3 s pause, 0302 = ~122 s", Math.abs(d1 - 243) < 3 && Math.abs(d2 - 122) < 3, `${d1} ${d2}\n${r.stdout}`);
  r = cli3("gaps"); check("gaps again: nothing left of a minute or more", /no quiet stretch/.test(r.stdout), r.stdout);
  r = cli3("convert"); check("convert again skips both (nothing changed)", /already done 2/.test(r.stdout), r.stdout);
  r = cli("check"); check("check is clean after trimming", /all 1 files look continuous/.test(r.stdout), r.stdout);
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
