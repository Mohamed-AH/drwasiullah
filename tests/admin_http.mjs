/* End-to-end check of the admin Worker against a LOCAL dev server (never the live site). Setup, from the repo root:
     P=$(mktemp -d); node --no-warnings scripts/db.mjs seed --out $P/seed.sql
     npx wrangler d1 migrations apply drwasiullah --local -c admin/wrangler.jsonc --persist-to $P
     npx wrangler d1 execute drwasiullah --local -c admin/wrangler.jsonc --persist-to $P --file $P/seed.sql
     npx wrangler d1 execute drwasiullah --local -c admin/wrangler.jsonc --persist-to $P --command "insert into users(email,role) values ('boss@example.com','admin'),('ed@example.com','editor'),('off@example.com','editor')"
     npx wrangler dev -c admin/wrangler.jsonc --local --persist-to $P --port 8791 --var ENV:dev     (another terminal)
     node tests/admin_http.mjs
   The x-dev-email header only works because of --var ENV:dev; the deployed Worker ignores it. */
const BASE = process.env.BASE || "http://localhost:8791";
let bad = 0;
const check = (name, cond, extra = "") => { if (!cond) bad++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + extra}`); };
const as = (email, init = {}) => ({ redirect: "manual", ...init, headers: { "x-dev-email": email, ...(init.headers || {}) } });
const get = (path, email) => fetch(BASE + path, as(email));
const post = (path, email, body, headers = { "sec-fetch-site": "same-origin" }) =>
  fetch(BASE + path, as(email, { method: "POST", body: new URLSearchParams(body), headers }));
const loc = r => r.headers.get("location");

const anon = await fetch(BASE + "/", { redirect: "manual" });
check("no Access token: refused (401)", anon.status === 401, anon.status);
check("unknown email: 403", (await get("/", "nobody@example.com")).status === 403);
check("off@ is not active yet: still allowed", (await get("/", "off@example.com")).status === 200);

const home = await (await get("/", "boss@example.com")).text();
const fsx = await import("node:fs"), rd = f => JSON.parse(fsx.readFileSync(new URL("../site/" + f, import.meta.url), "utf8"));
const parts = ["catalogue.json", "data/library.json", "data/makkah.json", "data/haram.json"].map(rd);
const AR = n => String(n.toLocaleString("en-US")).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]);
const expect = [parts.reduce((a, x) => a + x.lessons.length, 0), parts.reduce((a, x) => a + x.series.length, 0), parts[1].books.length];
check(`dashboard counts match the data files (${expect.join(" / ")})`, expect.every(x => home.includes(`<b>${AR(x)}</b>`)), expect);
check("series list", (await get("/series", "boss@example.com")).status === 200);
const muslim = await get("/series/muslim", "boss@example.com");
check("series page + pagination", muslim.status === 200 && (await muslim.text()).includes("صفحة"));
check("unknown series: 404", (await get("/series/nope", "boss@example.com")).status === 404);
check("malformed escape: 404 not 500", (await get("/series/%E0%A4%A", "boss@example.com")).status === 404);
check("books", (await get("/books", "boss@example.com")).status === 200);

check("editor cannot open /users", (await get("/users", "ed@example.com")).status === 404);
check("editor cannot open /audit", (await get("/audit", "ed@example.com")).status === 404);
check("editor menu has no users link", !(await (await get("/", "ed@example.com")).text()).includes('href="/users"'));
check("editor sees upload and publish pages", (await get("/upload", "ed@example.com")).status === 200 && (await get("/publish", "ed@example.com")).status === 200);
check("API refuses cross-site calls", (await fetch(BASE + "/api/lessons", as("ed@example.com", { method: "POST", body: "{}", headers: { "sec-fetch-site": "cross-site", "content-type": "application/json" } }))).status === 403);
check("API: bad lesson payload refused (400)", (await fetch(BASE + "/api/lessons", as("ed@example.com", { method: "POST", body: JSON.stringify({ series: "nope", items: [] }), headers: { "sec-fetch-site": "same-origin", "content-type": "application/json" } }))).status === 400);
check("API: part upload with a bad key refused", (await fetch(BASE + "/api/upload/part?key=../../etc&uploadId=x&n=1", as("ed@example.com", { method: "PUT", body: "x", headers: { "sec-fetch-site": "same-origin" } }))).status === 400);
check("editor cannot POST users", (await post("/users/add", "ed@example.com", { email: "x@example.com", role: "admin" })).status === 403);
check("cross-site POST refused", (await post("/users/add", "boss@example.com", { email: "x@example.com", role: "admin" }, { "sec-fetch-site": "cross-site", origin: "https://evil.example" })).status === 403);
check("POST without origin info refused", (await post("/users/add", "boss@example.com", { email: "x@example.com", role: "admin" }, {})).status === 403);

const u = `t${Date.now()}@example.com`;
check("add user", loc(await post("/users/add", "boss@example.com", { email: u.toUpperCase(), role: "editor", name: "T" })) === "/users?ok=added");
check("duplicate refused", loc(await post("/users/add", "boss@example.com", { email: u, role: "editor" })) === "/users?err=exists");
check("bad email refused", loc(await post("/users/add", "boss@example.com", { email: "bad<script>", role: "editor" })) === "/users?err=invalid");
check("bad role refused", loc(await post("/users/add", "boss@example.com", { email: "z@example.com", role: "superuser" })) === "/users?err=invalid");
check("cannot demote the last admin", loc(await post("/users/update", "boss@example.com", { email: "boss@example.com", role: "editor", active: "1" })) === "/users?err=last_admin");
check("cannot deactivate the last admin", loc(await post("/users/update", "boss@example.com", { email: "boss@example.com", role: "admin", active: "0" })) === "/users?err=last_admin");
check("deactivate a user", loc(await post("/users/update", "boss@example.com", { email: "off@example.com", role: "editor", active: "0" })) === "/users?ok=updated");
check("deactivated user is locked out", (await get("/", "off@example.com")).status === 403);
const audit = await (await get("/audit", "boss@example.com")).text();
check("audit log records add and update", audit.includes("user.add") && audit.includes("user.update"));

const h = (await get("/", "boss@example.com")).headers;
const csp = h.get("content-security-policy");
check("CSP: scripts only from our own origin, never inline", /default-src 'none'/.test(csp) && /script-src 'self'(;|$)/.test(csp) && !/unsafe-inline|unsafe-eval/.test(csp), csp);
check("noindex + no-store + frame deny", /noindex/.test(h.get("x-robots-tag")) && h.get("cache-control") === "no-store" && h.get("x-frame-options") === "DENY");
check("PUT outside the API refused", [403, 405].includes((await fetch(BASE + "/", as("boss@example.com", { method: "PUT", headers: { "sec-fetch-site": "same-origin" } }))).status));
if (bad) { console.error(`!! ${bad} failed`); process.exit(1); }
console.log("all admin HTTP checks passed");
