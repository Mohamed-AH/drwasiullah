// Cloudflare Worker that sits in front of the static site. It answers ONE route, /health, for uptime monitors (UptimeRobot etc.);
// every other path is served by the static assets exactly as before (wrangler.jsonc: assets.run_worker_first = ["/health"]).
//
//   GET/HEAD https://drwasiullah.com/health  ->  200 {"status":"ok",...}  when all four checks pass
//                                              503 {"status":"fail",...}  when any fails (so a plain "HTTP 200" monitor works too;
//                                                                         a keyword monitor can look for "status":"ok")
// The four checks: home (the page itself), sitemap, media (an audio file on media.drwasiullah.com answers AND allows the site's origin
// via CORS), www (the www address still answers). Results are remembered for 30 s so a burst of requests cannot hammer the sources.
const SITE = "https://drwasiullah.com";
const WWW = "https://www.drwasiullah.com/";
const MEDIA_SAMPLE = "https://media.drwasiullah.com/audio/f89d25796bd0c3c8.mp3";   // content-addressed, so this address never changes (Tadrib lesson 2)
const MEDIA_ORIGIN = "https://www.drwasiullah.com";                                   // an origin our CORS policy must allow
const TIMEOUT_MS = 8000, CACHE_MS = 30000;
let memo = null;

const timed = (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
const guard = async fn => { try { return await fn(); } catch (e) { return { ok: false, detail: `${e.name || "Error"}: ${e.message || e}`.slice(0, 160) }; } };

export async function runChecks(env, fetcher = timed) {
  const [home, sitemap, media, www] = await Promise.all([
    guard(async () => {
      const r = await env.ASSETS.fetch(new Request(SITE + "/")); const t = await r.text();
      return r.status === 200 && t.includes("وصي الله") ? { ok: true, detail: "200" } : { ok: false, detail: `HTTP ${r.status}${r.status === 200 ? ", expected text missing" : ""}` };
    }),
    guard(async () => {
      const r = await env.ASSETS.fetch(new Request(SITE + "/sitemap.xml")); const t = await r.text(); const n = t.split("<loc>").length - 1;
      return r.status === 200 && n >= 2000 ? { ok: true, detail: `${n} addresses` } : { ok: false, detail: `HTTP ${r.status}, ${n} addresses (expected >= 2000)` };
    }),
    guard(async () => {
      const r = await fetcher(MEDIA_SAMPLE, { headers: { Range: "bytes=0-0", Origin: MEDIA_ORIGIN } });
      r.body && r.body.cancel();
      const cors = r.headers.get("access-control-allow-origin");
      if (r.status !== 200 && r.status !== 206) return { ok: false, detail: `HTTP ${r.status}` };
      if (cors !== MEDIA_ORIGIN && cors !== "*") return { ok: false, detail: "answers, but no CORS header (purge the Cloudflare cache; see docs/mirror-setup.md)" };
      return { ok: true, detail: `${r.status}, CORS ok` };
    }),
    guard(async () => {
      const r = await fetcher(WWW, { redirect: "manual" }); r.body && r.body.cancel();
      const loc = r.headers.get("location") || "";
      return r.status === 200 || ([301, 302, 307, 308].includes(r.status) && /drwasiullah\.com/.test(loc)) ? { ok: true, detail: `${r.status}${loc ? " -> " + loc : ""}` } : { ok: false, detail: `HTTP ${r.status}${loc ? " -> " + loc : ""}` };
    }),
  ]);
  const checks = { home, sitemap, media, www };
  return { status: Object.values(checks).every(c => c.ok) ? "ok" : "fail", time: new Date().toISOString(), checks };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/health" && url.pathname !== "/health/") return env.ASSETS.fetch(request);
    if (!memo || Date.now() - memo.at > CACHE_MS) memo = { at: Date.now(), body: await runChecks(env) };
    const body = memo.body;
    return new Response(request.method === "HEAD" ? null : JSON.stringify(body), {
      status: body.status === "ok" ? 200 : 503,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
    });
  },
};
