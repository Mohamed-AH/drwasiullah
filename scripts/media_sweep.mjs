#!/usr/bin/env node
/* Does every media file the site points to really answer? Weekly, from .github/workflows/weekly-checks.yml (after `node scripts/build.mjs`).
     node scripts/media_sweep.mjs [--dist dist] [--fallbacks]
   Default: every lesson/book file on media.drwasiullah.com (our R2 copy) must answer 200/206, and where site/data/media.json knows the size
   it must equal Content-Length (catches a truncated or replaced upload). Failure = exit 1.
   --fallbacks: the original (src_alt/url_alt) and third-party files (archive.org, makkahscholars.org); problems are only listed (exit 0):
   those hosts are not ours and have slow/5xx days (docs/health-check.md). Standard library only. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OURS = "media.drwasiullah.com";

export function collect(lib, mediaMap = {}) {        // -> [{ id, url, ours, size|null, alt }]
  const sizeOf = new Map(Object.values(mediaMap || {}).map(m => [m.url, m.size]));
  const out = [];
  for (const l of lib.lessons || []) {
    if (l.src) out.push({ id: l.id, url: l.src, size: sizeOf.get(l.src) ?? null });
    if (l.src_alt) out.push({ id: l.id, url: l.src_alt, size: null, alt: true });
  }
  for (const b of lib.books || []) for (const f of b.files || []) {
    out.push({ id: b.id, url: f.url, size: sizeOf.get(f.url) ?? null });
    if (f.url_alt) out.push({ id: b.id, url: f.url_alt, size: null, alt: true });
  }
  return out.filter(x => /^https:\/\//.test(x.url)).map(x => ({ ...x, ours: new URL(x.url).host === OURS }));
}

export async function probe(it, fetcher = fetch, retries = 2) {
  let detail = "";
  for (let i = 0; i <= retries; i++) {
    if (i) await new Promise(r => setTimeout(r, 1500 * i));
    try {
      let r = await fetcher(it.url, { method: "HEAD", redirect: "follow", headers: { "user-agent": "drwasiullah-sweep/1.0" } });
      if (r.status === 405 || r.status === 403) r = await fetcher(it.url, { headers: { range: "bytes=0-0", "user-agent": "drwasiullah-sweep/1.0" } });
      if (r.status === 404 || r.status === 410) return { ok: false, detail: `HTTP ${r.status}`, final: true };
      if (r.status !== 200 && r.status !== 206) { detail = `HTTP ${r.status}`; continue; }
      const total = r.status === 206 ? Number((r.headers.get("content-range") || "").split("/")[1]) : Number(r.headers.get("content-length"));
      if (it.size && Number.isFinite(total) && total !== it.size) return { ok: false, detail: `size ${total} != expected ${it.size}`, final: true };
      return { ok: true };
    } catch (e) { detail = String(e.cause && e.cause.code || e.message || e); }
  }
  return { ok: false, detail };
}

export async function sweep(items, { concurrency = 12, fetcher = fetch } = {}) {
  const bad = []; let i = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < items.length) { const it = items[i++]; const r = await probe(it, fetcher); if (!r.ok) bad.push({ ...it, detail: r.detail }); }
  }));
  return bad;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), dist = path.resolve(ROOT, a.includes("--dist") ? a[a.indexOf("--dist") + 1] : "dist"), fallbacks = a.includes("--fallbacks");
  const lib = JSON.parse(fs.readFileSync(path.join(dist, "data/library.json"), "utf8"));
  let media = {}; try { media = JSON.parse(fs.readFileSync(path.join(ROOT, "site/data/media.json"), "utf8")); } catch { /* optional */ }
  const all = collect(lib, media), items = fallbacks ? all.filter(x => !x.ours) : all.filter(x => x.ours);
  console.log(`${fallbacks ? "fallback/third-party" : "own (R2)"} files to check: ${items.length}`);
  const bad = await sweep(items, { concurrency: fallbacks ? 4 : 12 });
  bad.sort((x, y) => x.id.localeCompare(y.id));
  bad.slice(0, 100).forEach(x => console.log(`${fallbacks ? "::warning::" : "::error::"}${x.id}: ${x.detail} ${x.url}`));
  console.log(`${items.length - bad.length} ok, ${bad.length} not ok`);
  process.exit(bad.length && !fallbacks ? 1 : 0);
}
