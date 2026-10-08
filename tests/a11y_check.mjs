// Accessibility check (axe-core, WCAG 2.2 A/AA) over key pages × light/dark × desktop/mobile.
// Needs:  npm i -D playwright axe-core      then:  node scripts/build.mjs && (cd dist && python3 -m http.server 8000) &
//         node tests/a11y_check.mjs http://localhost:8000
import { chromium } from "playwright";
import { createRequire } from "node:module";
const axeSrc = (await import("node:fs")).readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");

const BASE = (process.argv[2] || "http://localhost:8000").replace(/\/$/, "");
const PAGES = ["/", "/library/", "/section/audio/", "/series/muslim/", "/series/tirmidhi/", "/series/khutab/", "/lesson/tirmidhi-0003/", "/lesson/BHlv9TkmsME/", "/books/", "/schedule/", "/search/?q=%D9%85%D8%B3%D9%84%D9%85", "/about/", "/404.html"];
const browser = await chromium.launch();
let total = 0;
for (const [theme, w, h] of [["light", 1280, 800], ["dark", 1280, 800], ["light", 390, 844], ["dark", 390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(t => localStorage.setItem("theme", t), theme);
  for (const p of PAGES) {
    const page = await ctx.newPage();
    const r = await page.goto(BASE + p);
    if (r.status() === 404 && p !== "/404.html" && p !== "/about/" && p !== "/schedule/") { console.log(`skip ${p} (404)`); await page.close(); continue; }
    await page.waitForTimeout(1500);
    await page.evaluate(src => { (0, eval)(src); }, axeSrc);
    const res = await page.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"], resultTypes: ["violations"] })).violations
      .map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, sample: v.nodes.slice(0, 2).map(n => n.target.join(" ") + " :: " + (n.any[0]?.message || n.failureSummary || "").slice(0, 140)) })));
    for (const v of res) { total++; console.log(`[${theme} ${w}px] ${p}  ${v.impact}  ${v.id} ×${v.n} — ${v.help}\n      ${v.sample.join("\n      ")}`); }
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log(total ? `\n${total} violation group(s)` : "\nNo axe violations");
process.exit(total ? 1 : 0);
