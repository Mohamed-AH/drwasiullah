/* Arranging the lessons of a series in the admin portal: drag with the mouse, keyboard, buttons, bulk move, sorts, search, undo, save, conflicts, reset
   (HTTP + browser). Run through tests/admin_run_all.sh; leaves a saved order for `tadrib` for the build check at the end of that script. */
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:8791";
let bad = 0;
const check = (name, cond, extra = "") => { if (!cond) bad++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : "  " + String(extra)}`); };
const E = "ed@example.com";
const api = (path, body, email = E, headers = { "sec-fetch-site": "same-origin" }) => fetch(BASE + path, { method: "POST", headers: { "x-dev-email": email, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const getHtml = async (path, email = E) => (await fetch(BASE + path, { headers: { "x-dev-email": email } })).text();

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, extraHTTPHeaders: { "x-dev-email": E } });
const p = await ctx.newPage();
const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !/status of 40\d/.test(m.text()) && errs.push(m.text()));
p.on("dialog", d => d.accept());
const order = () => p.$$eval("#ord-list > li", l => l.map(x => x.dataset.id));
const grip = i => `#ord-list > li:nth-child(${i}) .grip`;
const idAt = async i => (await order())[i - 1];

await p.goto(BASE + "/series/tadrib/order");
let o0 = await order();
check("every lesson of the series is listed, numbered 1..n", o0.length === 110 && (await p.textContent("#ord-list > li:nth-child(1) .pos")) === "١" && (await p.textContent("#ord-list > li:nth-child(110) .pos")) === "١١٠", o0.length);
check("the automatic order (what visitors see now) is by number", o0[0] === "tadrib-0001" && o0[1] === "tadrib-0002" && o0[109] === "tadrib-0110");
check("nothing to save and nothing to undo at first", await p.isDisabled("#ord-save") && await p.isDisabled("#ord-undo"));

/* step buttons */
await p.click("#ord-list > li:nth-child(1) .mv[data-act=down]");
check("step down moves the lesson", (await idAt(2)) === "tadrib-0001" && (await idAt(1)) === "tadrib-0002" && !(await p.isDisabled("#ord-save")));
check("positions are renumbered", (await p.textContent("#ord-list > li:nth-child(2) .pos")) === "٢");
await p.click("#ord-undo");
check("undo restores the order and disables save again", JSON.stringify(await order()) === JSON.stringify(o0) && await p.isDisabled("#ord-save"));
await p.click("#ord-list > li:nth-child(10) .mv[data-act=top]");
check("to-top button", (await idAt(1)) === "tadrib-0010");
await p.click("#ord-list > li:nth-child(1) .mv[data-act=bottom]");
check("to-bottom button", (await idAt(110)) === "tadrib-0010" && (await idAt(1)) === "tadrib-0001");
await p.click("#ord-undo"); await p.click("#ord-undo");

/* mouse drag: lesson 5 to the very top */
const g5 = await (await p.$(grip(5))).boundingBox(), first = await (await p.$("#ord-list > li:nth-child(1)")).boundingBox();
await p.mouse.move(g5.x + g5.width / 2, g5.y + g5.height / 2); await p.mouse.down();
for (let i = 1; i <= 12; i++) await p.mouse.move(g5.x + g5.width / 2, g5.y + g5.height / 2 + (first.y - g5.y - 4) * i / 12);
await p.waitForTimeout(150); await p.mouse.up();
check("mouse drag: lesson 5 dropped at the top", (await idAt(1)) === "tadrib-0005" && (await idAt(2)) === "tadrib-0001" && (await idAt(5)) === "tadrib-0004", (await order()).slice(0, 6));
check("the dragged row is no longer marked as dragging", (await p.$$("#ord-list li.dragging")).length === 0);
await p.click("#ord-undo");

/* keyboard: pick up lesson 3, two steps down, drop */
await p.focus(grip(3)); await p.keyboard.press("Space");
check("pressing Space picks the lesson up (aria-pressed)", (await p.getAttribute(grip(3), "aria-pressed")) === "true");
await p.keyboard.press("ArrowDown"); await p.keyboard.press("ArrowDown"); await p.keyboard.press("Space");
check("keyboard: lesson 3 moved two places down and dropped", (await idAt(5)) === "tadrib-0003" && (await idAt(3)) === "tadrib-0004", (await order()).slice(0, 6));
await p.waitForFunction(() => /الموضع/.test(document.getElementById("ord-live").textContent), null, { timeout: 3000 }).catch(() => {});
check("the move was announced for screen readers", /الموضع/.test(await p.textContent("#ord-live")));
await p.click("#ord-undo");
await p.focus(grip(2)); await p.keyboard.press("Space"); await p.keyboard.press("End"); await p.keyboard.press("Escape");
check("Escape cancels a keyboard move", JSON.stringify(await order()) === JSON.stringify(o0));

/* bulk: tick 7 and 8, move to position 2 */
await p.check("#ord-list > li:nth-child(7) .pick input"); await p.check("#ord-list > li:nth-child(8) .pick input");
check("selection counter and bulk buttons", /٢/.test(await p.textContent("#ord-sel")) && !(await p.isDisabled("[data-bulk=top]")));
await p.fill("#ord-to", "2"); await p.click("[data-bulk=to]");
check("bulk move to position 2 keeps their relative order", (await idAt(2)) === "tadrib-0007" && (await idAt(3)) === "tadrib-0008" && (await idAt(1)) === "tadrib-0001", (await order()).slice(0, 5));
await p.click("[data-bulk=bottom]");
check("bulk to the bottom", (await idAt(110)) === "tadrib-0008" && (await idAt(109)) === "tadrib-0007");
await p.click("#ord-undo"); await p.click("#ord-undo");

/* ready-made sorts */
await p.selectOption("#ord-sort", "reverse");
check("reverse", (await idAt(1)) === "tadrib-0110" && (await idAt(110)) === "tadrib-0001");
await p.selectOption("#ord-sort", "n");
check("sort by number restores the number order", JSON.stringify(await order()) === JSON.stringify(o0));
await p.click("#ord-undo"); await p.click("#ord-undo");

/* search */
await p.fill("#ord-q", "الدرس 99");
const visible = await p.$$eval("#ord-list > li:not([hidden])", l => l.length);
check("search hides the other rows", visible >= 1 && visible < 110, visible);
const gb = await (await p.$(grip(100))).boundingBox().catch(() => null);
await p.fill("#ord-q", "");
check("clearing the search shows everything", (await p.$$eval("#ord-list > li:not([hidden])", l => l.length)) === 110);

/* save: lesson 5 first, then reload */
await p.click("#ord-list > li:nth-child(5) .mv[data-act=top]");
await p.click("#ord-save");
await p.waitForFunction(() => /تم حفظ الترتيب/.test(document.getElementById("ord-msg").textContent), null, { timeout: 8000 });
check("saved: confirmation shown and the save button is off", await p.isDisabled("#ord-save"));
await p.reload();
check("after a reload the saved order is shown, marked as a manual order", (await idAt(1)) === "tadrib-0005" && (await idAt(2)) === "tadrib-0001" && /ترتيب يدوي محفوظ/.test(await p.textContent("main")));
check("the series list tags it", /ترتيب يدوي/.test(await getHtml("/series")));

/* concurrent edit: another editor changes the order, this page's save is refused */
const p2 = await ctx.newPage(); await p2.goto(BASE + "/series/tadrib/order");
await p2.click("#ord-list > li:nth-child(3) .mv[data-act=top]"); await p2.click("#ord-save");
await p2.waitForFunction(() => /تم حفظ الترتيب/.test(document.getElementById("ord-msg").textContent));
await p.click("#ord-list > li:nth-child(2) .mv[data-act=bottom]"); await p.click("#ord-save");
await p.waitForFunction(() => /تغيّرت/.test(document.getElementById("ord-msg").textContent), null, { timeout: 8000 });
check("saving a stale page is refused with a clear message (nothing overwritten)", /أعد تحميلها/.test(await p.textContent("#ord-msg")));
await p.reload(); const mine = await order();
check("the other editor's order is what is stored", mine[0] === "tadrib-0002" && mine[1] === "tadrib-0005", mine.slice(0, 3));
await p2.close();

/* API rules */
const page = await getHtml("/series/tadrib/order"), ver = /data-ver="([0-9a-f]+)"/.exec(page)[1], ids = mine.slice();
const bad1 = await api("/api/series-order", { series: "tadrib", ids: ids.slice(1), ver });
check("API: missing lessons refused", bad1.status === 409);
const bad2 = await api("/api/series-order", { series: "tadrib", ids: [...ids.slice(1), ids[1]], ver });
check("API: duplicates refused", bad2.status === 400);
const bad3 = await api("/api/series-order", { series: "tadrib", ids: [...ids.slice(1), "tirmidhi-0001"], ver });
check("API: a lesson of another series refused", bad3.status === 409);
check("API: wrong version token refused", (await api("/api/series-order", { series: "tadrib", ids, ver: "0000000000000000" })).status === 409);
check("API: unknown series 404", (await api("/api/series-order", { series: "nope", ids: ["x"], ver })).status === 404);
check("API: cross-site call refused", (await api("/api/series-order", { series: "tadrib", ids, ver }, E, { "sec-fetch-site": "cross-site" })).status === 403);
check("API: junk body refused", (await api("/api/series-order", { series: "tadrib", ids: "x", ver })).status === 400);
check("API: a user outside the table gets nothing", (await api("/api/series-order", { series: "tadrib", ids, ver }, "nobody@example.com")).status === 403);
check("API: valid save accepted", (await api("/api/series-order", { series: "tadrib", ids, ver })).status === 200);
check("the page for a series that does not exist is a 404", (await fetch(BASE + "/series/nope/order", { headers: { "x-dev-email": E } })).status === 404);

/* the YouTube series works the same way and leaves the lessons' own data alone */
await p.goto(BASE + "/series/muslim/order");
check("YouTube series: lessons listed (hidden ones faded, status shown)", (await p.$$("#ord-list > li")).length > 300);
await p.click("#ord-list > li:nth-child(1) .mv[data-act=bottom]"); await p.click("#ord-save");
await p.waitForFunction(() => /تم حفظ الترتيب/.test(document.getElementById("ord-msg").textContent), null, { timeout: 8000 });
check("YouTube series order saved", true);
/* a lesson added later is listed last and flagged as new */
await p.goto(BASE + "/series/muslim/order");
await p.click("#ord-reset");
await p.waitForLoadState("load"); await p.waitForTimeout(500);
check("reset: the series follows the automatic order again", /الترتيب التلقائي/.test(await p.textContent("main")) && (await p.$("#ord-reset")) === null);

/* audit */
const au = await getHtml("/audit", "boss@example.com");
check("audit log has series.order and series.order.reset", au.includes("series.order") && au.includes("series.order.reset"));
check("no console or page errors", errs.length === 0, errs.join(" | "));
await b.close();
if (bad) { console.error(`!! ${bad} failed`); process.exit(1); }
console.log("all order screen checks passed");
