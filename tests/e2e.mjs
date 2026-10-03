// End-to-end smoke test of the pre-rendered site (no-JS content, hydration, SPA navigation, legacy #/ links, search, players, 404, drawer).
// Needs:  npm i -D playwright     Usage:  node scripts/build.mjs && (cd dist && python3 -m http.server 8000) &  node tests/e2e.mjs http://localhost:8000
import { chromium } from "playwright";
const B=(process.argv[2]||'http://localhost:8000').replace(/\/$/,'');
const b=await chromium.launch();
(async()=>{const errs=[];let ok=0,bad=0;
const t=(n,c,info='')=>{(c?ok++:(bad++,console.log('  FAIL:',n,info)));};
const p=await b.newPage({viewport:{width:1280,height:800}});
p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>m.type()==='error'&&!/ERR_|Failed to load|net::|Refused/.test(m.text())&&errs.push(m.text()));
// 1. pre-rendered page has content without JS
const nojs=await b.newContext({javaScriptEnabled:false});const q=await nojs.newPage();await q.goto(B+'/series/muslim/');
t('no-JS series page has list', (await q.locator('.row').count())>300, await q.locator('.row').count());
t('no-JS has h1 + canonical', (await q.locator('h1').count())===1 && (await q.locator('link[rel=canonical]').getAttribute('href')).endsWith('/series/muslim/'));
await q.close();
// 2. hydration: no flash re-render
await p.goto(B+'/series/muslim/');await p.waitForTimeout(1200);
await p.evaluate(()=>{window.__mark=document.querySelector('#out .row');});
await p.fill('#q','الحج');await p.waitForTimeout(500);
t('series filter works after hydration',(await p.locator('#out .row').count())<60 && (await p.locator('#out .row').count())>10,await p.locator('#out .row').count());
// 3. SPA navigation (no reload)
await p.goto(B+'/');await p.waitForTimeout(1000);await p.evaluate(()=>{window.__nr=1});
await p.click('.spine >> nth=0');await p.waitForTimeout(700);
t('spine click -> series URL',/\/series\/[\w-]+\/$/.test(p.url()),p.url());
t('no full reload on link click',await p.evaluate(()=>window.__nr===1));
t('title updated',(await p.title()).includes('|'));
t('canonical updated',(await p.locator('#m-canon').getAttribute('href')).includes('/series/'));
t('focus moved to h1',await p.evaluate(()=>document.activeElement&&document.activeElement.tagName==='H1'));
t('sr-live announced',(await p.locator('#sr-live').textContent()).length>5);
await p.goBack();await p.waitForTimeout(500);t('back button returns home',p.url()===B+'/');
// 4. old hash URL redirect
await p.goto(B+'/#/watch/tirmidhi-0003');await p.waitForTimeout(1200);
t('hash #/watch -> /lesson/',p.url()===B+'/lesson/tirmidhi-0003/',p.url());
await p.goto(B+'/#/series/muslim');await p.waitForTimeout(1000);t('hash #/series -> /series/',p.url()===B+'/series/muslim/',p.url());
await p.goto(B+'/#/search?q=%D9%85%D8%B3%D9%84%D9%85');await p.waitForTimeout(1000);t('hash search -> /search/?q',p.url().startsWith(B+'/search/?q='),p.url());
// 5. search
await p.goto(B+'/search/?q='+encodeURIComponent('صحيح مسلم الحج'));await p.waitForTimeout(1200);
t('search results count',(await p.locator('#count').textContent()).includes('٥٥'),await p.locator('#count').textContent());
t('search is noindex',(await p.locator('#m-robots').getAttribute('content')).includes('noindex'));
// 6. home form -> search
await p.goto(B+'/');await p.waitForTimeout(1000);await p.fill('#q','فضائل');await p.press('#q','Enter');await p.waitForTimeout(800);
t('home search submit -> /search/?q',p.url().includes('/search/?q='),p.url());
// 7. lesson pages
await p.goto(B+'/lesson/tirmidhi-0003/');await p.waitForTimeout(1200);
t('audio element + src',(await p.locator('#aud').getAttribute('src')).startsWith('https://archive.org/'));
t('sidebar windowed (<=25 rows)',(await p.locator('.side .row').count())<=25);
await p.click('#next');await p.waitForTimeout(600);t('next lesson via SPA',p.url().includes('/lesson/tirmidhi-0004'),p.url());
await p.goto(B+'/lesson/BHlv9TkmsME/');await p.waitForTimeout(1000);
t('video is lite (no iframe yet)',(await p.locator('iframe').count())===0);
await p.click('.lite-play');await p.waitForTimeout(500);
t('iframe after click (nocookie)',(await p.locator('iframe').getAttribute('src')).startsWith('https://www.youtube-nocookie.com/embed/BHlv9TkmsME'));
// 8. 404
const r=await p.goto(B+'/lesson/does-not-exist/');t('unknown lesson -> 404 status',r.status()===404,r.status());
await p.goto(B+'/lesson/%E0%A4%A/');await p.waitForTimeout(600);t('malformed URL handled',(await p.locator('h1').count())===1);
// 9. drawer (mobile)
const m=await b.newPage({viewport:{width:390,height:800}});m.on('pageerror',e=>errs.push('m:'+e.message));
await m.goto(B+'/');await m.waitForTimeout(1200);await m.click('#burger');await m.waitForTimeout(500);
t('drawer opens, aria-expanded',(await m.locator('#burger').getAttribute('aria-expanded'))==='true');
t('page inert while drawer open',await m.evaluate(()=>document.querySelector('#app').inert===true));
t('focus inside drawer',await m.evaluate(()=>document.getElementById('drawer').contains(document.activeElement)));
await m.keyboard.press('Escape');await m.waitForTimeout(400);
t('Esc closes + focus back on burger',await m.evaluate(()=>document.activeElement.id==='burger' && !document.getElementById('drawer').classList.contains('open')));
console.log(`${ok} passed, ${bad} failed | page errors:`,errs);await b.close();process.exit(bad||errs.length?1:0);})();
