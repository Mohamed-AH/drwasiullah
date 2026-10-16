/* Pure page renderers: every page is a function returning { html, title, description, path, jsonld, ... }.
   Used by scripts/build.mjs (pre-rendering to real static HTML) and by js/app.js (client-side navigation). */
import {
  SITE, NAME, NAME_FULL, OFFICIAL_PRE, FULL_NAME, ROLE, OFFICIAL_NAME, YT_CHANNEL, WP_SITE, SECTIONS, SPINE, SPINE_PALETTE, SPINE_H, PAGE, MAXQ,
  state, WEEKDAYS, byId, seriesById, secById, ic, esc, fmtNum, fmtYear, ldate, dur, isoDur, hours, dg, cleanQuery, oneOf, safeUrl, safeYt, safeLang, safeDecode, jsonLd,
  kindIcon, useLabel, label, mainTitle, fullTitle, secOfSeries, secOfLesson, seriesOrder, lang, thumb, STAR, match, sectionCount, visible, isFlat, seriesIn, href, fmtDate,
  t, getLang, setLang, langPrefix, splitLang, LANGS, LANG_META, sectionName, bookTitle, groupName, phrase, markArabicDoc,
} from "./core.js";

const OG_DEFAULT = SITE + "/og/default.png";
const clip = (s, n) => { s = String(s).replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s\S*$/, "") + "…" : s; };

/* ───────── Components ───────── */
export const searchBox = (ph, v = "", id = "q", asForm = false) => {
  const inner = `<label class="sr-only" for="${id}">${esc(ph)}</label>${ic("search", 22)}<input id="${id}" name="q" type="search" placeholder="${esc(ph)}" value="${esc(v)}" autocomplete="off" enterkeyhint="search" maxlength="${MAXQ}" spellcheck="false">`;
  return asForm ? `<form class="search" role="search" action="${href.search()}" method="get">${inner}</form>` : `<div class="search" role="search">${inner}</div>`;
};

export function spine(s, i) {
  const w = Math.round(74 + Math.min(70, Math.log(s.count + 1) * 11.5));
  return `<a class="spine" href="${href.series(s.id)}" aria-label="${t("spine.aria", { title: esc(s.title), n: fmtNum(s.count) })}" title="${t("spine.title", { title: esc(s.title), n: fmtNum(s.count) })}" style="--fs:${s.title.length > 34 ? 16 : s.title.length > 24 ? 18 : 23}px;--w:${w}px;--h:${SPINE_H[i % SPINE_H.length]}px;--c:${SPINE[s.id] || SPINE_PALETTE[i % SPINE_PALETTE.length]};--i:${i}">
    ${STAR.replace("<svg", '<svg class="sp-star"')}<span class="sp-title" aria-hidden="true">${esc(s.title)}</span><span class="sp-count" aria-hidden="true">${fmtNum(s.count)}</span></a>`;
}
export const shelf = list => `<div class="shelf-wrap"><div class="shelf">${list.map((s, i) => spine(s, i)).join("")}</div><div class="board"></div>
  <p class="shelf-note">${t("spine.note")}</p></div>`;

export function lessonCard(l, i = 0) {
  const s = seriesById[l.series];
  const title = fullTitle(l);
  const media = l.kind === "audio"
    ? `<div class="thumb aud"><span class="aud-ic">${ic("headphones", 44)}</span><span class="aud-t">${esc(s.title)}</span>${l.duration ? `<span class="dur">${dur(l.duration)}</span>` : ""}</div>`
    : `<div class="thumb"><img loading="lazy" src="${thumb(l.id)}" alt="" width="320" height="180"><span class="play"><i>${ic("play", 24)}</i></span>${l.duration ? `<span class="dur">${dur(l.duration)}</span>` : ""}</div>`;
  const heading = useLabel(l) ? `${s.title} — ${label(l)}${l.section ? " · " + sectionName(l.section) : ""}` : title;
  return `<a class="card" href="${href.lesson(l.id)}" style="--i:${i}"${lang(l)}>${media}
    <div class="card-b"><h3>${esc(heading)}</h3>
    <div class="meta"><span class="tag">${ic(kindIcon(l), 13)}${esc(secOfSeries(s).title)}</span>${ldate(l) ? `<span>${ldate(l)}</span>` : ""}</div></div></a>`;
}
export function seriesCard(s, i = 0) {
  const span = s.first ? `<span class="tag plain">${fmtYear(s.first)} – ${fmtYear(s.last)}</span>` : "";
  return `<a class="card scard" href="${href.series(s.id)}" style="--i:${i}"><h3>${esc(s.title)}</h3>${s.description ? `<p>${esc(s.description)}</p>` : ""}
    <div class="meta"><span class="tag gold">${t("count.lessons", { n: fmtNum(s.count) })}</span>${hours(s.seconds) ? `<span class="tag plain">${hours(s.seconds)}</span>` : ""}${span}</div></a>`;
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
  const all = [{ t: t("crumb.home"), h: href.home() }, ...items];
  const html = `<nav class="crumb" aria-label="${t("crumb.aria")}">${all.map((x, i) => x.h && i < all.length - 1 ? `<a href="${x.h}">${esc(x.t)}</a>` : `<span${i === all.length - 1 ? ' aria-current="page"' : ""}>${esc(x.t)}</span>`).join(" / ")}</nav>`;
  const ld = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: all.map((x, i) => ({ "@type": "ListItem", position: i + 1, name: x.t, ...(x.h && i < all.length - 1 ? { item: SITE + x.h } : {}) })) };
  return { html, ld };
}
const mkPage = o => {
  const p = { status: 200, noindex: false, jsonld: [], image: OG_DEFAULT, ogType: "website", nav: "", wire: { t: "none" }, lang: getLang(), ...o };
  if (!LANGS.indexed.includes(p.lang)) p.noindex = true;      // a language that is not live yet (soft launch) is never indexed
  if (p.lang !== "ar") p.html = markArabicDoc(p.html);        // Arabic text left inside a page of another language gets lang="ar" dir="rtl"
  return p;
};
const withSite = title => t("title.withSite", { title });
const nameFull = () => t("brand.nameFull"), officialName = () => t("brand.official");

/* ───────── Weekly schedule (shared by /schedule/ and the home page) ───────── */
const liveBanner = sc => sc.live ? `<a class="live-cta" href="${esc(sc.live.url)}" target="_blank" rel="noopener"><span class="live-ic">${ic("radio", 26)}</span><span class="live-t"><strong>${esc(phrase(sc.live.label))}</strong><small>${esc(phrase(sc.live.sub))}</small></span><span class="live-go">${ic("external-link", 20)}</span></a><p class="live-today" id="live-today" aria-live="polite" hidden></p>` : "";
const scheduleDays = (sc, h = 3) => {
  const slot = x => `<li data-slot="${esc(x.id)}" data-t="${esc(phrase(x.title))}" data-w="${esc(phrase(x.time))}"><span class="st">${esc(phrase(x.time))}</span><span class="sw">${x.series ? `<a href="${href.series(x.series)}">${esc(phrase(x.title))}</a>` : esc(phrase(x.title))}${x.lang === "ur" ? ` <span class="tag plain">${t("sched.ur")}</span>` : ""}${x.note ? `<small>${esc(phrase(x.note))}</small>` : ""}</span></li>`;
  return `<ol class="sched-days" aria-label="${t("sched.days")}">${sc.days.map(d => `<li class="sched-day" data-day="${d.i}"><h${h}>${esc(t("weekday.names")[d.i])}</h${h}><ul class="sched-slots">${d.slots.map(slot).join("")}</ul></li>`).join("")}</ol>`;
};

/* ───────── Pages ───────── */
function home() {
  const DB = state.DB, vis = visible(), cfg = Object.fromEntries(state.home.blocks.map(b => [b.id, b]));
  const bio = state.bio;
  const hd = (id, dflt) => esc(cfg[id].title || dflt);                         // an optional custom heading from the portal (plain text)
  const top = (cfg.shelf.series.length ? cfg.shelf.series.map(i => seriesById[i]) : DB.series.slice().sort((a, b) => b.count - a.count)).slice(0, cfg.shelf.count);
  const latest = DB.lessons.filter(l => l.date).slice(0, cfg.latest.count);
  const hero = `
    <section class="hero"><p class="bism"${getLang() === "ar" ? "" : ' lang="ar"'}>${t("hero.bism")}</p>
      <h1><span class="h1-pre">${t("brand.officialPre")}</span><span class="nm"><em>${t("hero.nm1")}</em></span> <span class="nm">${t("hero.nm2")}</span> <span class="nm">${t("hero.nm3")}</span><span class="dua">${t("hero.duaLead")}${t("brand.dua")}</span></h1>
      <p class="role">${t("brand.role")}</p>
      <div class="orn" aria-hidden="true">${STAR}</div>
      <p class="hero-p">${t("hero.p")}</p>
      ${searchBox(t("hero.search"), "", "q", true)}
      <ul class="stats"><li><b>${fmtNum(DB.lessons.length)}</b>${t("stat.lessons")}</li><li><b>${fmtNum(DB.series.length)}</b>${t("stat.series")}</li>${DB.books.length ? `<li><b>${fmtNum(DB.books.length)}</b>${t("stat.books")}</li>` : ""}</ul></section>`;
  const block = {
    news: () => `<section class="news" id="live-news" aria-labelledby="nw-h" hidden><div class="sec"><h2 id="nw-h">${hd("news", t("home.news"))}</h2><a href="${href.news()}">${t("home.allNews")} ${ic("chevron-left", 15)}</a></div><div class="news-list"></div></section>`,
    schedule: () => state.schedule ? `<section class="sched sched-home" aria-labelledby="sc-h"><div class="sec"><h2 id="sc-h">${hd("schedule", t("home.schedule"))}</h2><a href="${href.schedule()}">${t("home.fullSchedule")} ${ic("chevron-left", 15)}</a></div>${liveBanner(state.schedule)}${scheduleDays(state.schedule)}<p class="sched-note">${t("home.schedNote")}</p></section>` : "",
    about: () => bio ? `<section class="about-teaser" aria-labelledby="ab-h"><h2 id="ab-h">${hd("about", t("home.about"))}</h2>${bio.summary ? `<p>${esc(bio.summary)}</p>` : ""}<a class="btn" href="${href.about()}">${t("home.readMore")} ${ic("chevron-left", 16)}</a></section>` : "",
    sections: () => `<div class="sec"><h2>${hd("sections", t("home.sections"))}</h2></div>
    <div class="tiles">${vis.map(s => tile(s, sectionCount(s.id))).join("")}</div>`,
    shelf: () => `<div class="sec"><h2>${hd("shelf", t("home.shelf"))}</h2><a href="${href.library()}">${t("home.allSections")} ${ic("chevron-left", 15)}</a></div>
    ${shelf(top)}`,
    latest: () => `<div class="sec"><h2>${hd("latest", t("home.latest"))}</h2><a href="${href.search()}">${t("home.all")} ${ic("chevron-left", 15)}</a></div>
    <div class="grid">${latest.map(lessonCard).join("")}</div>`,
  };
  const html = hero + "\n    " + state.home.blocks.filter(b => b.on).map(b => block[b.id]()).filter(Boolean).join("\n    ");
  return mkPage({
    nav: "home", path: href.home(), html, wire: { t: "home" },
    title: t("home.title"),
    description: t("home.desc"),
    jsonld: [
      { "@context": "https://schema.org", "@type": "WebSite", name: officialName(), alternateName: [...t("ld.siteAlt"), nameFull()], url: SITE + href.home(), inLanguage: getLang(),
        potentialAction: { "@type": "SearchAction", target: `${SITE}${href.search()}?q={search_term_string}`, "query-input": "required name=search_term_string" } },
      { "@context": "https://schema.org", "@type": "Person", name: t("brand.fullName"), alternateName: t("ld.personAlt"), honorificPrefix: t("ld.honorific"), jobTitle: t("brand.role"), url: SITE + href.home(), sameAs: [YT_CHANNEL, WP_SITE] },
    ],
  });
}

function library() {
  const c = crumbs([{ t: t("library.crumb") }]);
  return mkPage({
    nav: "library", path: href.library(), wire: { t: "none" },
    html: `${c.html}<h1 class="page-h">${t("library.h1")}</h1><p class="lede">${t("library.lede")}</p><div class="tiles">${visible().map(s => tile(s, sectionCount(s.id))).join("")}</div>`,
    title: withSite(t("library.title")), description: t("library.desc"), jsonld: [c.ld],
  });
}

function sectionPage(id) {
  const sec = secById[id], ser = sec ? seriesIn(id) : [];
  if (!sec || id === "books" || ser.length < 2) return null;     // flat sections link straight to their only series
  const items = state.DB.lessons.filter(l => secOfLesson(l).id === id), latest = items.filter(l => l.date).slice(0, 8);
  const c = crumbs([{ t: sec.title }]);
  return mkPage({
    nav: id, path: href.section(sec),
    html: `${c.html}
      <div class="title-page"><span class="tile-ic big">${ic(sec.icon, 34)}</span><div><h1 class="page-h">${sec.title}</h1><p class="lede">${t("section.lede", { desc: sec.desc, series: fmtNum(ser.length), items: fmtNum(items.length) })}</p></div></div>
      ${shelf(ser.slice().sort((a, b) => b.count - a.count))}
      <div class="sec"><h2>${t("section.details")}</h2></div><div class="grid">${ser.map(seriesCard).join("")}</div>
      ${latest.length ? `<div class="sec"><h2>${t("home.latest")}</h2><a href="${href.search(`?sec=${id}`)}">${t("home.all")} ${ic("chevron-left", 15)}</a></div><div class="grid">${latest.map(lessonCard).join("")}</div>` : ""}`,
    title: withSite(t("section.metaTitle", { title: sec.title, n: ser.length })), description: clip(t("section.metaDesc", { desc: sec.desc, series: fmtNum(ser.length), items: fmtNum(items.length) }), 160),
    jsonld: [c.ld],
  });
}

/* series info (memoised) + list renderer shared by the static page and the client-side filters */
const _info = new Map();
export function seriesInfo(id) {
  if (_info.has(id)) return _info.get(id);
  const s = seriesById[id]; if (!s) return null;
  const all = state.DB.lessons.filter(l => l.series === id);
  const ordered = !!s.ordered || !!s.manual || all.some(l => l.n != null);
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
    if (st.sort === "num" && !st.sec && info.sections.length > 1 && l.section !== last) { last = l.section; html += `<h2 class="sect">${esc(l.section ? sectionName(l.section) : t("list.other"))}</h2>`; }
    html += row(l, { noSection: true, i: k++ });
  }
  return { count: r.length, html: r.length ? `<div class="list cols">${html}</div>` : `<p class="empty">${t("list.empty")}</p>` };
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
    <div class="title-page">${head}<div><h1 class="page-h">${esc(s.title)}</h1><p class="lede">${esc(s.description || sec.desc)} — ${t("count.lessons", { n: fmtNum(s.count) })}${hours(s.seconds) ? " · " + hours(s.seconds) : ""}</p>${s.extra ? `<a class="btn" href="${esc(safeUrl(s.extra.url))}" target="_blank" rel="noopener">${ic("external-link", 17)} ${esc(s.extra.label)}</a>` : ""}</div></div>
    <div class="bar">${searchBox(t("series.search"))}
      <select id="sort" aria-label="${t("sort.label")}"><option value="new"${st.sort === "new" ? " selected" : ""}>${t("sort.new")}</option><option value="old">${t("sort.old")}</option>${ordered ? `<option value="num"${st.sort === "num" ? " selected" : ""}>${t("sort.num")}</option>` : ""}</select></div>
    ${sections.length > 1 ? `<div class="pill-row" id="secs" role="group" aria-label="${t("filter.book")}"><button type="button" class="pill on" aria-pressed="true" data-s="">${t("filter.all")}</button>${sections.map(x => `<button type="button" class="pill" aria-pressed="false" data-s="${esc(x)}">${esc(sectionName(x))}</button>`).join("")}</div>` : ""}
    <p class="count" id="count" role="status">${t("count.lessons", { n: fmtNum(list.count) })}</p><div id="out"${s.sec === "urdu" ? ' lang="ur"' : ""}>${list.html}</div>`;
  return mkPage({
    nav: s.sec, path: href.series(s.id), html, wire: { t: "series", id: s.id }, ogType: "website",
    title: withSite(t("series.metaTitle", { title: s.title, n: fmtNum(s.count) })),
    description: clip(t("series.metaDesc", { desc: s.description, n: fmtNum(s.count), hours: hours(s.seconds), sec: sec.title }), 160),
    jsonld: [c.ld, { "@context": "https://schema.org", "@type": "CollectionPage", name: s.title, url: SITE + href.series(s.id), inLanguage: s.sec === "urdu" ? "ur" : getLang(),
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
         <audio id="aud" data-lid="${esc(l.id)}" controls preload="metadata" src="${esc(safeUrl(l.src))}"${l.src_alt ? ` data-alt="${esc(safeUrl(l.src_alt))}"` : ""} aria-label="${esc(title)}"></audio>
         <div class="speeds" role="group" aria-label="${t("lesson.speeds")}">${[1, 1.25, 1.5, 2].map(v => `<button type="button" data-v="${v}" class="${v === 1 ? "on" : ""}" aria-pressed="${v === 1}">${fmtNum(v).replace("٫", ".")  /* i18n-allow */}×</button>`).join("")}</div></div></div>`
    : `<div class="frame"><div class="player lite" data-yt="${safeYt(l.id)}"><img src="https://i.ytimg.com/vi/${safeYt(l.id)}/hqdefault.jpg" alt="" width="480" height="360"><button type="button" class="lite-play" aria-label="${t("lesson.playVideo", { title: esc(title) })}"><i>${ic("play", 30)}</i></button></div></div>`;
  const ext = l.kind === "audio"
    ? `<a class="btn" href="${esc(safeUrl(l.src))}" download target="_blank" rel="noopener" data-lid="${esc(l.id)}" data-dl="${esc(title.includes(s.title) ? title : s.title + " — " + title)}">${ic("download", 17)} ${t("lesson.download")}</a>`
    : `<a class="btn" href="https://www.youtube.com/watch?v=${safeYt(l.id)}" target="_blank" rel="noopener">${ic("external-link", 17)} ${t("lesson.openYt")}</a>`;
  const c = crumbs(flat ? [{ t: sec.title, h: href.series(s.id) }, { t: title }] : [{ t: sec.title, h: href.section(sec) }, { t: s.title, h: href.series(s.id) }, { t: title }]);
  const html = `${c.html}
    <div class="watch"><div>${player}
      <h1 class="w-title"${lang(l)}>${esc(title)}</h1>
      <div class="w-meta">${l.section ? `<span class="tag gold">${esc(sectionName(l.section))}</span>` : ""}<span class="tag">${ic(kindIcon(l), 13)}${sec.title}</span>${ldate(l) ? `<span class="tag plain">${ldate(l)}</span>` : ""}${l.duration ? `<span class="tag plain">${ic("clock", 13)}${dur(l.duration)}</span>` : ""}</div>
      ${useLabel(l) ? `<p class="orig">${esc(l.title)}</p>` : ""}
      <div class="btns">
        ${next ? `<a class="btn pri" id="next" rel="next" href="${href.lesson(next.id)}">${t("lesson.next")} ${ic("chevron-left", 17)}</a>` : `<span class="btn pri" aria-disabled="true">${t("lesson.next")} ${ic("chevron-left", 17)}</span>`}
        ${prev ? `<a class="btn" rel="prev" href="${href.lesson(prev.id)}">${ic("chevron-left", 17, "flip")} ${t("lesson.prev")}</a>` : `<span class="btn" aria-disabled="true">${ic("chevron-left", 17, "flip")} ${t("lesson.prev")}</span>`}
        ${ext}<button type="button" class="btn" id="share">${ic("link", 17)} ${t("lesson.copy")}</button></div>
    </div>
    <aside class="side" aria-labelledby="side-h"><h2 id="side-h">${esc(s.title)} <small>${fmtNum(i + 1)} / ${fmtNum(sib.length)}</small></h2>
      <div class="scroll"${s.sec === "urdu" ? ' lang="ur"' : ""}>${win.map(x => row(x, { now: x.id === l.id })).join("")}</div>
      <a class="side-all" href="${href.series(s.id)}">${t("lesson.all", { n: fmtNum(sib.length) })} ${ic("chevron-left", 15)}</a></aside></div>`;
  const desc = clip(t("lesson.desc", { kind: t(l.kind === "audio" ? "lesson.audio" : "lesson.video"), title, date: ldate(l) }), 160);
  const ld = l.kind === "audio"
    ? { "@type": "AudioObject", contentUrl: safeUrl(l.src), encodingFormat: MIME[(l.src.split("?")[0].split(".").pop() || "").toLowerCase()] || "audio/mpeg" }
    : { "@type": "VideoObject", thumbnailUrl: [`https://i.ytimg.com/vi/${safeYt(l.id)}/hqdefault.jpg`], embedUrl: `https://www.youtube.com/embed/${safeYt(l.id)}` };
  return mkPage({
    nav: s.sec, path: href.lesson(l.id), html, wire: { t: "lesson", id: l.id, next: next ? href.lesson(next.id) : "" }, ogType: "article",
    image: l.kind === "video" ? `https://i.ytimg.com/vi/${safeYt(l.id)}/hqdefault.jpg` : OG_DEFAULT,
    title: withSite(title), description: desc,
    jsonld: [c.ld, { "@context": "https://schema.org", ...ld, name: title, description: desc, inLanguage: s.sec === "urdu" ? "ur" : getLang(),
      ...(l.date ? (l.kind === "video" ? { uploadDate: l.date } : { dateCreated: l.date }) : {}), ...(l.duration ? { duration: isoDur(l.duration) } : {}),
      author: { "@type": "Person", name: t("ld.author") }, isPartOf: { "@type": "CreativeWorkSeries", name: s.title, url: SITE + href.series(s.id) } }],
  });
}

/* search: client-side only (noindex); this is the shell, the results are painted by app.js */
export function searchResults(st) {
  const r0 = state.DB.lessons.filter(l => (!st.sec || secOfLesson(l).id === st.sec) && match(l, st.q));
  const r = st.sort === "old" ? r0.slice().reverse() : r0;
  return { count: r.length, more: r.length > st.shown,
    html: r.length ? `<div class="list cols">${r.slice(0, st.shown).map((l, i) => row(l, { showSeries: true, i })).join("")}</div>` : `<p class="empty">${t("search.empty")}</p>` };
}
function searchPage(params) {
  const st = { q: cleanQuery(params.get("q")), sec: oneOf(params.get("sec"), SECTIONS.map(s => s.id)), sort: oneOf(params.get("sort"), ["new", "old"], "new"), shown: PAGE };
  const vis = visible().filter(s => s.id !== "books"), c = crumbs([{ t: t("search.crumb") }]);
  return mkPage({
    nav: "search", path: href.search(), noindex: true, wire: { t: "search" },
    html: `${c.html}<h1 class="page-h">${t("search.h1")}</h1>
      <div class="bar">${searchBox(t("search.ph"), st.q)}
        <select id="sort" aria-label="${t("sort.label")}"><option value="new">${t("sort.new")}</option><option value="old"${st.sort === "old" ? " selected" : ""}>${t("sort.old")}</option></select></div>
      <div class="pill-row" id="secs" role="group" aria-label="${t("filter.section")}"><button type="button" class="pill${st.sec ? "" : " on"}" aria-pressed="${!st.sec}" data-s="">${t("filter.all")}</button>${vis.map(s => `<button type="button" class="pill${st.sec === s.id ? " on" : ""}" aria-pressed="${st.sec === s.id}" data-s="${s.id}">${s.title}</button>`).join("")}</div>
      <p class="count" id="count" role="status"></p><div id="out"><noscript><p class="empty">${t("search.noscript")}</p></noscript></div>`,
    title: withSite(t("search.metaTitle")), description: t("search.metaDesc"),
  });
}

function booksPage() {
  const DB = state.DB; if (!DB.books.length) return null;
  const groups = [];
  DB.books.forEach(k => { const g = k.group ? groupName(k.group) : t("books.group"); let e = groups.find(x => x.g === g); if (!e) groups.push(e = { g, items: [] }); e.items.push(k); });
  const files = k => (k.files || (k.url ? [{ label: t("books.download"), url: k.url }] : [])).map(x => ({ ...x, label: phrase(x.label) }));
  const card = (k, i) => {
    const f = files(k), multi = f.length > 1, bt = bookTitle(k), main = bt.split(/\s[–—-]\s/)[0].replace(/\s*\(.*$/, "");
    return `<article class="book" style="--i:${Math.min(i, 12)}"${safeLang(k.lang) ? ` lang="${safeLang(k.lang)}"` : ""}>
      <div class="cover">${k.cover ? `<img loading="lazy" src="${esc(safeUrl(k.cover))}" alt="">` : `<span class="cover-t" aria-hidden="true">${esc(main)}</span>`}</div>
      <div class="book-b"><h3>${esc(bt)}</h3>${k.desc ? `<p>${esc(phrase(k.desc))}</p>` : ""}${k.note ? `<p class="note">${esc(phrase(k.note))}</p>` : ""}
        <div class="btns">${f.map((x, n) => `<a class="btn${n === 0 && !multi ? " pri" : " sm"}" href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener" aria-label="${esc((multi ? x.label : t("books.download")) + " — " + bt)}">${n === 0 || !multi ? ic("download", 16) + " " : ""}${esc(multi ? x.label : (x.label || t("books.download")))}</a>`).join("")}</div></div></article>`;
  };
  const c = crumbs([{ t: t("books.title") }]);
  return mkPage({
    nav: "books", path: href.books(),
    html: `${c.html}<div class="title-page"><span class="tile-ic big">${ic("book-open", 34)}</span><div><h1 class="page-h">${t("books.title")}</h1><p class="lede">${secById.books.desc} — ${t("count.books", { n: fmtNum(DB.books.length) })}</p></div></div>
      ${groups.map(g => `<section><div class="sec"><h2>${esc(g.g)}</h2></div><div class="books">${g.items.map(card).join("")}</div></section>`).join("")}`,
    title: withSite(t("books.metaTitle", { n: fmtNum(DB.books.length) })), description: t("books.metaDesc"), jsonld: [c.ld],
  });
}

/* Bio text blocks: a string is a paragraph, an array a bullet list, {ol:[…]} a numbered list, {links:[{label,url}]} a list of links.
   Older bio.json files with `paragraphs` + `items` still work. Links: https URLs, or a path on this site (e.g. a PDF under /files/). */
const aboutLink = x => {
  const own = typeof x.url === "string" && /^\/[\w./-]+$/.test(x.url);
  const href = esc(own ? x.url : safeUrl(x.url)), ext = own ? "" : ' target="_blank" rel="noopener"';
  if (!x.kind) return `<a href="${href}"${ext}>${esc(x.label || x.url)}</a>`;
  return `<a class="linkcard" href="${href}"${ext}><span class="lc-ic" aria-hidden="true">${ic(x.kind === "pdf" ? "file-text" : "external-link", 22)}</span><span class="lc-tx"><span class="lc-t">${esc(x.label || x.url)}</span>${x.note ? `<span class="lc-n">${esc(x.note)}</span>` : ""}</span><span class="lc-go" aria-hidden="true">${ic("chevron-left", 18)}</span></a>`;
};
const aboutBlocks = sec => {
  const blocks = Array.isArray(sec.blocks) ? sec.blocks : [...(sec.paragraphs || []), ...(sec.items && sec.items.length ? [sec.items] : [])];
  return blocks.map(b => Array.isArray(b) ? `<ul>${b.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`
    : b && Array.isArray(b.ol) ? `<ol>${b.ol.map(x => `<li>${esc(x)}</li>`).join("")}</ol>`
    : b && Array.isArray(b.links) ? `<ul class="links">${b.links.map(x => `<li>${aboutLink(x)}</li>`).join("")}</ul>`
    : `<p>${esc(b)}</p>`).join("");
};

function aboutPage() {
  const b = state.bio; if (!b) return null;
  const c = crumbs([{ t: t("home.about") }]);
  const photo = b.photo && /^(\/[\w./-]+|https:\/\/.+)$/.test(b.photo) ? b.photo : "";
  const html = `${c.html}<div class="about">
    ${getLang() !== "ar" && state.bioLang !== getLang() ? `<p class="lang-note">${t("lang.note.ar")}</p>` : ""}<header class="about-h">${photo ? `<img class="about-photo" src="${esc(photo)}" alt="${esc(t("brand.name"))}" width="220" height="220">` : ""}<div><h1 class="page-h">${esc(b.title || t("brand.name"))}<span class="dua">${t("hero.duaLead")}${t("brand.dua")}</span></h1>${b.lede || b.summary ? `<p class="lede">${esc(b.lede || b.summary)}</p>` : ""}</div></header>
    ${(b.sections || []).map(sec => `<section class="about-sec${sec.extra ? " about-extra" : ""}"><h2>${esc(sec.title || "")}</h2>${sec.intro ? `<p class="about-intro">${esc(sec.intro)}</p>` : ""}${aboutBlocks(sec)}</section>`).join("")}
    ${b.sources && b.sources.length ? `<section class="about-sec"><h2>${t("about.sources")}</h2><ul>${b.sources.map(x => `<li>${x.url ? `${aboutLink(x)}` : esc(x.label || "")}</li>`).join("")}</ul></section>` : ""}</div>`;
  return mkPage({
    nav: "about", path: href.about(), html, ogType: "profile",
    title: withSite(t("home.about")), description: clip(b.summary || t("about.metaDesc"), 160),
    jsonld: [c.ld, { "@context": "https://schema.org", "@type": "Person", name: t("brand.fullName"), alternateName: t("ld.personAlt"), honorificPrefix: t("ld.honorific"), jobTitle: t("brand.role"), url: SITE + href.about(), ...(photo ? { image: photo.startsWith("/") ? SITE + photo : photo } : {}), sameAs: [YT_CHANNEL, WP_SITE] }],
  });
}

export function notFoundPage() {
  return mkPage({ status: 404, noindex: true, nav: "", path: "/404.html", title: withSite(t("notfound.title")), description: t("notfound.desc"),
    html: `<div class="empty"><h1>${t("notfound.title")}</h1><p><a class="btn pri" href="${href.home()}">${t("notfound.home")}</a> <a class="btn" href="${href.search()}">${t("search.metaTitle")}</a></p></div>` });
}

/* ───────── Announcements (filled in the browser from /api/live: they change without a rebuild) ───────── */
function newsPage() {
  const c = crumbs([{ t: t("news.title") }]);
  const html = `${c.html}<div class="sched"><header><h1 class="page-h">${t("news.title")}</h1><p class="lede">${t("news.lede")}</p></header>
    <div id="live-news-all" class="news-list" aria-live="polite"><p class="muted">${t("news.loading")}</p></div><noscript><p class="muted">${t("news.noscript")}</p></noscript></div>`;
  return mkPage({ nav: "", path: href.news(), html, wire: { t: "news" }, noindex: true, title: withSite(t("news.title")), description: t("news.metaDesc"), jsonld: [c.ld] });
}

/* ───────── Weekly schedule ───────── */
function schedulePage() {
  const sc = state.schedule; if (!sc) return null;
  const c = crumbs([{ t: t("sched.crumb") }]);
  const html = `${c.html}<div class="sched">
    <header><h1 class="page-h">${t("home.schedule")}</h1><p class="lede">${esc(t("sched.lede"))}</p></header>
    ${liveBanner(sc)}
    ${scheduleDays(sc, 2)}
    <p class="sched-note">${esc(sc.note && getLang() === "ar" ? sc.note : t("sched.note"))}</p></div>`;
  const titles = [...new Set(sc.days.flatMap(d => d.slots.map(x => phrase(x.title))))];
  return mkPage({
    nav: "schedule", path: href.schedule(), html, wire: { t: "schedule" },
    title: withSite(t("home.schedule")), description: clip(t("sched.metaDesc", { titles }), 160),
    jsonld: [c.ld],
  });
}

/* path -> page. Unknown or malformed paths give the 404 page. */
export function resolve(pathname, params = new URLSearchParams()) {
  const sp = splitLang(pathname);                             // "/en/series/x/" -> English page for "/series/x/"; the language is set for everything rendered below
  setLang(sp.lang); pathname = sp.path;
  const raw = String(pathname).split("/").filter(Boolean);
  const segs = raw.map(x => safeDecode(x).slice(0, 80));
  if (segs.some((x, i) => x === "" && raw[i] !== "")) return notFoundPage();      // malformed %-encoding
  const [a, b] = segs;
  let p = null;
  if (!a || a === "index.html") p = home();
  else if (segs.length === 1 && a === "library") p = library();
  else if (segs.length === 1 && a === "books") p = booksPage();
  else if (segs.length === 1 && a === "about") p = aboutPage();
  else if (segs.length === 1 && a === "schedule") p = schedulePage();
  else if (segs.length === 1 && a === "news") p = newsPage();
  else if (segs.length === 1 && a === "search") p = searchPage(params);
  else if (segs.length === 2 && a === "section") p = sectionPage(b);
  else if (segs.length === 2 && a === "series") p = seriesPage(b);
  else if (segs.length === 2 && a === "lesson") p = lessonPage(b);
  return p || notFoundPage();
}

/* ───────── Chrome: header, drawer, bottom bar, footer, <head> ───────── */
const navItems = () => {
  const items = [...visible().map(s => ({ id: s.id, t: s.title, i: s.icon, h: href.section(s), n: s.id === "books" ? 0 : sectionCount(s.id) }))];
  if (state.schedule) items.push({ id: "schedule", t: t("sched.crumb"), i: "calendar-days", h: href.schedule() });
  if (state.bio) items.push({ id: "about", t: t("home.about"), i: "book-marked", h: href.about() });
  return items;
};
/* language switcher: shown only once more than one language is indexed (soft launch = hidden); links go to the same page in the other languages */
export const switcherOn = () => LANGS.indexed.length > 1;
export function langLinks(path, lang = getLang()) {
  const base = lang === "ar" ? path : path.slice(langPrefix(lang).length) || "/";
  return LANGS.indexed.map(l => ({ lang: l, name: LANG_META[l].name, href: langPrefix(l) + base, on: l === lang }));
}
const switcher = (path, cls) => switcherOn() ? `<div class="langs ${cls}" role="group" aria-label="${t("lang.switch")}">${langLinks(path).map(x => `<a href="${x.href}" lang="${x.lang}" hreflang="${x.lang}" data-lang="${x.lang}"${x.on ? ' aria-current="true"' : ""}>${x.name}</a>`).join("")}</div>` : "";
const cur = (nav, id) => nav === id ? ' class="on" aria-current="page"' : "";
export function chromeTop(nav, path = "/") {
  const items = navItems();
  const drawerItems = [{ id: "home", t: t("nav.home"), i: "house", h: href.home() }, { id: "library", t: t("nav.libraryDrawer"), i: "layout-grid", h: href.library() }, { id: "search", t: t("nav.search"), i: "search", h: href.search() }, ...items];
  return `<div id="live-banner" aria-live="polite"${state.homeCustom ? " data-home" : ""}></div><header class="top">${switcher(path, "in-top")}<div class="wrap top-in">
    <a class="brand" href="${href.home()}" aria-label="${t("brand.aria", { name: esc(nameFull()) })}"><span class="seal" aria-hidden="true"></span><span><strong>${t("brand.name")} <span class="hd">${t("brand.dua")}</span></strong><small>${t("brand.small")}</small></span></a>
    <nav class="nav" id="nav" aria-label="${t("nav.sections")}"><a href="${href.home()}" data-nav="home"${cur(nav, "home")}>${t("nav.home")}</a>${items.map(x => `<a href="${x.h}" data-nav="${x.id}"${cur(nav, x.id)}>${t("nav.topLabel", x.t)}</a>`).join("")}</nav>
    <a class="icon-btn" id="hsearch" href="${href.search()}" aria-label="${t("nav.search")}">${ic("search", 20)}</a>
    <button type="button" class="icon-btn" id="theme" aria-label="${t("nav.theme")}">${ic("moon", 20)}</button>
    <button type="button" class="icon-btn burger" id="burger" aria-label="${t("nav.menu")}" aria-expanded="false" aria-controls="drawer">${ic("menu", 22)}</button>
  </div></header>
  <div class="scrim" id="scrim" hidden></div>
  <aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-label="${t("nav.menuMain")}" aria-hidden="true">
    <div class="drawer-h"><span>${t("nav.menu")}</span><button type="button" class="icon-btn" id="drawer-x" aria-label="${t("nav.close")}">${ic("x", 22)}</button></div>
    <nav class="drawer-nav" id="drawer-nav" aria-label="${t("nav.menu")}">${drawerItems.map(x => `<a href="${x.h}" data-nav="${x.id}"${cur(nav, x.id)}>${ic(x.i, 22)}<span>${x.t}</span>${x.n ? `<small>${fmtNum(x.n)}</small>` : ""}</a>`).join("")}</nav>
    ${switcher(path, "in-drawer")}<div class="drawer-f"><a href="${YT_CHANNEL}" target="_blank" rel="noopener">${ic("external-link", 17)} ${t("drawer.yt")}</a><a href="${WP_SITE}" target="_blank" rel="noopener">${ic("external-link", 17)} ${t("drawer.site")}</a></div>
  </aside>`;
}
export function chromeBottom(nav) {
  const vis = navItems(), extra = ["audio", "lectures", "khutab", "urdu", "books"].map(id => vis.find(s => s.id === id)).filter(Boolean)[0];
  const items = [{ id: "home", t: t("nav.home"), i: "house", h: href.home() }, { id: "library", t: t("nav.libraryBottom"), i: "layout-grid", h: href.library() }, { id: "search", t: t("nav.search"), i: "search", h: href.search(), mid: true }];
  if (extra) items.push({ id: extra.id, t: t("nav.bottomLabel", extra.t), i: extra.i, h: extra.h });
  return `<nav class="bottom" id="bottom" aria-label="${t("nav.quick")}">${items.map(x => `<a class="bn${x.mid ? " mid" : ""}" href="${x.h}" data-nav="${x.id}"${nav === x.id ? ' aria-current="page"' : ""}><span class="bn-i">${ic(x.i, x.mid ? 25 : 22)}</span><span>${x.t}</span></a>`).join("")}
    <a class="bn" href="#" role="button" data-nav="more" id="bn-more"><span class="bn-i">${ic("menu", 22)}</span><span>${t("nav.more")}</span></a></nav>`;
}
export const footer = (path = "/") => `<footer class="foot"><div class="wrap">
  <p class="foot-official">${t("foot.official", { name: esc(officialName()), role: esc(t("brand.role")) })}${[state.bio && `<a href="${href.about()}">${t("home.about")}</a>`, state.schedule && `<a href="${href.schedule()}">${t("sched.crumb")}</a>`, `<a href="${href.news()}">${t("news.title")}</a>`].filter(Boolean).map(x => " " + x).join(" ·")}</p>
  <p>${t("foot.sources", { yt: YT_CHANNEL, wp: WP_SITE })}</p>
  <p>${t("foot.updated", { date: fmtDate(state.DB.updated) })}</p>${switcher(path, "in-foot")}</div></footer>`;

/* hreflang alternates of a page: the same page in every indexed language (+ x-default = Arabic). None while only Arabic is live. */
export const basePath = p => p.lang === "ar" ? p.path : p.path.slice(langPrefix(p.lang).length) || "/";
export function alternates(p) {
  if (p.status !== 200 || LANGS.indexed.length < 2 || !LANGS.indexed.includes(p.lang)) return [];
  const base = basePath(p), at = l => SITE + langPrefix(l) + base;
  return [...LANGS.indexed.map(l => ({ hreflang: l, href: at(l) })), { hreflang: "x-default", href: at("ar") }];
}
export function headHtml(p) {
  const url = SITE + p.path;
  return `<title>${esc(p.title)}</title>
<meta id="m-desc" name="description" content="${esc(p.description)}">
<link id="m-canon" rel="canonical" href="${esc(url)}">${alternates(p).map(a => `\n<link rel="alternate" hreflang="${a.hreflang}" href="${esc(a.href)}">`).join("")}
<meta id="m-robots" name="robots" content="${p.noindex ? "noindex, follow" : "index, follow, max-image-preview:large"}">
<meta property="og:site_name" content="${esc(officialName())}"><meta property="og:locale" content="${LANG_META[p.lang || "ar"].locale}"><meta id="og-type" property="og:type" content="${p.ogType}">
<meta id="og-title" property="og:title" content="${esc(p.title)}"><meta id="og-desc" property="og:description" content="${esc(p.description)}">
<meta id="og-url" property="og:url" content="${esc(url)}"><meta id="og-img" property="og:image" content="${esc(p.image)}">
<meta name="twitter:card" content="summary_large_image"><meta id="tw-title" name="twitter:title" content="${esc(p.title)}"><meta id="tw-desc" name="twitter:description" content="${esc(p.description)}"><meta id="tw-img" name="twitter:image" content="${esc(p.image)}">
<meta name="theme-color" content="#f1e5c8">
${p.jsonld.length ? `<script id="ld" type="application/ld+json">${jsonLd(p.jsonld)}</script>` : '<script id="ld" type="application/ld+json">[]</script>'}`;
}
