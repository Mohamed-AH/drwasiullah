/* Audio upload API: browser -> this Worker -> R2 (multipart, 8 MiB parts; the Worker never buffers a file), then one call registers the lessons in D1.
   Everything here needs the content.edit permission (checked by the caller). Keys are content-addressed like tools/mirror_media.py: audio/<sha256[:16]>.<ext>. */
import { auditStmt } from "./audit.mjs";

export const MEDIA_BASE = "https://media.drwasiullah.com";
const KEY = /^audio\/[0-9a-f]{16}\.(mp3|m4a)$/;
const MAX_FILE = 200 * 1024 * 1024, MAX_PART = 16 * 1024 * 1024;
const TYPES = { mp3: "audio/mpeg", m4a: "audio/mp4" };
const PARTS = ["", "a", "b", "c", "d"];
const PART_AR = { a: "الجزء الأول", b: "الجزء الثاني", c: "الجزء الثالث", d: "الجزء الرابع" };
const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, "").trim().slice(0, n);

export const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const fail = (status, error) => json({ error }, status);
async function body(request, max = 256 * 1024) {
  if (+request.headers.get("content-length") > max) throw Object.assign(new Error("too large"), { status: 413 });
  try { return await request.json(); } catch { throw Object.assign(new Error("bad json"), { status: 400 }); }
}

/* the first bytes must look like mp3 (ID3 tag or MPEG frame sync) or m4a (ftyp box) */
export function sniff(bytes, ext) {
  if (ext === "mp3") return (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
}

export async function handleUpload(request, env, user, path, url) {
  const R2 = env.MEDIA;
  if (!R2) return fail(503, "R2 غير مربوط");
  try {
    if (path === "/api/upload/start" && request.method === "POST") {
      const b = await body(request);
      const ext = String(b.ext), size = Number(b.size), sha = String(b.sha256 || "");
      if (!TYPES[ext] || !Number.isInteger(size) || size < 1 || size > MAX_FILE || !/^[0-9a-f]{64}$/.test(sha)) return fail(400, "ملف غير صالح (mp3 أو m4a حتى ٢٠٠ ميغابايت)");
      const key = `audio/${sha.slice(0, 16)}.${ext}`, src = `${MEDIA_BASE}/${key}`;
      const used = await env.DB.prepare("SELECT id FROM lessons WHERE json_extract(data,'$.src') = ? LIMIT 1").bind(src).first();
      const have = await R2.head(key);
      if (have && have.size === size) return json({ exists: true, key, usedBy: used ? used.id : null });
      if (have) return fail(409, "يوجد ملف مختلف بالبصمة نفسها؛ لن يُستبدل");        // never overwrite an existing object
      const mp = await R2.createMultipartUpload(key, { httpMetadata: { contentType: TYPES[ext], cacheControl: "public, max-age=31536000, immutable" }, customMetadata: { sha256: sha, by: user.email } });
      return json({ key, uploadId: mp.uploadId, usedBy: used ? used.id : null });
    }
    if (path === "/api/upload/part" && request.method === "PUT") {
      const key = url.searchParams.get("key") || "", uploadId = url.searchParams.get("uploadId") || "", n = parseInt(url.searchParams.get("n") || "", 10);
      const len = +request.headers.get("content-length");
      if (!KEY.test(key) || !uploadId || uploadId.length > 600 || !(n >= 1 && n <= 10000)) return fail(400, "طلب غير صالح");
      if (!len || len > MAX_PART) return fail(413, "حجم الجزء غير مقبول");
      const part = await R2.resumeMultipartUpload(key, uploadId).uploadPart(n, request.body);
      return json({ partNumber: part.partNumber, etag: part.etag });
    }
    if (path === "/api/upload/complete" && request.method === "POST") {
      const b = await body(request);
      const key = String(b.key), ext = key.split(".").pop();
      if (!KEY.test(key) || !b.uploadId || !Array.isArray(b.parts) || b.parts.length < 1 || b.parts.length > 10000) return fail(400, "طلب غير صالح");
      const mp = R2.resumeMultipartUpload(key, String(b.uploadId));
      const obj = await mp.complete(b.parts.map(p => ({ partNumber: +p.partNumber, etag: String(p.etag) })));
      const head = await R2.get(key, { range: { offset: 0, length: 12 } });
      const bytes = head ? new Uint8Array(await head.arrayBuffer()) : new Uint8Array(0);
      if (!sniff(bytes, ext)) { await R2.delete(key); return fail(400, "الملف ليس صوتًا صالحًا (mp3/m4a)"); }
      return json({ key, size: obj.size });
    }
    if (path === "/api/upload/abort" && request.method === "POST") {
      const b = await body(request);
      if (KEY.test(String(b.key)) && b.uploadId) await R2.resumeMultipartUpload(String(b.key), String(b.uploadId)).abort().catch(() => {});
      return json({ ok: true });
    }
  } catch (e) {
    if (e.status) return fail(e.status, e.message);
    console.error("upload error:", e && e.stack || e);
    return fail(500, "تعذّر إكمال العملية");
  }
  return null;
}

/* POST /api/lessons {series, items:[{n, part, title, hd, date, section, key, duration, status}]} -> all or nothing */
export async function addLessons(request, env, user) {
  let b;
  try { b = await body(request, 512 * 1024); } catch (e) { return fail(e.status || 400, e.message); }
  const db = env.DB, series = clean(b.series, 60);
  const s = await db.prepare("SELECT id, status FROM series WHERE id = ?").bind(series).first();
  if (!s) return fail(400, "السلسلة غير موجودة");
  if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > 100) return fail(400, "عدد الدروس غير صالح");
  const rows = [], seen = new Set();
  for (const it of b.items) {
    const n = Number(it.n), part = String(it.part || ""), key = String(it.key || "");
    const status = it.status === "draft" ? "draft" : "published";
    if (!Number.isInteger(n) || n < 1 || n > 9999 || !PARTS.includes(part)) return fail(400, "رقم الدرس غير صالح");
    if (!KEY.test(key)) return fail(400, "ملف غير صالح");
    let title = clean(it.title, 200) || `الدرس ${n}`;
    const id = `${series}-${String(n).padStart(4, "0")}${part}`;
    if (seen.has(id)) return fail(409, `الرقم مكرر في القائمة: ${n}${part}`);
    seen.add(id);
    let hd = null, date = null;
    if (it.hd) {
      const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(it.hd));
      if (!m || +m[1] < 1300 || +m[1] > 1600 || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 30) return fail(400, "التاريخ الهجري غير صالح");
      hd = `${+m[1]}-${+m[2]}-${+m[3]}`;
      if (it.date) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(it.date)) || isNaN(new Date(it.date))) return fail(400, "التاريخ غير صالح"); date = String(it.date); }
    }
    const section = clean(it.section, 120), duration = Number.isInteger(it.duration) && it.duration > 0 && it.duration < 86400 ? it.duration : 0;
    rows.push({ id, n, part, key, status, title, hd, date, section, duration });
  }
  const dup = await db.prepare(`SELECT id FROM lessons WHERE id IN (${rows.map(() => "?").join(",")})`).bind(...rows.map(r => r.id)).all();
  if (dup.results.length) return fail(409, `هذه الدروس موجودة من قبل: ${dup.results.map(r => r.id).join("، ")}`);
  for (const r of rows) {                                                 // the file must really be in R2
    const o = env.MEDIA && await env.MEDIA.head(r.key);
    if (!o) return fail(400, "لم يكتمل رفع أحد الملفات");
  }
  const base = (await db.prepare("SELECT COALESCE(MAX(pos), -1) + 1 AS p FROM lessons WHERE origin = 'library'").first()).p;
  const stmts = [];
  rows.forEach((r, i) => {
    const data = { id: r.id, title: r.title + (r.part ? ` — ${PART_AR[r.part]}` : ""), series, kind: "audio", src: `${MEDIA_BASE}/${r.key}`, n: r.n };
    if (r.section) data.section = r.section;
    if (r.hd) data.hd = r.hd;
    if (r.date) data.date = r.date;
    if (r.duration) data.duration = r.duration;
    stmts.push(db.prepare("INSERT INTO lessons (id, origin, pos, series_id, kind, n, section, status, data) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(r.id, "library", base + i, series, "audio", r.n, r.section || null, r.status, JSON.stringify(data)));
    stmts.push(auditStmt(db, user.email, "lesson.add", "lesson", r.id, null, { series, n: r.n, status: r.status, title: data.title }));
  });
  await db.batch(stmts);
  return json({ ok: true, ids: rows.map(r => r.id), series });
}
