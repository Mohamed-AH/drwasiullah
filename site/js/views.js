/* Pure page renderers: every page is a function returning { html, title, description, path, jsonld, ... }.
   Used by scripts/build.mjs (pre-rendering to real static HTML) and by js/app.js (client-side navigation). */
import {
  SITE, NAME, NAME_FULL, YT_CHANNEL, WP_SITE, SECTIONS, SPINE, SPINE_PALETTE, SPINE_H, PAGE, MAXQ,
  state, byId, seriesById, secById, ic, esc, fmtNum, fmtYear, ldate, dur, isoDur, hours, dg, cleanQuery, oneOf, safeUrl, safeYt, safeLang, safeDecode, jsonLd,
  kindIcon, useLabel, label, mainTitle, fullTitle, secOfSeries, secOfLesson, seriesOrder, lang, thumb, STAR, match, sectionCount, visible, isFlat, seriesIn, href, fmtDate,
} from "./core.js";

const OG_DEFAULT = SITE + "/og/default.png";
const clip = (s, n) => { s = String(s).replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s\S*$/, "") + "…" : s; };

/* ───────── Components ───────── */
export const searchBox = (ph, v = "", id = "q", asForm = false) => {
  const inner = `<label class="sr-only" for="${id}">${esc(ph)}</label>${ic("search", 22)}<input id="${id}" name="q" type="search" placeholder="${esc(ph)}" value="${esc(v)}" autocomplete="off" enterkeyhint="search" maxlength="${MAXQ}" spellcheck="false">`;
  return asForm ? `<form class="search" role="search" action="/search/" method="get">${inner}</form>` : `<div class="search" role="search">${inner}</div>`;
};

export function spine(s, i) {
  const w = Math.round(74 + Math.min(70, Math.log(s.count + 1) * 11.5));
  return `<a class="spine" href="${href.series(s.id)}" aria-label="${esc(s.title)}، ${fmtNum(s.count)} درسًا" title="${esc(s.title)} — ${fmtNum(s.count)} درسًا" style="--fs:${s.title.length > 34 ? 16 : s.title.length > 24 ? 18 : 23}px;--w:${w}px;--h:${SPINE_H[i % SPINE_H.length]}px;--c:${SPINE[s.id] || SPINE_PALETTE[i % SPINE_PALETTE.length]};--i:${i}">
    ${STAR.replace("<svg", '<svg class="sp-star"')}<span class="sp-title" aria-hidden="true">${esc(s.title)}</span><span class="sp-count" aria-hidden="true">${fmtNum(s.count)}</span></a>`;
}
export const shelf = list => `<div class="shelf-wrap"><div class="shelf">${list.map((s, i) => spine(s, i)).join("")}</div><div class="board"></div>
  <p class="shelf-note">سُمك الكتاب بقدر عدد دروسه — اضغط على كتاب لفتح السلسلة</p></div>`;

export function lessonCard(l, i = 0) {
  const s = seriesById[l.series];
  const title = fullTitle(l);
  const media = l.kind === "audio"
    ? `<div class="thumb aud"><span class="aud-ic">${ic("headphones", 44)}</span><span class="aud-t">${esc(s.title)}</span>${l.duration ? `<span class="dur">${dur(l.duration)}</span>` : ""}</div>`
    : `<div class="thumb"><img loading="lazy" src="${thumb(l.id)}" alt="" width="320" height="180"><span class="play"><i>${ic("play", 24)}</i></span>${l.duration ? `<span class="dur">${dur(l.duration)}</span>` : ""}</div>`;
  const heading = useLabel(l) ? `${s.title} — ${label(l)}${l.section ? " · " + l.section : ""}` : title;
  return `<a class="card" href="${href.lesson(l.id)}" style="--i:${i}"${lang(l)}>${media}
    <div class="card-b"><h3>${esc(heading)}</h3>
    <div class="meta"><span class="tag">${ic(kindIcon(l), 13)}${esc(secOfSeries(s).title)}</span>${ldate(l) ? `<span>${ldate(l)}</span>` : ""}</div></div></a>`;
}
export function seriesCard(s, i = 0) {
  const span = s.first ? `<span class="tag plain">${fmtYear(s.first)} – ${fmtYear(s.last)}</span>` : "";
  return `<a class="card scard" href="${href.series(s.id)}" style="--i:${i}"><h3>${esc(s.title)}</h3>${s.description ? `<p>${esc(s.description)}</p>` : ""}
    <div class="meta"><span class="tag gold">${fmtNum(s.count)} درسًا</span>${hours(s.seconds) ? `<span class="tag plain">${hours(s.seconds)}</span>` : ""}${span}</div></a>`;
}
export function row(l, opts = {}) {
  const s = seriesById[l.series];
  const sub = (opts.showSeries ? `${esc(s.title)}` : "") + (opts.showSeries && ldate(l) ? " · " : "") + ldate(l);
  return `<a class="row${opts.now ? " now" : ""}" href="${href.lesson(l.id)}" style="--i:${Math.min(opts.i || 0, 24)}"${opts.now ? ' aria-current="page"' : ""}${lang(l)}>
    <span class="no">${l.n != null ? fmtNum(l.n) : ic(kindIcon(l), 18)}</span>
    <span class="tt"><span class="t">${esc(mainTitle(l, !opts.noSection))}</span><span class="s">${ic(kindIcon(l), 12, "k")}${sub}</span></span>
    ${l.duration ? `<span class="d">${dur(l.duration)}</span>` : ""}</a>`;
}
const tile = (s, n) => `<a class="tile" href="${href.section(s)}"><span class="tile-ic">${ic(s.icon, 26)}</span>
    <span class="tile-b"><strong>${s.title}</strong><span>${s.desc}</span></span><span class="tile-n">${fmtNum(n)}</span></a>`;

/* crumbs -> { html, ld } ; items: [{t, h?}] (last one has no href) */
function crumbs(items) {
  const all = [{ t: "الرئيسية", h: "/" }, ...items];
  const html = `<nav class="crumb" aria-label="مسار الصفحة">${all.map((x, i) => x.h && i < all.length - 1 ? `<a href="${x.h}">${esc(x.t)}</a>` : `<span${i === all.length - 1 ? ' aria-current="page"' : ""}>${esc(x.t)}</span>`).join(" / ")}</nav>`;
  const ld = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: all.map((x, i) => ({ "@type": "ListItem", position: i + 1, name: x.t, ...(x.h && i < all.length - 1 ? { item: SITE + x.h } : {}) })) };
  return { html, ld };
}
const mkPage = o => ({ status: 200, noindex: false, jsonld: [], image: OG_DEFAULT, ogType: "website", nav: "", wire: { t: "none" }, ...o });
const withSite = t => `${t} | ${NAME}`;

/* ───────── Pages ───────── */
function home() {
  const DB = state.DB, vis = visible();
  const top = DB.series.slice().sort((a, b) => b.count - a.count).slice(0, 10);
  const latest = DB.lessons.filter(l => l.date).slice(0, 8);
  const bio = state.bio;
  const html = `
    <section class="hero"><p class="bism">بسم الله الرحمن الرحيم</p>
      <h1>الشيخ <em>وصي الله</em> بن محمد عباس<span class="dua"> حفظه الله</span></h1>
      <div class="orn" aria-hidden="true">${STAR}</div>
      <p class="hero-p">فهرس منظّم لدروس الشيخ أ.د. وصي الله بن محمد عباس حفظه الله ومحاضراته وخطبه وكتبه، مرتّبة بحسب الأقسام والكتب لتصل إلى ما تريده بسرعة.</p>
      ${searchBox("ابحث عن درس أو كتاب أو باب… مثال: صحيح مسلم كتاب الحج", "", "q", true)}
      <ul class="stats"><li><b>${fmtNum(DB.lessons.length)}</b>مادة علمية</li><li><b>${fmtNum(DB.series.length)}</b>سلسلة</li>${DB.books.length ? `<li><b>${fmtNum(DB.books.length)}</b>كتابًا</li>` : ""}</ul></section>
    ${bio ? `<section class="about-teaser" aria-labelledby="ab-h"><h2 id="ab-h">عن الشيخ</h2>${bio.summary ? `<p>${esc(bio.summary)}</p>` : ""}<a class="btn" href="${href.about()}">اقرأ المزيد ${ic("chevron-left", 16)}</a></section>` : ""}
    <div class="sec"><h2>الأقسام</h2></div>
    <div class="tiles">${vis.map(s => tile(s, sectionCount(s.id))).join("")}</div>
    <div class="sec"><h2>خزانة الكتب</h2><a href="${href.library()}">كل الأقسام ${ic("chevron-left", 15)}</a></div>
    ${shelf(top)}
    <div class="sec"><h2>أحدث المواد</h2><a href="${href.search()}">الكل ${ic("chevron-left", 15)}</a></div>
    <div class="grid">${latest.map(lessonCard).join("")}</div>`;
  return mkPage({
    nav: "home", path: "/", html, wire: { t: "home" },
    title: `دروس الشيخ وصي الله عباس — ${NAME_FULL}`,
    description: `فهرس دروس الشيخ وصي الله عباس ومحاضراته وخطبه وكتبه (${NAME_FULL}): شروح صحيح مسلم وسنن ابن ماجه وسنن أبي داود والترمذي وغيرها، للاستماع والمشاهدة والتحميل.`,
    jsonld: [
      { "@context": "https://schema.org", "@type": "WebSite", name: NAME_FULL, alternateName: ["دروس الشيخ وصي الله عباس"], url: SITE + "/", inLanguage: "ar",
        potentialAction: { "@type": "SearchAction", target: `${SITE}/search/?q={search_term_string}`, "query-input": "required name=search_term_string" } },
      { "@context": "https://schema.org", "@type": "Person", name: "وصي الله بن محمد عباس", alternateName: ["وصي الله عباس", "الشيخ وصي الله عباس"], honorificPrefix: "الشيخ", url: SITE + "/", sameAs: [YT_CHANNEL, WP_SITE] },
    ],
  });
}

function library() {
  const c = crumbs([{ t: "الأقسام" }]);
  return mkPage({
    nav: "library", path: "/library/", wire: { t: "none" },
    html: `${c.html}<h1 class="page-h">المكتبة</h1><p class="lede">اختر قسمًا لتصفّح محتواه.</p><div class="tiles">${visible().map(s => tile(s, sectionCount(s.id))).join("")}</div>`,
    title: withSite("المكتبة — أقسام الدروس والمحاضرات والكتب"), description: `أقسام موقع ${NAME_FULL}: الدروس المرئية والصوتية والمحاضرات والخطب والدروس بالأردية والكتب.`, jsonld: [c.ld],
  });
}

function sectionPage(id) {
  const sec = secById[id], ser = sec ? seriesIn(id) : [];
  if (!sec || id === "books" || ser.length < 2) return null;     // flat sections link straight to their only series
  const items = state.DB.lessons.filter(l => secOfLesson(l).id === id), latest = items.filter(l => l.date).slice(0, 8);
  const c = crumbs([{ t: sec.title }]);
  return mkPage({
    nav: id, path: `/section/${id}/`,
    html: `${c.html}
      <div class="title-page"><span class="tile-ic big">${ic(sec.icon, 34)}</span><div><h1 class="page-h">${sec.title}</h1><p class="lede">${sec.desc} — ${fmtNum(ser.length)} سلسلة · ${fmtNum(items.length)} مادة</p></div></div>
      ${shelf(ser.slice().sort((a, b) => b.count - a.count))}
      <div class="sec"><h2>تفاصيل السلاسل</h2></div><div class="grid">${ser.map(seriesCard).join("")}</div>
      ${latest.length ? `<div class="sec"><h2>أحدث المواد</h2><a href="${href.search(`?sec=${id}`)}">الكل ${ic("chevron-left", 15)}</a></div><div class="grid">${latest.map(lessonCard).join("")}</div>` : ""}`,
    title: withSite(`${sec.title} — ${ser.length} سلسلة`), description: clip(`${sec.desc} ${fmtNum(ser.length)} سلسلة و${fmtNum(items.length)} مادة من ${NAME_FULL}.`, 160),
    jsonld: [c.ld],
  });
}

/* series info (memoised) + list renderer shared by the static page and the client-side filters */
const _info = new Map();
export function seriesInfo(id) {
  if (_info.has(id)) return _info.get(id);
  const s = seriesById[id]; if (!s) return null;
  const all = state.DB.lessons.filter(l => l.series === id);
  const ordered = !!s.ordered || all.some(l => l.n != null);
  const when = l => l.date || String(l.o).padStart(8, "0"), first = {};
  all.forEach(l => { if (l.section && (!first[l.section] || when(l) < first[l.section])) first[l.section] = when(l); });
  const sections = Object.keys(first).sort((x, y) => first[x].localeCompare(first[y]));   // chronological: by when each book was first taught
  const o = { s, sec: secOfSeries(s), flat: isFlat(s.sec), all, ordered, sections, sib: all.slice().sort(ordered ? seriesOrder : (a, b) => (b.date || "").localeCompare(a.date || "") || a.o - b.o) };
  _info.set(id, o); return o;
}
export function seriesList(info, st) {
  let r = info.all.filter(l => (!st.sec || l.section === st.sec) && match(l, st.q));
  r = st.sort === "num" ? r.slice().sort(seriesOrder) : st.sort === "old" ? r.slice().reverse() : r;
  let html = "", last, k = 0;
  for (const l of r) {
    if (st.sort === "num" && !st.sec && info.sections.length > 1 && l.section !== last) { last = l.section; html += `<h2 class="sect">${esc(l.section || "أخرى")}</h2>`; }
    html += row(l, { noSection: true, i: k++ });
  }
  return { count: r.length, html: r.length ? `<div class="list cols">${html}</div>` : `<p class="empty">لا توجد نتائج.</p>` };
}

function seriesPage(id) {
  const info = seriesInfo(id); if (!info) return null;
  const { s, sec, flat, ordered, sections } = info, ix = state.DB.series.indexOf(s);
  const st = { q: "", sec: "", sort: ordered ? "num" : "new" };
  const list = seriesList(info, st);
  const c = crumbs(flat ? [{ t: sec.title }] : [{ t: sec.title, h: href.section(sec) }, { t: s.title }]);
  const head = flat ? `<span class="tile-ic big">${ic(sec.icon, 34)}</span>`
    : `<span class="spine mini" aria-hidden="true" style="--c:${SPINE[s.id] || SPINE_PALETTE[ix % SPINE_PALETTE.length]}">${STAR.replace("<svg", '<svg class="sp-star"')}<span class="sp-count">${fmtNum(s.count)}</span></span>`;
  const html = `${c.html}
    <div class="title-page">${head}<div><h1 class="page-h">${esc(s.title)}</h1><p class="lede">${esc(s.description || sec.desc)} — ${fmtNum(s.count)} درسًا${hours(s.seconds) ? " · " + hours(s.seconds) : ""}</p>${s.extra ? `<a class="btn" href="${esc(safeUrl(s.extra.url))}" target="_blank" rel="noopener">${ic("external-link", 17)} ${esc(s.extra.label)}</a>` : ""}</div></div>
    <div class="bar">${searchBox("ابحث داخل السلسلة (رقم الدرس أو الباب)…")}
      <select id="sort" aria-label="الترتيب"><option value="new"${st.sort === "new" ? " selected" : ""}>الأحدث أولًا</option><option value="old">الأقدم أولًا</option>${ordered ? `<option value="num"${st.sort === "num" ? " selected" : ""}>بالترتيب (الأول فالأخير)</option>` : ""}</select></div>
    ${sections.length > 1 ? `<div class="pill-row" id="secs" role="group" aria-label="تصفية حسب الكتاب"><button type="button" class="pill on" aria-pressed="true" data-s="">الكل</button>${sections.map(x => `<button type="button" class="pill" aria-pressed="false" data-s="${esc(x)}">${esc(x)}</button>`).join("")}</div>` : ""}
    <p class="count" id="count" role="status">${fmtNum(list.count)} درسًا</p><div id="out"${s.sec === "urdu" ? ' lang="ur"' : ""}>${list.html}</div>`;
  return mkPage({
    nav: s.sec, path: href.series(s.id), html, wire: { t: "series", id: s.id }, ogType: "website",
    title: withSite(`${s.title} — ${fmtNum(s.count)} درسًا`),
    description: clip(`${s.description ? s.description + " " : ""}${fmtNum(s.count)} درسًا${hours(s.seconds) ? " (" + hours(s.seconds) + ")" : ""} من ${sec.title} — ${NAME_FULL}.`, 160),
    jsonld: [c.ld, { "@context": "https://schema.org", "@type": "CollectionPage", name: s.title, url: SITE + href.series(s.id), inLanguage: s.sec === "urdu" ? "ur" : "ar",
      mainEntity: { "@type": "ItemList", numberOfItems: info.sib.length, itemListElement: info.sib.map((l, i) => ({ "@type": "ListItem", position: i + 1, url: SITE + href.lesson(l.id), name: fullTitle(l) })) } }],
  });
}

const MIME = { mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4", ogg: "audio/ogg", wav: "audio/wav" };
function lessonPage(id) {
  const l = byId[id]; if (!l) return null;
  const info = seriesInfo(l.series), { s, sec, flat, ordered, sib } = info;
  const i = sib.findIndex(x => x.id === l.id), prev = sib[i - 1], next = sib[i + 1];
  const W = 12, win = sib.slice(Math.max(0, i - W), i + W + 1), title = fullTitle(l);
  const player = l.kind === "audio"
    ? `<div class="frame"><div class="audio-panel"><span class="disc">${ic("headphones", 46)}</span><p class="ap-t">${esc(s.title)}</p>
         <audio id="aud" controls preload="metadata" src="${esc(safeUrl(l.src))}"${l.src_alt ? ` data-alt="${esc(safeUrl(l.src_alt))}"` : ""} aria-label="${esc(title)}"></audio>
         <div class="speeds" role="group" aria-label="سرعة التشغيل">${[1, 1.25, 1.5, 2].map(v => `<button type="button" data-v="${v}" class="${v === 1 ? "on" : ""}" aria-pressed="${v === 1}">${fmtNum(v).replace("٫", ".")}×</button>`).join("")}</div></div></div>`
    : `<div class="frame"><div class="player lite" data-yt="${safeYt(l.id)}"><img src="https://i.ytimg.com/vi/${safeYt(l.id)}/hqdefault.jpg" alt="" width="480" height="360"><button type="button" class="lite-play" aria-label="تشغيل الفيديو: ${esc(title)}"><i>${ic("play", 30)}</i></button></div></div>`;
  const ext = l.kind === "audio"
    ? `<a class="btn" href="${esc(safeUrl(l.src))}" download target="_blank" rel="noopener">${ic("download", 17)} تحميل</a>`
    : `<a class="btn" href="https://www.youtube.com/watch?v=${safeYt(l.id)}" target="_blank" rel="noopener">${ic("external-link", 17)} فتح في يوتيوب</a>`;
  const c = crumbs(flat ? [{ t: sec.title, h: href.series(s.id) }, { t: title }] : [{ t: sec.title, h: href.section(sec) }, { t: s.title, h: href.series(s.id) }, { t: title }]);
  const html = `${c.html}
    <div class="watch"><div>${player}
      <h1 class="w-title"${lang(l)}>${esc(title)}</h1>
      <div class="w-meta">${l.section ? `<span class="tag gold">${esc(l.section)}</span>` : ""}<span class="tag">${ic(kindIcon(l), 13)}${sec.title}</span>${ldate(l) ? `<span class="tag plain">${ldate(l)}</span>` : ""}${l.duration ? `<span class="tag plain">${ic("clock", 13)}${dur(l.duration)}</span>` : ""}</div>
      ${useLabel(l) ? `<p class="orig">${esc(l.title)}</p>` : ""}
      <div class="btns">
        ${next ? `<a class="btn pri" id="next" rel="next" href="${href.lesson(next.id)}">التالي ${ic("chevron-left", 17)}</a>` : `<span class="btn pri" aria-disabled="true">التالي ${ic("chevron-left", 17)}</span>`}
        ${prev ? `<a class="btn" rel="prev" href="${href.lesson(prev.id)}">${ic("chevron-left", 17, "flip")} السابق</a>` : `<span class="btn" aria-disabled="true">${ic("chevron-left", 17, "flip")} السابق</span>`}
        ${ext}<button type="button" class="btn" id="share">${ic("link", 17)} نسخ الرابط</button></div>
    </div>
    <aside class="side" aria-labelledby="side-h"><h2 id="side-h">${esc(s.title)} <small>${fmtNum(i + 1)} / ${fmtNum(sib.length)}</small></h2>
      <div class="scroll"${s.sec === "urdu" ? ' lang="ur"' : ""}>${win.map(x => row(x, { now: x.id === l.id })).join("")}</div>
      <a class="side-all" href="${href.series(s.id)}">كل دروس السلسلة (${fmtNum(sib.length)}) ${ic("chevron-left", 15)}</a></aside></div>`;
  const desc = clip(`${l.kind === "audio" ? "تسجيل صوتي" : "درس مرئي"}: ${title}${ldate(l) ? " — " + ldate(l) : ""}. ${NAME_FULL}.`, 160);
  const ld = l.kind === "audio"
    ? { "@type": "AudioObject", contentUrl: safeUrl(l.src), encodingFormat: MIME[(l.src.split("?")[0].split(".").pop() || "").toLowerCase()] || "audio/mpeg" }
    : { "@type": "VideoObject", thumbnailUrl: [`https://i.ytimg.com/vi/${safeYt(l.id)}/hqdefault.jpg`], embedUrl: `https://www.youtube.com/embed/${safeYt(l.id)}` };
  return mkPage({
    nav: s.sec, path: href.lesson(l.id), html, wire: { t: "lesson", id: l.id, next: next ? href.lesson(next.id) : "" }, ogType: "article",
    image: l.kind === "video" ? `https://i.ytimg.com/vi/${safeYt(l.id)}/hqdefault.jpg` : OG_DEFAULT,
    title: withSite(title), description: desc,
    jsonld: [c.ld, { "@context": "https://schema.org", ...ld, name: title, description: desc, inLanguage: s.sec === "urdu" ? "ur" : "ar",
      ...(l.date ? (l.kind === "video" ? { uploadDate: l.date } : { dateCreated: l.date }) : {}), ...(l.duration ? { duration: isoDur(l.duration) } : {}),
      author: { "@type": "Person", name: "وصي الله بن محمد عباس" }, isPartOf: { "@type": "CreativeWorkSeries", name: s.title, url: SITE + href.series(s.id) } }],
  });
}

/* search: client-side only (noindex); this is the shell, the results are painted by app.js */
export function searchResults(st) {
  const r0 = state.DB.lessons.filter(l => (!st.sec || secOfLesson(l).id === st.sec) && match(l, st.q));
  const r = st.sort === "old" ? r0.slice().reverse() : r0;
  return { count: r.length, more: r.length > st.shown,
    html: r.length ? `<div class="list cols">${r.slice(0, st.shown).map((l, i) => row(l, { showSeries: true, i })).join("")}</div>` : `<p class="empty">لا توجد نتائج مطابقة. جرّب كلمات أقل أو اكتب اسم الكتاب فقط.</p>` };
}
function searchPage(params) {
  const st = { q: cleanQuery(params.get("q")), sec: oneOf(params.get("sec"), SECTIONS.map(s => s.id)), sort: oneOf(params.get("sort"), ["new", "old"], "new"), shown: PAGE };
  const vis = visible().filter(s => s.id !== "books"), c = crumbs([{ t: "بحث" }]);
  return mkPage({
    nav: "search", path: "/search/", noindex: true, wire: { t: "search" },
    html: `${c.html}<h1 class="page-h">البحث في المكتبة</h1>
      <div class="bar">${searchBox("ابحث في كل الدروس والمحاضرات…", st.q)}
        <select id="sort" aria-label="الترتيب"><option value="new">الأحدث أولًا</option><option value="old"${st.sort === "old" ? " selected" : ""}>الأقدم أولًا</option></select></div>
      <div class="pill-row" id="secs" role="group" aria-label="تصفية حسب القسم"><button type="button" class="pill${st.sec ? "" : " on"}" aria-pressed="${!st.sec}" data-s="">الكل</button>${vis.map(s => `<button type="button" class="pill${st.sec === s.id ? " on" : ""}" aria-pressed="${st.sec === s.id}" data-s="${s.id}">${s.title}</button>`).join("")}</div>
      <p class="count" id="count" role="status"></p><div id="out"><noscript><p class="empty">البحث يحتاج إلى تفعيل جافاسكربت في المتصفح.</p></noscript></div>`,
    title: withSite("البحث في المكتبة"), description: `ابحث في دروس ومحاضرات وخطب ${NAME_FULL}.`,
  });
}

function booksPage() {
  const DB = state.DB; if (!DB.books.length) return null;
  const groups = [];
  DB.books.forEach(k => { const g = k.group || "الكتب"; let e = groups.find(x => x.g === g); if (!e) groups.push(e = { g, items: [] }); e.items.push(k); });
  const files = k => k.files || (k.url ? [{ label: "تحميل", url: k.url }] : []);
  const card = (k, i) => {
    const f = files(k), multi = f.length > 1, main = k.title.split(/\s[–—-]\s/)[0].replace(/\s*\(.*$/, "");
    return `<article class="book" style="--i:${Math.min(i, 12)}"${safeLang(k.lang) ? ` lang="${safeLang(k.lang)}"` : ""}>
      <div class="cover">${k.cover ? `<img loading="lazy" src="${esc(safeUrl(k.cover))}" alt="">` : `<span class="cover-t" aria-hidden="true">${esc(main)}</span>`}</div>
      <div class="book-b"><h3>${esc(k.title)}</h3>${k.desc ? `<p>${esc(k.desc)}</p>` : ""}${k.note ? `<p class="note">${esc(k.note)}</p>` : ""}
        <div class="btns">${f.map((x, n) => `<a class="btn${n === 0 && !multi ? " pri" : " sm"}" href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener" aria-label="${esc((multi ? x.label : "تحميل") + " — " + k.title)}">${n === 0 || !multi ? ic("download", 16) + " " : ""}${esc(multi ? x.label : (x.label || "تحميل"))}</a>`).join("")}</div></div></article>`;
  };
  const c = crumbs([{ t: "الكتب" }]);
  return mkPage({
    nav: "books", path: "/books/",
    html: `${c.html}<div class="title-page"><span class="tile-ic big">${ic("book-open", 34)}</span><div><h1 class="page-h">الكتب</h1><p class="lede">${secById.books.desc} — ${fmtNum(DB.books.length)} كتابًا</p></div></div>
      ${groups.map(g => `<section><div class="sec"><h2>${esc(g.g)}</h2></div><div class="books">${g.items.map(card).join("")}</div></section>`).join("")}`,
    title: withSite(`الكتب — ${fmtNum(DB.books.length)} كتابًا للقراءة والتحميل`), description: `مؤلفات ${NAME_FULL} وتحقيقاته وبحوثه للقراءة والتحميل (PDF).`, jsonld: [c.ld],
  });
}

function aboutPage() {
  const b = state.bio; if (!b) return null;
  const c = crumbs([{ t: "عن الشيخ" }]);
  const photo = b.photo && /^(\/[\w./-]+|https:\/\/.+)$/.test(b.photo) ? b.photo : "";
  const html = `${c.html}<div class="about">
    <header class="about-h">${photo ? `<img class="about-photo" src="${esc(photo)}" alt="${esc(NAME)}" width="220" height="220">` : ""}<div><h1 class="page-h">${esc(b.title || NAME)}<span class="dua"> حفظه الله</span></h1>${b.summary ? `<p class="lede">${esc(b.summary)}</p>` : ""}</div></header>
    ${(b.sections || []).map(sec => `<section class="about-sec"><h2>${esc(sec.title || "")}</h2>${(sec.paragraphs || []).map(p => `<p>${esc(p)}</p>`).join("")}${sec.items && sec.items.length ? `<ul>${sec.items.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</section>`).join("")}
    ${b.sources && b.sources.length ? `<section class="about-sec"><h2>المصادر</h2><ul>${b.sources.map(x => `<li>${x.url ? `<a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener">${esc(x.label || x.url)}</a>` : esc(x.label || "")}</li>`).join("")}</ul></section>` : ""}</div>`;
  return mkPage({
    nav: "about", path: "/about/", html, ogType: "profile",
    title: withSite("عن الشيخ"), description: clip(b.summary || `نبذة عن ${NAME_FULL}.`, 160),
    jsonld: [c.ld, { "@context": "https://schema.org", "@type": "Person", name: "وصي الله بن محمد عباس", alternateName: ["وصي الله عباس", "الشيخ وصي الله عباس"], honorificPrefix: "الشيخ", url: SITE + "/about/", ...(photo ? { image: photo.startsWith("/") ? SITE + photo : photo } : {}), sameAs: [YT_CHANNEL, WP_SITE] }],
  });
}

export function notFoundPage() {
  return mkPage({ status: 404, noindex: true, nav: "", path: "/404.html", title: withSite("الصفحة غير موجودة"), description: "الصفحة المطلوبة غير موجودة.",
    html: `<div class="empty"><h1>الصفحة غير موجودة</h1><p><a class="btn pri" href="/">العودة للرئيسية</a> <a class="btn" href="/search/">البحث في المكتبة</a></p></div>` });
}

/* path -> page. Unknown or malformed paths give the 404 page. */
export function resolve(pathname, params = new URLSearchParams()) {
  const raw = String(pathname).split("/").filter(Boolean);
  const segs = raw.map(x => safeDecode(x).slice(0, 80));
  if (segs.some((x, i) => x === "" && raw[i] !== "")) return notFoundPage();      // malformed %-encoding
  const [a, b] = segs;
  let p = null;
  if (!a || a === "index.html") p = home();
  else if (segs.length === 1 && a === "library") p = library();
  else if (segs.length === 1 && a === "books") p = booksPage();
  else if (segs.length === 1 && a === "about") p = aboutPage();
  else if (segs.length === 1 && a === "search") p = searchPage(params);
  else if (segs.length === 2 && a === "section") p = sectionPage(b);
  else if (segs.length === 2 && a === "series") p = seriesPage(b);
  else if (segs.length === 2 && a === "lesson") p = lessonPage(b);
  return p || notFoundPage();
}

/* ───────── Chrome: header, drawer, bottom bar, footer, <head> ───────── */
const navItems = () => {
  const items = [...visible().map(s => ({ id: s.id, t: s.title, i: s.icon, h: href.section(s), n: s.id === "books" ? 0 : sectionCount(s.id) }))];
  if (state.bio) items.push({ id: "about", t: "عن الشيخ", i: "book-marked", h: href.about() });
  return items;
};
const cur = (nav, id) => nav === id ? ' class="on" aria-current="page"' : "";
export function chromeTop(nav) {
  const items = navItems();
  const drawerItems = [{ id: "home", t: "الرئيسية", i: "house", h: "/" }, { id: "library", t: "كل الأقسام", i: "layout-grid", h: href.library() }, { id: "search", t: "بحث", i: "search", h: href.search() }, ...items];
  return `<header class="top"><div class="wrap top-in">
    <a class="brand" href="/" aria-label="${esc(NAME_FULL)} — الرئيسية"><span class="seal" aria-hidden="true"></span><span><strong>${NAME} <span class="hd">حفظه الله</span></strong><small>دروس الشيخ وصي الله عباس</small></span></a>
    <nav class="nav" id="nav" aria-label="الأقسام"><a href="/" data-nav="home"${cur(nav, "home")}>الرئيسية</a>${items.map(x => `<a href="${x.h}" data-nav="${x.id}"${cur(nav, x.id)}>${x.t}</a>`).join("")}</nav>
    <a class="icon-btn" id="hsearch" href="${href.search()}" aria-label="بحث">${ic("search", 20)}</a>
    <button type="button" class="icon-btn" id="theme" aria-label="تبديل الوضع الليلي">${ic("moon", 20)}</button>
    <button type="button" class="icon-btn burger" id="burger" aria-label="القائمة" aria-expanded="false" aria-controls="drawer">${ic("menu", 22)}</button>
  </div></header>
  <div class="scrim" id="scrim" hidden></div>
  <aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-label="القائمة الرئيسية" aria-hidden="true">
    <div class="drawer-h"><span>القائمة</span><button type="button" class="icon-btn" id="drawer-x" aria-label="إغلاق">${ic("x", 22)}</button></div>
    <nav class="drawer-nav" id="drawer-nav" aria-label="القائمة">${drawerItems.map(x => `<a href="${x.h}" data-nav="${x.id}"${cur(nav, x.id)}>${ic(x.i, 22)}<span>${x.t}</span>${x.n ? `<small>${fmtNum(x.n)}</small>` : ""}</a>`).join("")}</nav>
    <div class="drawer-f"><a href="${YT_CHANNEL}" target="_blank" rel="noopener">${ic("external-link", 17)} قناة يوتيوب</a><a href="${WP_SITE}" target="_blank" rel="noopener">${ic("external-link", 17)} موقع الشيخ</a></div>
  </aside>`;
}
export function chromeBottom(nav) {
  const vis = navItems(), extra = ["audio", "lectures", "khutab", "urdu", "books"].map(id => vis.find(s => s.id === id)).filter(Boolean)[0];
  const items = [{ id: "home", t: "الرئيسية", i: "house", h: "/" }, { id: "library", t: "الأقسام", i: "layout-grid", h: href.library() }, { id: "search", t: "بحث", i: "search", h: href.search(), mid: true }];
  if (extra) items.push({ id: extra.id, t: extra.t.replace("الدروس ", ""), i: extra.i, h: extra.h });
  return `<nav class="bottom" id="bottom" aria-label="التنقل السريع">${items.map(x => `<a class="bn${x.mid ? " mid" : ""}" href="${x.h}" data-nav="${x.id}"${nav === x.id ? ' aria-current="page"' : ""}><span class="bn-i">${ic(x.i, x.mid ? 25 : 22)}</span><span>${x.t}</span></a>`).join("")}
    <a class="bn" href="#" role="button" data-nav="more" id="bn-more"><span class="bn-i">${ic("menu", 22)}</span><span>المزيد</span></a></nav>`;
}
export const footer = () => `<footer class="foot"><div class="wrap">
  <p>الدروس المرئية مستضافة على <a href="${YT_CHANNEL}" target="_blank" rel="noopener">قناة واحة السنة</a> على يوتيوب، والمواد الصوتية والكتب من <a href="${WP_SITE}" target="_blank" rel="noopener">موقع الشيخ</a>. وهذا الموقع فهرس لتسهيل الوصول إليها.</p>
  <p>آخر تحديث للفهرس: ${fmtDate(state.DB.updated)}</p></div></footer>`;

export function headHtml(p) {
  const url = SITE + p.path;
  return `<title>${esc(p.title)}</title>
<meta id="m-desc" name="description" content="${esc(p.description)}">
<link id="m-canon" rel="canonical" href="${esc(url)}">
<meta id="m-robots" name="robots" content="${p.noindex ? "noindex, follow" : "index, follow, max-image-preview:large"}">
<meta property="og:site_name" content="${esc(NAME_FULL)}"><meta property="og:locale" content="ar_AR"><meta id="og-type" property="og:type" content="${p.ogType}">
<meta id="og-title" property="og:title" content="${esc(p.title)}"><meta id="og-desc" property="og:description" content="${esc(p.description)}">
<meta id="og-url" property="og:url" content="${esc(url)}"><meta id="og-img" property="og:image" content="${esc(p.image)}">
<meta name="twitter:card" content="summary_large_image"><meta id="tw-title" name="twitter:title" content="${esc(p.title)}"><meta id="tw-desc" name="twitter:description" content="${esc(p.description)}"><meta id="tw-img" name="twitter:image" content="${esc(p.image)}">
<meta name="theme-color" content="#f1e5c8">
${p.jsonld.length ? `<script id="ld" type="application/ld+json">${jsonLd(p.jsonld)}</script>` : '<script id="ld" type="application/ld+json">[]</script>'}`;
}
