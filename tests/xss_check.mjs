// Input-handling security check. Needs Playwright:  npm i -D playwright   (or use a global install)
// Usage:  (cd site && python3 -m http.server 8000) &  node tests/xss_check.mjs http://localhost:8000
import { chromium } from "playwright";

const BASE = (process.argv[2] || "http://localhost:8000").replace(/\/$/, "");
const XSS = `"><img src=x onerror="window.__x=1"><script>window.__x=1</script>`;
const URL_PAYLOADS = [
  `#/search?q=${encodeURIComponent(XSS)}`,
  `#/search?q=%E0%A4%A`,                                   // malformed percent-encoding
  `#/search?q=${"a".repeat(5000)}`,                         // oversize
  `#/search?q=%E2%80%AEevil%00%1B[31m`,                     // RTL override + NUL + ESC
  `#/search?sec=${encodeURIComponent(XSS)}&sort=${encodeURIComponent(XSS)}`,
  `#/watch/${encodeURIComponent(XSS)}`,
  `#/watch/%E0%A4%A`,
  `#/series/__proto__`, `#/series/constructor`, `#/section/__proto__`, `#/section/toString`, `#/watch/__proto__`,
  `#/nonexistent/${encodeURIComponent(XSS)}`,
];
const TYPED = [XSS, "a".repeat(5000), "‮evil\u0000\u001b", "صحيح   مسلم\t\n  الحج", "' OR 1=1 --", "{{7*7}} ${7*7}"];
const PAGES_WITH_INPUT = ["#/", "#/search", "#/series/muslim"];

const browser = await chromium.launch();
let failures = 0;
const fail = (m) => { failures++; console.log("  FAIL:", m); };

for (const hash of [...URL_PAYLOADS.map(h => [h, "url"]), ...PAGES_WITH_INPUT.map(h => [h, "typed"])]) {
  const [h, kind] = hash;
  const page = await browser.newPage();
  const errs = [], dialogs = [];
  page.on("pageerror", e => errs.push(e.message));
  page.on("dialog", d => { dialogs.push(d.message()); d.dismiss(); });
  await page.goto(BASE + "/index.html");
  await page.waitForSelector("#app *", { timeout: 8000 }).catch(() => {});
  const payloads = kind === "url" ? [null] : TYPED;
  for (const t of payloads) {
    if (kind === "url") { await page.evaluate(x => (location.hash = x), h); }
    else {
      await page.evaluate(x => (location.hash = x), h);
      await page.waitForTimeout(150);
      const box = page.locator("#q");
      if (!(await box.count())) { fail(`${h}: no #q input`); continue; }
      await box.fill(t.slice(0, 5000));
      if (h === "#/") await box.press("Enter");
    }
    await page.waitForTimeout(450);
    const label = kind === "url" ? `url ${h.slice(0, 60)}` : `typed ${JSON.stringify(t.slice(0, 24))} on ${h}`;
    const r = await page.evaluate(() => ({
      x: window.__x, injected: document.querySelectorAll("#app img[src='x'], #app script, #app [onerror]").length,
      text: document.querySelector("#app")?.innerText.trim().length || 0,
      qlen: document.getElementById("q")?.value.length ?? 0,
      hashlen: location.hash.length, hasUndef: /undefined|\[object|NaN/.test(document.querySelector("#app")?.innerText || ""),
    }));
    if (r.x) fail(`${label}: script executed`);
    if (r.injected) fail(`${label}: injected element in DOM`);
    if (dialogs.length) fail(`${label}: dialog ${dialogs[0]}`);
    if (errs.length) fail(`${label}: JS error "${errs[0].slice(0, 80)}"`);
    if (!r.text) fail(`${label}: page rendered empty`);
    if (r.hasUndef) fail(`${label}: page shows undefined/[object]/NaN`);
    if (r.hashlen > 400) fail(`${label}: URL hash ${r.hashlen} chars (unbounded)`);
    errs.length = 0;
  }
  await page.close();
}
await browser.close();
console.log(failures ? `\n${failures} failure(s)` : "\nAll input-handling checks passed");
process.exit(failures ? 1 : 0);
