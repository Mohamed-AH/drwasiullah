/* Phase 6 in the admin portal: the home layout manager (HTTP). Run through tests/admin_run_all.sh. */
import fs from "node:fs";
const BASE = process.env.BASE || "http://localhost:8791";
let bad = 0;
const check = (name, cond, extra = "") => { if (!cond) bad++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + String(extra)}`); };
const A = "boss@example.com", E = "ed@example.com", H = { "sec-fetch-site": "same-origin" };
const get = (path, email = A) => fetch(BASE + path, { redirect: "manual", headers: { "x-dev-email": email } });
const html = async (path, email = A) => (await get(path, email)).text();
const postA = (path, pairs, email = A, hdr = H) => { const p = new URLSearchParams(); for (const [k, v] of pairs) p.append(k, v); return fetch(BASE + path, { method: "POST", redirect: "manual", body: p, headers: { "x-dev-email": email, ...hdr } }); };
const loc = r => r.headers.get("location") || "";
const ver = h => /name="ver" value="([0-9a-f]+)"/.exec(h)[1];
const order = h => [...h.matchAll(/<input type="hidden" name="ids" value="([a-z]+)">/g)].map(m => m[1]);

/* the palette in the admin equals the one the site renders */
const core = fs.readFileSync("site/js/core.js", "utf8"), adm = fs.readFileSync("admin/src/home.mjs", "utf8");
const ids = s => [...s.matchAll(/\{ id: "([a-z]+)", name:/g)].map(m => m[1]).join(",");
check("admin block palette = site palette", ids(core) === ids(adm) && ids(core).split(",").length === 6, ids(core) + " | " + ids(adm));

check("menu entry for admin only; editor gets 404 / 403", (await html("/")).includes('href="/home"') && !(await html("/", E)).includes('href="/home"') && (await get("/home", E)).status === 404 && (await postA("/home/save", [["ver", "x"]], E)).status === 403);
check("cross-site post refused", (await postA("/home/save", [["ver", "x"]], A, { "sec-fetch-site": "cross-site" })).status === 403);

let page = await html("/home");
check("default layout lists the six blocks in the site's order", order(page).join(",") === "news,schedule,about,sections,shelf,latest", order(page).join(","));
check("first block cannot move up, last cannot move down", /value="news:up" disabled/.test(page) && /value="latest:down" disabled/.test(page));
let v = ver(page);
const form = (o = {}) => {
  const ord = o.order || order(page), p = [["ver", o.ver || v], ["move", o.move ?? ""]];
  for (const id of ord) {
    p.push(["ids", id]);
    if (!(o.off || []).includes(id)) p.push(["on_" + id, "1"]);
    p.push(["title_" + id, (o.titles || {})[id] ?? ""]);
    if (id === "shelf") p.push(["count_shelf", o.shelfCount ?? "10"]);
    if (id === "latest") p.push(["count_latest", o.latestCount ?? "8"]);
  }
  for (const s of o.series || []) p.push(["series", s]);
  return p;
};
check("saving with no change says so", loc(await postA("/home/save", form())).includes("err=nochange"));
check("stale version token is refused (conflict)", loc(await postA("/home/save", form({ ver: "0".repeat(40), off: ["about"] }))).includes("err=conflict"));
check("missing / duplicated / unknown block ids refused", loc(await postA("/home/save", [["ver", v], ["ids", "news"], ["ids", "news"]])).includes("err=invalid") && loc(await postA("/home/save", form({ order: ["news", "schedule", "about", "sections", "shelf", "evil"] }))).includes("err=invalid"));

check("up arrow moves 'latest' above 'shelf'", loc(await postA("/home/save", form({ move: "latest:up" }))).includes("ok=home_saved"));
page = await html("/home"); v = ver(page);
check("new order shown", order(page).join(",") === "news,schedule,about,sections,latest,shelf", order(page).join(","));
check("down arrow moves it back", loc(await postA("/home/save", form({ move: "latest:down" }))).includes("ok=home_saved") && order(await html("/home")).join(",") === "news,schedule,about,sections,shelf,latest");
page = await html("/home"); v = ver(page);

const sid = /name="series" value="([^"]+)"/.exec(page)[1];
check("hide, custom heading (markup stays text), counts clamped, one chosen series", loc(await postA("/home/save", form({ off: ["about"], titles: { sections: "<b>أقسامنا</b>" }, shelfCount: "999", latestCount: "1", series: [sid, "no-such-series"] }))).includes("ok=home_saved"));
page = await html("/home"); v = ver(page);
check("saved values shown (escaped), unknown series dropped, counts clamped", page.includes("&lt;b&gt;أقسامنا&lt;/b&gt;") && !page.includes("<b>أقسامنا</b>") && /name="count_shelf"[^>]*value="16"/.test(page) && /name="count_latest"[^>]*value="4"/.test(page) && new RegExp(`value="${sid}" checked`).test(page) && !page.includes("no-such-series") && !/name="on_about" value="1" checked/.test(page));

check("reset restores the default layout", loc(await postA("/home/reset", [["ver", v]])).includes("ok=home_saved"));
page = await html("/home");
check("after reset: order, visibility and counts are the defaults", order(page).join(",") === "news,schedule,about,sections,shelf,latest" && /name="on_about" value="1" checked/.test(page) && /name="count_shelf"[^>]*value="10"/.test(page) && !page.includes("أقسامنا"));
check("reset with a stale token refused", loc(await postA("/home/reset", [["ver", "1".repeat(40)]])).includes("err=conflict"));
/* leave a distinctive layout behind: tests/admin_run_all.sh exports it and builds the site from it */
page = await html("/home"); v = ver(page);
check("final layout saved (news hidden, latest first, custom shelf heading and size)", loc(await postA("/home/save", form({ ver: v, order: ["latest", "schedule", "about", "sections", "shelf", "news"], off: ["news"], titles: { shelf: "رفّ مختار" }, shelfCount: "5", latestCount: "6" }))).includes("ok=home_saved"));
const au = await html("/audit");
check("audit log has home.save and home.reset", au.includes("home.save") && au.includes("home.reset"));
console.log(bad ? `${bad} FAILED` : "all home layout checks passed");
process.exit(bad ? 1 : 0);
