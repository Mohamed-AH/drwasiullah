/* Phase 7: axe on the portal pages (light/dark x desktop/mobile), no horizontal page scroll, no console errors. Needs Playwright + axe-core resolvable. */
import { chromium } from "playwright";
import fs from "node:fs";
import { createRequire } from "node:module";
const BASE = process.env.BASE || "http://localhost:8791", SHOT = process.env.SHOT;
const PAGES = process.env.PAGES ? process.env.PAGES.split(",") : ["/analytics?range=7", "/analytics", "/analytics?range=365&event=all", "/analytics?range=all", "/analytics?series=tadrib", "/analytics?range=7&series=no-data-series"];
const axeSrc = fs.readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });
let bad = 0, n = 0;
for (const [scheme, vp] of [["light", { width: 1280, height: 900 }], ["dark", { width: 1280, height: 900 }], ["light", { width: 390, height: 800 }], ["dark", { width: 390, height: 800 }]]) {
  const ctx = await b.newContext({ viewport: vp, colorScheme: scheme, bypassCSP: true, reducedMotion: "reduce", extraHTTPHeaders: { "x-dev-email": "boss@example.com" } }), p = await ctx.newPage(), errs = [];
  p.on("pageerror", e => errs.push(String(e))); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  for (const q of PAGES) {
    await p.goto(`${BASE}${q}`); await p.addScriptTag({ content: axeSrc });
    const r = await p.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] }));
    const over = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    n++; if (r.violations.length || over || errs.length) { bad++; console.log("FAIL", scheme, vp.width, q, over ? "h-scroll" : "", errs.join("|"), r.violations.map(v => v.id + " " + v.nodes.map(x => x.target.join(" ")).join(";")).join(" || ")); }
    if (SHOT && q === PAGES[1 % PAGES.length]) await p.screenshot({ path: `${SHOT}/${(process.env.SHOTNAME || "analytics")}-${scheme}-${vp.width}.png`, fullPage: true });
  }
  await ctx.close();
}
await b.close();
console.log(bad ? `${bad} of ${n} FAILED` : `ok   axe: 0 violations, no horizontal scroll, no console errors (${n} page loads)`);
process.exit(bad ? 1 : 0);
