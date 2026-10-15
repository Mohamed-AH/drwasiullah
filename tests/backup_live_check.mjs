/* The nightly backup includes banners and announcements, without editors' emails, and `db.mjs restore-live` puts them back exactly. No Cloudflare needed (node:sqlite). */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
let bad = 0;
const check = (n, c, x = "") => { if (!c) bad++; console.log(`${c ? "ok  " : "FAIL"} ${n}${c ? "" : "  " + x}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bk-")), db0 = path.join(tmp, "a.sqlite"), db1 = path.join(tmp, "b.sqlite");
const mk = f => { const d = new DatabaseSync(f); for (const m of fs.readdirSync("db/migrations").filter(x => x.endsWith(".sql")).sort()) d.exec(fs.readFileSync(path.join("db/migrations", m), "utf8")); return d; };
const run = (...a) => execFileSync("node", ["--no-warnings", "scripts/db.mjs", ...a], { encoding: "utf8" });

const a = mk(db0);
a.prepare("INSERT INTO banners (id,text,link,kind,starts_at,ends_at,dismissible,active,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(7, "لا درس اليوم 'مع' \"علامات\", وفاصلة", "https://example.org/a?b=1&c=2", "urgent", "2026-10-14 10:00:00", "2026-10-15 10:00:00", 0, 1, "secret.editor@example.com", "2026-10-13 08:00:00");
a.prepare("INSERT INTO banners (id,text,kind,created_by,created_at) VALUES (?,?,?,?,?)").run(9, "بانر ثانٍ", "info", "secret.editor@example.com", "2026-10-13 09:00:00");
a.prepare("INSERT INTO announcements (id,title,body,link,link_label,pinned,status,publish_at,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(3, "مسودة <b>x</b>", "السطر الأول\nالسطر الثاني; DROP TABLE banners;--", null, null, 1, "draft", "2026-11-01 00:00:00", "secret.editor@example.com", "2026-10-13 07:00:00");
a.close();

const out = path.join(tmp, "backup");
run("export", "--db", db0, "--out", out, "--all");
const files = ["data/banners.json", "data/announcements.json"];
check("--all writes data/banners.json and data/announcements.json", files.every(f => fs.existsSync(path.join(out, f))));
const txt = files.map(f => fs.readFileSync(path.join(out, f), "utf8")).join("\n");
check("no editor email / created_by in the backup files (the repository is public)", !txt.includes("secret.editor") && !txt.includes("created_by"), txt.slice(0, 200));
const out2 = path.join(tmp, "publish");
run("export", "--db", db0, "--out", out2);
check("a normal export (Publish) does NOT write them", !fs.existsSync(path.join(out2, "data/banners.json")) && !fs.existsSync(path.join(out2, "data/announcements.json")));
run("export", "--db", db0, "--out", path.join(tmp, "only"), "--all", "--only", "data/banners.json");
check("--only is respected", fs.existsSync(path.join(tmp, "only/data/banners.json")) && !fs.existsSync(path.join(tmp, "only/data/announcements.json")));

/* restore into a different (empty, then non-empty) database */
const sqlFile = path.join(tmp, "restore.sql");
run("restore-live", "--site", out, "--out", sqlFile);
const b = mk(db1);
b.prepare("INSERT INTO banners (id,text,kind) VALUES (1,'stale banner that must disappear','info')").run();
b.exec(fs.readFileSync(sqlFile, "utf8"));
const rows = (d, t) => d.prepare(`SELECT * FROM ${t} ORDER BY id`).all().map(r => ({ ...r, created_by: null }));
const A = new DatabaseSync(db0, { readOnly: true });
check("banners restored exactly (ids, text with quotes/commas, times, flags); the stale row is gone", JSON.stringify(rows(A, "banners")) === JSON.stringify(rows(b, "banners")), JSON.stringify(rows(b, "banners")).slice(0, 300));
check("announcements restored exactly (draft status, pinned, multi-line body, SQL-looking text stays text)", JSON.stringify(rows(A, "announcements")) === JSON.stringify(rows(b, "announcements")));
check("created_by is empty after a restore (never written to git)", b.prepare("SELECT COUNT(*) n FROM banners WHERE created_by IS NOT NULL").get().n === 0);
b.exec(fs.readFileSync(sqlFile, "utf8"));
check("restoring twice gives the same result (idempotent)", JSON.stringify(rows(A, "banners")) === JSON.stringify(rows(b, "banners")) && b.prepare("SELECT COUNT(*) n FROM banners").get().n === 2);
b.prepare("INSERT INTO banners (text,kind) VALUES ('new after restore','info')").run();
check("new rows after a restore get fresh ids (no clash)", b.prepare("SELECT MAX(id) m FROM banners").get().m > 9);
let err = ""; try { run("restore-live", "--site", path.join(tmp, "empty"), "--out", path.join(tmp, "x.sql")); } catch (e) { err = String(e.stderr || e); }
check("restore-live refuses a folder without the backup files", /no data\/banners\.json/.test(err), err.slice(0, 200));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(bad ? `${bad} FAILED` : "all backup/restore checks passed");
process.exit(bad ? 1 : 0);
