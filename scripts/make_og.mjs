#!/usr/bin/env node
/* Renders site/og/default.png (1200×630, the picture shown when a link is shared) from the site's own fonts. Dev tool: needs Playwright.
   Usage: node scripts/make_og.mjs */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fonts = pathToFileURL(path.join(ROOT, "site", "fonts")).href;
const html = `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:Aref;src:url(${fonts}/aref-ruqaa-arabic-700-normal.woff2)}
@font-face{font-family:Aref;font-weight:400;src:url(${fonts}/aref-ruqaa-arabic-400-normal.woff2)}
@font-face{font-family:Naskh;src:url(${fonts}/noto-naskh-arabic-arabic-500-normal.woff2)}
*{box-sizing:border-box}body{margin:0;width:1200px;height:630px;direction:rtl;position:relative;overflow:hidden;color:#2b1d12;
 background:radial-gradient(900px 420px at 50% -10%,rgba(214,169,58,.35),transparent 70%),
 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='72' height='72' viewBox='0 0 72 72'%3E%3Cg fill='none' stroke='%23a8791c' stroke-opacity='.2'%3E%3Crect x='14' y='14' width='44' height='44'/%3E%3Crect x='14' y='14' width='44' height='44' transform='rotate(45 36 36)'/%3E%3Ccircle cx='36' cy='36' r='9'/%3E%3C/g%3E%3C/svg%3E"),#f1e5c8}
.frame{position:absolute;inset:26px;border:2px solid #a8791c;outline:1px solid #a8791c;outline-offset:8px}
.seal{position:absolute;top:70px;left:50%;margin-left:-38px;width:76px;height:76px}
.seal i,.seal b{position:absolute;inset:8px;background:#a8321f;border-radius:7px}.seal b{transform:rotate(45deg)}
.bism{position:absolute;top:150px;width:100%;text-align:center;font:400 40px Aref;color:#a8321f}
h1{position:absolute;top:236px;width:100%;margin:0;text-align:center;font:700 112px/1.2 Aref}
h1 em{font-style:normal;color:#a8321f}
.dua{position:absolute;top:386px;width:100%;text-align:center;font:400 54px Aref;color:#a8321f}
.sub{position:absolute;top:482px;width:100%;text-align:center;font:500 34px Naskh;color:#5b4630}
.url{position:absolute;bottom:58px;width:100%;text-align:center;font:600 26px Naskh;color:#a8791c;letter-spacing:2px;direction:ltr}
</style><div class="frame"></div><div class="seal"><i></i><b></b></div>
<div class="bism">بسم الله الرحمن الرحيم</div>
<h1>الشيخ <em>وصي الله</em> بن محمد عباس</h1><div class="dua">حفظه الله</div>
<div class="sub">دروس · محاضرات · خطب · كتب</div><div class="url">drwasiullah.com</div>`;
const tmp = path.join(os.tmpdir(), "og-default.html");
fs.writeFileSync(tmp, html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(pathToFileURL(tmp).href); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(500);
fs.mkdirSync(path.join(ROOT, "site", "og"), { recursive: true });
await page.screenshot({ path: path.join(ROOT, "site", "og", "default.png") });
await browser.close(); console.log("wrote site/og/default.png");
