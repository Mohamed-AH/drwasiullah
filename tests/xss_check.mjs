// Input-handling security check. Needs Playwright:  npm i -D playwright   (or a global install)
// Usage:  node scripts/build.mjs && (cd dist && python3 -m http.server 8000) &  node tests/xss_check.mjs http://localhost:8000
import { chromium } from "playwright";

const BASE = (process.argv[2] || "http://localhost:8000").replace(/\/$/, "");
const XSS = `"><img src=x onerror="window.__x=1"><script>window.__x=1</script>`;
const e = encodeURIComponent;
const PATHS = [
  `/search/?q=${e(XSS)}`, `/search/?q=%E0%A4%A`, `/search/?q=${"a".repeat(5000)}`, `/search/?q=%E2%80%AEevil%00%1B[31m`,
  `/search/?sec=${e(XSS)}&sort=${e(XSS)}`,
  `/lesson/${e(XSS)}/`, `/lesson/%E0%A4%A/`, `/lesson/__proto__/`, `/series/__proto__/`, `/series/constructor/`, `/section/__proto__/`, `/section/toString/`,
  `/nonexistent/${e(XSS)}/`, `/#/watch/${e(XSS)}`, `/#/search?q=${e(XSS)}`, `/#/series/__proto__`,
];
const TYPED = [XSS, "a".repeat(5000), "‮evil\u0000\u001b", "صحيح   مسلم\t\n  الحج", "' OR 1=1 --", "{{7*7}} ${7*7}"];
const PAGES_WITH_INPUT = ["/", "/search/", "/series/muslim/"];

const browser = await chromium.launch();
let failures = 0;
const fail = m => { failures++; console.log("  FAIL:", m); };

async function check(page, label, errs, dialogs) {
  await page.waitForTimeout(450);
  const r = await page.evaluate(() => ({
    x: window.__x, injected: document.querySelectorAll("#app img[src='x'], #app script, #app [onerror]").length,
    text: document.body.innerText.trim().length, href: location.href.length,
    undef: /undefined|\[object|NaN/.test(document.querySelector("#app")?.innerText || ""),
  }));
  if (r.x) fail(`${label}: script executed`);
  if (r.injected) fail(`${label}: injected element in DOM`);
  if (dialogs.length) fail(`${label}: dialog ${dialogs[0]}`);
  if (errs.length) fail(`${label}: JS error "${errs[0].slice(0, 80)}"`);
  if (!r.text) fail(`${label}: page rendered empty`);
  if (r.undef) fail(`${label}: page shows undefined/[object]/NaN`);
  if (r.href > 700) fail(`${label}: URL ${r.href} chars (unbounded)`);
  errs.length = 0;
}
const fresh = async () => {
  const page = await browser.newPage(), errs = [], dialogs = [];
  page.on("pageerror", x => errs.push(x.message)); page.on("dialog", d => { dialogs.push(d.message()); d.dismiss(); });
  return { page, errs, dialogs };
};

for (const p of PATHS) {                                    // A: direct load of a hostile URL
  const { page, errs, dialogs } = await fresh();
  await page.goto(BASE + p); await page.waitForTimeout(600);
  await check(page, `direct ${p.slice(0, 60)}`, errs, dialogs); await page.close();
}
for (const p of PATHS.filter(x => !x.startsWith("/#"))) {   // B: the same URLs through the client-side router (history API)
  const { page, errs, dialogs } = await fresh();
  await page.goto(BASE + "/"); await page.waitForTimeout(1200);
  await page.evaluate(x => { history.pushState(null, "", x); dispatchEvent(new PopStateEvent("popstate")); }, p);
  await check(page, `spa    ${p.slice(0, 60)}`, errs, dialogs); await page.close();
}
for (const pg of PAGES_WITH_INPUT) for (const t of TYPED) {  // C: typing into every search box
  const { page, errs, dialogs } = await fresh();
  await page.goto(BASE + pg); await page.waitForTimeout(1200);
  const box = page.locator("#q"); await box.fill(t.slice(0, 5000));
  if (pg === "/") await box.press("Enter");
  await check(page, `typed ${JSON.stringify(t.slice(0, 20))} on ${pg}`, errs, dialogs);
  const len = await page.evaluate(() => document.getElementById("q")?.value.length ?? 0);
  if (len > 100) fail(`typed on ${pg}: input accepted ${len} chars (maxlength 100)`);
  await page.close();
}
await browser.close();
console.log(failures ? `\n${failures} failure(s)` : "\nAll input-handling checks passed");
process.exit(failures ? 1 : 0);
