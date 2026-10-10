import { identify } from "./auth.mjs";
import { can, ROLES } from "./roles.mjs";
import { CSS, message, page } from "./html.mjs";
import { JS } from "./client.mjs";
import { audit } from "./audit.mjs";
import { handleUpload, addLessons, json } from "./upload.mjs";
import { newSeries, lessonStatus } from "./content.mjs";
import { requestPublish } from "./publish.mjs";
import * as P from "./pages.mjs";

const HEADERS = {
  "content-security-policy": "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; media-src blob:; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow",
  "cross-origin-opener-policy": "same-origin", "x-frame-options": "DENY",
};
const done = r => { const h = new Headers(r.headers); for (const [k, v] of Object.entries(HEADERS)) h.set(k, v); return new Response(r.body, { status: r.status, headers: h }); };
const redirect = (to, code, kind) => done(new Response(null, { status: 303, headers: { location: `${to}${to.includes("?") ? "&" : "?"}${kind}=${code}` } }));
const EMAIL = /^[^\s@<>"',;:\\]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/i;
const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, "").trim().slice(0, n);

const activeAdmins = async db => (await db.prepare("SELECT COUNT(*) c FROM users WHERE role='admin' AND active=1").first()).c;

/* form posts (same-origin already checked by the caller) -> Response, or null = not allowed / not found */
async function post(request, env, user, path) {
  const db = env.DB;
  const f = await request.formData();
  if (path === "/series/new" && can(user.role, "content.edit")) return newSeries(f, env, user, redirect);
  if (path === "/lessons/status" && can(user.role, "content.hide")) return lessonStatus(f, env, user, redirect);
  if (path === "/publish" && can(user.role, "content.publish")) {
    const code = await requestPublish(env, user);
    return redirect("/publish", code, code === "requested" ? "ok" : "err");
  }
  if (!can(user.role, "users.manage")) return null;
  if (path === "/users/add") {
    const email = clean(f.get("email"), 254).toLowerCase(), role = clean(f.get("role"), 10), name = clean(f.get("name"), 80);
    if (!EMAIL.test(email) || !ROLES.includes(role)) return redirect("/users", "invalid", "err");
    if (await db.prepare("SELECT 1 FROM users WHERE email=?").bind(email).first()) return redirect("/users", "exists", "err");
    await db.prepare("INSERT INTO users (email, role, name) VALUES (?,?,?)").bind(email, role, name || null).run();
    await audit(db, user.email, "user.add", "user", email, null, { role, name });
    return redirect("/users", "added", "ok");
  }
  if (path === "/users/update") {
    const email = clean(f.get("email"), 254).toLowerCase(), role = clean(f.get("role"), 10), active = f.get("active") === "1" ? 1 : 0;
    if (!ROLES.includes(role)) return redirect("/users", "invalid", "err");
    const before = await db.prepare("SELECT email, role, name, active FROM users WHERE email=?").bind(email).first();
    if (!before) return redirect("/users", "unknown", "err");
    const stillAdmin = role === "admin" && active === 1;
    if (before.role === "admin" && before.active === 1 && !stillAdmin && (await activeAdmins(db)) <= 1) return redirect("/users", "last_admin", "err");
    await db.prepare("UPDATE users SET role=?, active=? WHERE email=?").bind(role, active, email).run();
    await audit(db, user.email, "user.update", "user", email, before, { ...before, role, active });
    return redirect("/users", "updated", "ok");
  }
  return null;
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url), path = url.pathname.replace(/\/+$/, "") || "/";
      let who;
      try { who = await identify(request, env); }
      catch (e) {
        if (e.status === 503) return done(message("غير مُهيّأ", "لوحة التحرير لم تُهيَّأ بعد (راجع docs/admin-setup.md).", 503));
        return done(message("غير مصرّح", "الدخول عبر Cloudflare Access فقط.", 401));
      }
      const row = await env.DB.prepare("SELECT email, role, name, active FROM users WHERE email = ?").bind(who.email).first();
      if (!row || !row.active) return done(message("لا تملك صلاحية", "هذا البريد غير مسجّل في لوحة التحرير. تواصل مع المدير.", 403));
      const user = { email: row.email, role: row.role, name: row.name };

      if (request.method === "POST" || request.method === "PUT") {          // same-origin requests only (forms and our own fetch calls)
        const site = request.headers.get("sec-fetch-site"), origin = request.headers.get("origin");
        let sameOrigin = site === "same-origin";
        if (!sameOrigin && origin) { try { sameOrigin = new URL(origin).host === url.host; } catch { /* malformed Origin: refuse */ } }
        if (!sameOrigin) return done(message("مرفوض", "طلب من مصدر غير مسموح.", 403));
        if (path.startsWith("/api/")) {
          if (!can(user.role, "content.edit")) return done(json({ error: "لا تملك صلاحية" }, 403));
          if (path === "/api/lessons" && request.method === "POST") return done(await addLessons(request, env, user));
          const r = await handleUpload(request, env, user, path, url);
          return done(r || json({ error: "غير موجود" }, 404));
        }
        if (request.method !== "POST") return done(new Response("Method not allowed", { status: 405 }));
        const r = await post(request, env, user, path);
        return r || done(message("غير متاح", "لا تملك صلاحية هذه العملية.", 403));
      }
      if (request.method !== "GET" && request.method !== "HEAD") return done(new Response("Method not allowed", { status: 405 }));

      if (path === "/favicon.ico") return done(new Response(null, { status: 204 }));
      if (path === "/admin.css") return done(new Response(CSS, { headers: { "content-type": "text/css; charset=utf-8" } }));
      if (path === "/admin.js") return done(new Response(JS, { headers: { "content-type": "text/javascript; charset=utf-8" } }));
      const flash = url.searchParams.get("ok") ? { kind: "ok", code: url.searchParams.get("ok") } : url.searchParams.get("err") ? { kind: "err", code: url.searchParams.get("err") } : null;
      const pageNo = Math.min(Math.max(parseInt(url.searchParams.get("page") || "1", 10) || 1, 1), 1000);

      let html = null, m;
      if (path === "/") html = await P.dashboard(env.DB, user);
      else if (path === "/series") html = await P.seriesList(env.DB, user);
      else if (path === "/series/new" && can(user.role, "content.edit")) html = await P.newSeriesPage(env.DB, user, flash);
      else if ((m = /^\/series\/([^/]+)$/.exec(path))) { let id = null; try { id = decodeURIComponent(m[1]); } catch { /* bad escape: 404 */ } html = id && await P.seriesDetail(env.DB, user, id.slice(0, 120), pageNo, flash); }
      else if (path === "/books") html = await P.booksList(env.DB, user);
      else if (path === "/upload" && can(user.role, "content.edit")) html = await P.uploadPage(env.DB, user);
      else if (path === "/publish" && can(user.role, "content.publish")) html = await P.publishPage(env.DB, user, flash);
      else if (path === "/analytics" && can(user.role, "analytics.view")) html = await P.analyticsPage(env.DB, user);
      else if (path === "/users" && can(user.role, "users.manage")) html = await P.usersPage(env.DB, user, flash);
      else if (path === "/audit" && can(user.role, "audit.view")) html = await P.auditPage(env.DB, user);
      if (!html) return done(message("غير موجود", "الصفحة المطلوبة غير موجودة.", 404));
      return done(page(request.method === "HEAD" ? "" : html));
    } catch (e) {
      console.error("admin error:", e && e.stack || e);
      return done(message("خطأ", "حدث خطأ غير متوقع.", 500));
    }
  },
};
