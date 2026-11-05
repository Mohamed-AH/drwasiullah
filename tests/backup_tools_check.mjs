/* Checks for the backup/redundancy tools: publish guard, expiry watch, media sweep (against a local server), encrypted backup round trip.
   node --no-warnings tests/backup_tools_check.mjs   (needs gpg for the last group) */
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { counts, compare } from "../scripts/publish_guard.mjs";
import * as ew from "../scripts/expiry_watch.mjs";
import { collect, sweep } from "../scripts/media_sweep.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const lessons = k => Array.from({ length: k }, (_, i) => ({ id: "l" + i }));

/* ---- publish guard ---- */
{
  const b = counts({ "data/library.json": { series: lessons(12), lessons: lessons(1000), books: lessons(24) }, "data/makkah.json": { series: lessons(1), lessons: lessons(1200) }, "data/haram.json": null });
  ok(b["lessons (all files)"] === 2200 && b["data/library.json books"] === 24, "counts");
  const mk = (lib, mak) => counts({ "data/library.json": { series: lessons(12), lessons: lessons(lib), books: lessons(24) }, "data/makkah.json": { series: lessons(1), lessons: lessons(mak) } });
  ok(compare(b, mk(1000, 1200)).length === 0, "same = fine");
  ok(compare(b, mk(1030, 1200)).length === 0, "growth = fine");
  ok(compare(b, mk(960, 1200)).length === 0, "-40 of 1000 (4%) = fine");
  ok(compare(b, mk(900, 1200)).some(x => x.key === "data/library.json lessons"), "-100 of 1000 is stopped");
  ok(compare(b, mk(1000, 0)).some(x => x.key === "data/makkah.json lessons"), "a file that lost all its lessons is stopped");
  ok(compare(b, mk(995, 1196)).length === 0, "tiny drop (<10) = fine");
  ok(compare(counts({ "data/library.json": { lessons: lessons(20) } }), counts({ "data/library.json": { lessons: lessons(12) } })).length === 0, "a drop of fewer than 10 lessons is never stopped, even on a tiny site");
  const none = counts({ "data/library.json": null });
  ok(compare(none, mk(5, 5)).length === 0, "no previous file = fine");
  ok(compare(b, counts({ "data/library.json": { series: lessons(5), lessons: lessons(1000), books: lessons(24) }, "data/makkah.json": { series: lessons(1), lessons: lessons(1200) } })).some(x => x.key.endsWith("series")), "series drop 12 -> 5 stopped");
}

/* ---- expiry watch ---- */
{
  const now = Date.parse("2026-11-05T00:00:00Z");
  ok(ew.daysLeft("2026-11-15T00:00:00Z", now) === 10, "daysLeft");
  const resp = (body, status = 200) => async () => ({ ok: status < 400, status, json: async () => body });
  let r = await ew.run({ CLOUDFLARE_API_TOKEN: "t", GH_TOKEN_EXPIRES: "2027-03-01" }, 14, now, resp({ success: true, result: { status: "active", expires_on: "2027-01-01T00:00:00Z" } }));
  ok(!r.problems.length && !r.warnings.length, "healthy tokens pass");
  r = await ew.run({ CLOUDFLARE_API_TOKEN: "t", GH_TOKEN_EXPIRES: "2026-11-10" }, 14, now, resp({ success: true, result: { status: "active" } }));
  ok(r.problems.length === 1 && /Portal GitHub token/.test(r.problems[0]), "GitHub token inside 14 days is a problem");
  r = await ew.run({ CLOUDFLARE_API_TOKEN: "t", GH_TOKEN_EXPIRES: "2027-03-01" }, 14, now, resp({ success: true, result: { status: "active", expires_on: "2026-11-12T00:00:00Z" } }));
  ok(r.problems.length === 1 && /Cloudflare/.test(r.problems[0]), "Cloudflare token inside 14 days is a problem");
  r = await ew.run({ CLOUDFLARE_API_TOKEN: "t", GH_TOKEN_EXPIRES: "2026-10-01" }, 14, now, resp({ success: true, result: { status: "active" } }));
  ok(r.problems.some(p => /EXPIRED/.test(p)), "expired token reported");
  r = await ew.run({ CLOUDFLARE_API_TOKEN: "t", GH_TOKEN_EXPIRES: "2027-03-01" }, 14, now, resp({ success: false, result: null }, 401));
  ok(r.problems.some(p => /does not work/.test(p)), "revoked token reported");
  r = await ew.run({}, 14, now);
  ok(!r.problems.length && r.warnings.length === 2, "nothing configured = warnings only");
  r = await ew.run({ GH_TOKEN_EXPIRES: "soon" }, 14, now);
  ok(r.problems.length === 1, "malformed date reported");
  let calls = 0;
  r = await ew.run({ CLOUDFLARE_API_TOKEN: "t", CLOUDFLARE_ACCOUNT_ID: "a1" }, 14, now, async u => { calls++; return u.includes("/accounts/") ? { ok: true, status: 200, json: async () => ({ success: true, result: { status: "active" } }) } : { ok: false, status: 401, json: async () => ({ success: false, result: null }) }; });
  ok(calls === 2 && !r.problems.length, "account-owned token accepted through the account endpoint");
}

/* ---- media sweep against a local server ---- */
{
  const bodies = { "/a.m4a": 1000, "/b.m4a": 500, "/c.m4a": 700 };
  const srv = http.createServer((req, res) => {
    const len = bodies[req.url];
    if (req.url === "/flaky.m4a") { res.writeHead(500); return res.end(); }
    if (!len) { res.writeHead(404); return res.end(); }
    if (req.url === "/c.m4a" && req.method === "HEAD") { res.writeHead(405); return res.end(); }
    if (req.headers.range) { res.writeHead(206, { "content-range": `bytes 0-0/${len}`, "content-length": 1 }); return res.end("x"); }
    res.writeHead(200, { "content-length": len }); if (req.method !== "HEAD") res.end("x".repeat(len)); else res.end();
  });
  await new Promise(r => srv.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const items = [{ id: "ok", url: base + "/a.m4a", size: 1000 }, { id: "wrongsize", url: base + "/b.m4a", size: 999 }, { id: "gone", url: base + "/nope.m4a" }, { id: "head405", url: base + "/c.m4a", size: 700 }, { id: "5xx", url: base + "/flaky.m4a" }];
  const real = globalThis.fetch;
  const bad = await sweep(items, { concurrency: 3, fetcher: (u, o) => real(u, o) });
  const ids = bad.map(x => x.id).sort().join(",");
  ok(ids === "5xx,gone,wrongsize", "sweep finds exactly the bad ones: " + ids);
  ok(bad.find(x => x.id === "wrongsize").detail.includes("999"), "size mismatch explained");
  srv.close();
  const lib = { lessons: [{ id: "x1", src: "https://media.drwasiullah.com/audio/aa.m4a", src_alt: "https://archive.org/download/q/1.mp3" }, { id: "x2", src: "https://makkahscholars.org/lessons/1/download" }, { id: "x3", src: "http://insecure/x" }], books: [{ id: "b1", files: [{ url: "https://media.drwasiullah.com/pdf/bb.pdf", url_alt: "https://archive.org/b.pdf" }] }] };
  const c = collect(lib, { "https://archive.org/download/q/1.mp3": { url: "https://media.drwasiullah.com/audio/aa.m4a", size: 42 } });
  ok(c.filter(x => x.ours).length === 2 && c.filter(x => !x.ours).length === 3 && c.find(x => x.id === "x1" && x.ours).size === 42, "collect splits ours / third-party and learns sizes");
}

/* ---- encrypted backup round trip ---- */
{
  const g = spawnSync("gpg", ["--version"]);
  if (g.status !== 0) console.log("(gpg not installed: encryption checks skipped)");
  else {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "enc-")), inp = path.join(d, "d1.sql"), out = path.join(d, "d1.sql.gz.gpg");
    fs.writeFileSync(inp, "INSERT INTO users VALUES('someone@example.com','admin');\n" + "x".repeat(5000));
    const env = { ...process.env, BACKUP_PASSPHRASE: "correct horse battery staple" };
    const r = spawnSync("bash", [path.join(ROOT, "scripts/encrypt_backup.sh"), inp, out], { env, encoding: "utf8" });
    ok(r.status === 0 && /round trip ok/.test(r.stdout), "encrypt script ok: " + r.stderr);
    ok(!fs.readFileSync(out).includes("someone@example.com"), "ciphertext hides the content");
    const bad = spawnSync("bash", ["-c", `gpg --batch --quiet --pinentry-mode loopback --decrypt --passphrase wrong "${out}" | gunzip | cmp - "${inp}"`], { encoding: "utf8" });
    ok(bad.status !== 0, "a wrong passphrase does not decrypt");
    const none = spawnSync("bash", [path.join(ROOT, "scripts/encrypt_backup.sh"), inp, out], { env: { ...process.env, BACKUP_PASSPHRASE: "" }, encoding: "utf8" });
    ok(none.status !== 0, "refuses an empty passphrase");
  }
}
console.log(`all backup tool checks passed (${n})`);
