(() => {
  const $app = document.getElementById("app");
  const PAGE = 60;

  /* ───────── Site structure ─────────
     Every series belongs to one section (series.sec). Books are their own collection. */
  const SECTIONS = [
    { id: "duroos",   title: "الدروس المرئية",  icon: "video",       desc: "شروح الكتب والسلاسل العلمية مرئيةً، من قناة الشيخ على يوتيوب." },
    { id: "audio",    title: "الدروس الصوتية",  icon: "headphones",  desc: "سلاسل علمية صوتية للاستماع والتحميل." },
    { id: "lectures", title: "المحاضرات",       icon: "mic-vocal",   desc: "محاضرات وكلمات وفتاوى ولقاءات منفردة." },
    { id: "khutab",   title: "الخطب",           icon: "scroll-text", desc: "خطب الجمعة والمناسبات." },
    { id: "urdu",     title: "الدروس بالأردية", icon: "languages",   desc: "دروس ومحاضرات باللغة الأردية." },
    { id: "books",    title: "الكتب",           icon: "book-open",   desc: "مؤلفات الشيخ وتحقيقاته للقراءة والتحميل.", route: "#/books" },
  ];
  const UNIT = { muslim: "المجلس", "fadail-sahabah": "المجلس", nasai: "المجلس" };   // numbered-lesson label per series
  const SPINE = { muslim: "#1d5a47", "ibn-majah": "#7d2a1d", "fadail-sahabah": "#1f3556", jami: "#8a5a16", nuzhat: "#52305f", nasai: "#175561", misc: "#3b3630" };
  const SPINE_PALETTE = ["#1d5a47", "#7d2a1d", "#1f3556", "#8a5a16", "#52305f", "#175561", "#3b3630", "#5a3d1c", "#2f4a2a"];
  const SPINE_H = [318, 284, 300, 262, 292, 248, 276];

  let DB, byId = {}, seriesById = {}, secById = {};

  /* ───────── Helpers ───────── */
  const ic = (n, s = 20, cls = "") => `<svg class="ic ${cls}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(window.ICONS || {})[n] || ""}</svg>`;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Arabic-insensitive search: drop tashkeel/tatweel, unify alef/ya/ta-marbuta, Arabic digits -> latin
  const norm = s => String(s || "").toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  const nf = new Intl.NumberFormat("ar-EG", { useGrouping: false });
  const fmtNum = n => nf.format(n);
  // Dates are shown in the Hijri (Umm al-Qura) calendar only. Input: YYYY-MM-DD.
  const HIJRI = "ar-SA-u-ca-islamic-umalqura-nu-arab";
  const hijriFull = new Intl.DateTimeFormat(HIJRI, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const hijriYear = new Intl.DateTimeFormat(HIJRI, { year: "numeric", timeZone: "UTC" });
  const at = d => new Date(d + "T12:00:00Z");
  const fmtDate = d => d ? hijriFull.format(at(d)) : "";
  const HM = ["محرم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"];
  // `hd` = Hijri date taken from the source ("1433-3-2", "1427-3" or just "1426"); otherwise convert the Gregorian `date`.
  const fmtHijri = hd => { const [y, m, d] = hd.split("-").map(Number); return [d ? fmtNum(d) : "", m ? HM[m - 1] : "", fmtNum(y), "هـ"].filter(Boolean).join(" "); };
  const ldate = l => l.hd ? fmtHijri(l.hd) : l.date ? fmtDate(l.date) : "";
  const fmtYear = d => d ? hijriYear.format(at(d)).replace(/\s*هـ$/, "") : "";
  const dur = s => { if (!s) return ""; const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };
  const hours = s => { const h = Math.round(s / 3600); return h ? fmtNum(h) + " ساعة" : ""; };
  const debounce = (f, ms = 160) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };

  const dg = s => String(s ?? "").replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]);   // Arabic-Indic digits for titles from any source
  const kindIcon = l => l.kind === "audio" ? "headphones" : "video";
  const useLabel = l => l.kind === "video" && l.n != null && l.series !== "misc";   // YouTube titles are long; show "المجلس N" instead
  const label = l => `${seriesById[l.series].unit || "الدرس"} ${fmtNum(l.n)}`;
  const mainTitle = (l, withBook = true) => useLabel(l) ? `${label(l)}${withBook && l.section ? " — " + l.section : ""}` : dg(l.title);
  const secOfSeries = s => secById[s.sec] || secById.duroos;
  const secOfLesson = l => secOfSeries(seriesById[l.series]);
  const seriesOrder = (a, b) => (a.n ?? 1e9) - (b.n ?? 1e9) || (a.o - b.o);
  const thumb = id => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
  const searchBox = (ph, v = "", id = "q") => `<div class="search">${ic("search", 22)}<input id="${id}" type="search" placeholder="${ph}" value="${esc(v)}" autocomplete="off" enterkeyhint="search"></div>`;
  const STAR = `<svg viewBox="0 0 24 24"><path d="M12 0l2.6 5.4L20.5 3.5l-1.9 5.9L24 12l-5.4 2.6 1.9 5.9-5.9-1.9L12 24l-2.6-5.4-5.9 1.9 1.9-5.9L0 12l5.4-2.6-1.9-5.9 5.9 1.9z"/></svg>`;

  function match(l, q) {
    if (!q) return true;
    const s = seriesById[l.series];
    const hay = l._h || (l._h = norm(`${l.title} ${s.title} ${secOfSeries(s).title} ${l.section || ""} ${l.n != null ? "المجلس الدرس " + l.n : ""} ${fmtYear(l.date)}`));
    return norm(q).split(/\s+/).filter(Boolean).every(t => hay.includes(t));
  }

  /* ───────── Components ───────── */
  function spine(s, i) {
    const w = Math.round(74 + Math.min(70, Math.log(s.count + 1) * 11.5));
    return `<a class="spine" href="#/series/${s.id}" title="${esc(s.title)} — ${fmtNum(s.count)} درسًا" style="--fs:${s.title.length > 34 ? 16 : s.title.length > 24 ? 18 : 23}px;--w:${w}px;--h:${SPINE_H[i % SPINE_H.length]}px;--c:${SPINE[s.id] || SPINE_PALETTE[i % SPINE_PALETTE.length]};--i:${i}">
      ${STAR.replace("<svg", '<svg class="sp-star"')}<span class="sp-title">${esc(s.title)}</span><span class="sp-count">${fmtNum(s.count)}</span></a>`;
  }
  const shelf = list => `<div class="shelf-wrap"><div class="shelf">${list.map((s, i) => spine(s, i)).join("")}</div><div class="board"></div>
    <div class="shelf-note">سُمك الكتاب بقدر عدد دروسه — اضغط على كتاب لفتح السلسلة</div></div>`;

  function lessonCard(l, i = 0) {
    const s = seriesById[l.series];
    const title = useLabel(l) ? `${s.title} — ${label(l)}${l.section ? " · " + l.section : ""}` : s.ordered ? `${dg(l.title)} — ${s.title}` : dg(l.title);
    const media = l.kind === "audio"
      ? `<div class="thumb aud"><span class="aud-ic">${ic("headphones", 44)}</span><span class="aud-t">${esc(s.title)}</span>${l.duration ? `<span class="dur">${dur(l.duration)}</span>` : ""}</div>`
      : `<div class="thumb"><img loading="lazy" src="${thumb(l.id)}" alt=""><span class="play"><i>${ic("play", 24)}</i></span>${l.duration ? `<span class="dur">${dur(l.duration)}</span>` : ""}</div>`;
    return `<a class="card" href="#/watch/${encodeURIComponent(l.id)}" style="--i:${i}">${media}
      <div class="card-b"><h3>${esc(title)}</h3>
      <div class="meta"><span class="tag">${ic(kindIcon(l), 13)}${esc(secOfSeries(s).title)}</span>${ldate(l) ? `<span>${ldate(l)}</span>` : ""}</div></div></a>`;
  }
  function seriesCard(s, i = 0) {
    const span = s.first ? `<span class="tag plain">${fmtYear(s.first)} – ${fmtYear(s.last)}</span>` : "";
    return `<a class="card scard" href="#/series/${s.id}" style="--i:${i}"><h3>${esc(s.title)}</h3>${s.description ? `<p>${esc(s.description)}</p>` : ""}
      <div class="meta"><span class="tag gold">${fmtNum(s.count)} درسًا</span>${hours(s.seconds) ? `<span class="tag plain">${hours(s.seconds)}</span>` : ""}${span}</div></a>`;
  }
  function row(l, opts = {}) {
    const s = seriesById[l.series];
    const sub = (opts.showSeries ? `${esc(s.title)}` : "") + (opts.showSeries && ldate(l) ? " · " : "") + ldate(l);
    return `<a class="row${opts.now === l.id ? " now" : ""}" href="#/watch/${encodeURIComponent(l.id)}" style="--i:${Math.min(opts.i || 0, 24)}" ${opts.now === l.id ? 'aria-current="true"' : ""}>
      <span class="no">${l.n != null ? fmtNum(l.n) : ic(kindIcon(l), 18)}</span>
      <span class="tt"><span class="t">${esc(mainTitle(l, !opts.noSection))}</span><span class="s">${ic(kindIcon(l), 12, "k")}${sub}</span></span>
      ${l.duration ? `<span class="d">${dur(l.duration)}</span>` : ""}</a>`;
  }
  const tile = (s, n) => `<a class="tile" href="${s.route || "#/section/" + s.id}"><span class="tile-ic">${ic(s.icon, 26)}</span>
      <span class="tile-b"><strong>${s.title}</strong><span>${s.desc}</span></span><span class="tile-n">${fmtNum(n)}</span></a>`;

  const sectionCount = id => id === "books" ? DB.books.length : DB.lessons.filter(l => secOfLesson(l).id === id).length;
  const visible = () => SECTIONS.filter(s => sectionCount(s.id) > 0);

  /* ───────── Views ───────── */
  function home() {
    const vis = visible();
    const top = DB.series.slice().sort((a, b) => b.count - a.count).slice(0, 10);
    const latest = DB.lessons.filter(l => l.date).slice(0, 8);
    $app.innerHTML = `
      <section class="hero"><div class="bism">بسم الله الرحمن الرحيم</div>
        <h1>الشيخ <em>وصي الله</em> بن محمد عباس</h1>
        <div class="dua">حفظه الله</div>
        <div class="orn">${STAR}</div>
        <p>فهرس منظّم لدروس ومحاضرات الشيخ أ.د. وصي الله بن محمد عباس حفظه الله، مرتّبة بحسب الأقسام والكتب لتصل إلى ما تريده بسرعة.</p>
        ${searchBox("ابحث عن درس أو كتاب أو باب… مثال: صحيح مسلم كتاب الحج")}
        <div class="stats"><span><b>${fmtNum(DB.lessons.length)}</b>مادة علمية</span><span><b>${fmtNum(DB.series.length)}</b>سلسلة</span>${DB.books.length ? `<span><b>${fmtNum(DB.books.length)}</b>كتابًا</span>` : ""}</div></section>
      <div class="sec"><h2>الأقسام</h2></div>
      <div class="tiles">${vis.map(s => tile(s, sectionCount(s.id))).join("")}</div>
      <div class="sec"><h2>خزانة الكتب</h2><a href="#/library">كل الأقسام ${ic("chevron-left", 15)}</a></div>
      ${shelf(top)}
      <div class="sec"><h2>أحدث المواد</h2><a href="#/search">الكل ${ic("chevron-left", 15)}</a></div>
      <div class="grid">${latest.map(lessonCard).join("")}</div>`;
    const q = document.getElementById("q");
    q.addEventListener("keydown", e => { if (e.key === "Enter" && q.value.trim()) location.hash = "#/search?q=" + encodeURIComponent(q.value.trim()); });
  }

  function library() {
    $app.innerHTML = `<div class="crumb"><a href="#/">الرئيسية</a> / الأقسام</div><h1 class="page-h">المكتبة</h1>
      <p class="lede">اختر قسمًا لتصفّح محتواه.</p>
      <div class="tiles">${visible().map(s => tile(s, sectionCount(s.id))).join("")}</div>`;
  }

  function sectionPage(id) {
    const sec = secById[id];
    if (!sec || id === "books") return id === "books" ? books() : notFound();
    const ser = DB.series.filter(s => s.sec === id);
    if (!ser.length) return notFound();
    if (ser.length === 1) { location.replace("#/series/" + ser[0].id); return; }   // flat section: go straight to its list
    const items = DB.lessons.filter(l => secOfLesson(l).id === id);
    const latest = items.filter(l => l.date).slice(0, 8);
    $app.innerHTML = `<div class="crumb"><a href="#/">الرئيسية</a> / ${sec.title}</div>
      <div class="title-page"><span class="tile-ic big">${ic(sec.icon, 34)}</span><div><h1 class="page-h">${sec.title}</h1><p class="lede">${sec.desc} — ${fmtNum(ser.length)} سلسلة · ${fmtNum(items.length)} مادة</p></div></div>
      ${shelf(ser.slice().sort((a, b) => b.count - a.count))}
      <div class="sec"><h2>تفاصيل السلاسل</h2></div><div class="grid">${ser.map(seriesCard).join("")}</div>
      ${latest.length ? `<div class="sec"><h2>أحدث المواد</h2><a href="#/search?sec=${id}">الكل ${ic("chevron-left", 15)}</a></div><div class="grid">${latest.map(lessonCard).join("")}</div>` : ""}`;
  }

  function search(params) {
    const st = { q: params.get("q") || "", sec: params.get("sec") || "", sort: params.get("sort") || "new", shown: PAGE };
    const vis = visible().filter(s => s.id !== "books");
    $app.innerHTML = `<div class="crumb"><a href="#/">الرئيسية</a> / بحث</div><h1 class="page-h">البحث في المكتبة</h1>
      <div class="bar">${searchBox("ابحث في كل الدروس والمحاضرات…", st.q)}
        <select id="sort" aria-label="الترتيب"><option value="new">الأحدث أولًا</option><option value="old" ${st.sort === "old" ? "selected" : ""}>الأقدم أولًا</option></select></div>
      <div class="pill-row" id="secs"><button class="pill${st.sec ? "" : " on"}" data-s="">الكل</button>${vis.map(s => `<button class="pill${st.sec === s.id ? " on" : ""}" data-s="${s.id}">${s.title}</button>`).join("")}</div>
      <div class="count" id="count"></div><div id="out"></div>`;
    const out = document.getElementById("out"), count = document.getElementById("count"), qi = document.getElementById("q");
    const paint = () => {
      let r = DB.lessons.filter(l => (!st.sec || secOfLesson(l).id === st.sec) && match(l, st.q));
      if (st.sort === "old") r = r.slice().reverse();
      count.textContent = r.length ? `${fmtNum(r.length)} نتيجة` : "";
      out.innerHTML = r.length
        ? `<div class="list cols">${r.slice(0, st.shown).map((l, i) => row(l, { showSeries: true, i })).join("")}</div>${r.length > st.shown ? `<button class="more" id="more">عرض المزيد</button>` : ""}`
        : `<div class="empty">لا توجد نتائج مطابقة. جرّب كلمات أقل أو اكتب اسم الكتاب فقط.</div>`;
      const m = document.getElementById("more"); if (m) m.onclick = () => { st.shown += PAGE; paint(); };
      const p = new URLSearchParams(); if (st.q) p.set("q", st.q); if (st.sec) p.set("sec", st.sec); if (st.sort !== "new") p.set("sort", st.sort);
      history.replaceState(null, "", "#/search" + (p.toString() ? "?" + p : ""));
    };
    qi.addEventListener("input", debounce(e => { st.q = e.target.value; st.shown = PAGE; paint(); }));
    document.getElementById("sort").onchange = e => { st.sort = e.target.value; paint(); };
    const secs = document.getElementById("secs");
    secs.onclick = e => { const b = e.target.closest(".pill"); if (!b) return; st.sec = b.dataset.s;
      secs.querySelectorAll(".pill").forEach(x => x.classList.toggle("on", x === b)); st.shown = PAGE; paint(); };
    paint();
    if (!st.q && matchMedia("(max-width:900px)").matches) qi.focus({ preventScroll: true });
  }

  function seriesPage(id) {
    const s = seriesById[id];
    if (!s) return notFound();
    const sec = secOfSeries(s), flat = DB.series.filter(x => x.sec === s.sec).length === 1;
    const all = DB.lessons.filter(l => l.series === id);
    const numbered = !!s.ordered || all.some(l => l.n != null);
    const firstSeen = {};
    const when = l => l.date || String(l.o).padStart(8, "0");
    all.forEach(l => { if (l.section && (!firstSeen[l.section] || when(l) < firstSeen[l.section])) firstSeen[l.section] = when(l); });
    const sections = Object.keys(firstSeen).sort((x, y) => firstSeen[x].localeCompare(firstSeen[y]));   // chronological: by when each book was first taught
    const st = { q: "", sec: "", sort: numbered ? "num" : "new", shown: 100 };
    const crumb = `<a href="#/">الرئيسية</a> / ${flat ? sec.title : `<a href="#/section/${sec.id}">${sec.title}</a> / ${esc(s.title)}`}`;
    const head = flat
      ? `<span class="tile-ic big">${ic(sec.icon, 34)}</span>`
      : `<span class="spine mini" style="--c:${SPINE[s.id] || SPINE_PALETTE[DB.series.indexOf(s) % SPINE_PALETTE.length]}">${STAR.replace("<svg", '<svg class="sp-star"')}<span class="sp-count">${fmtNum(s.count)}</span></span>`;
    $app.innerHTML = `<div class="crumb">${crumb}</div>
      <div class="title-page">${head}<div><h1 class="page-h">${esc(s.title)}</h1><p class="lede">${esc(s.description || sec.desc)} — ${fmtNum(s.count)} درسًا${hours(s.seconds) ? " · " + hours(s.seconds) : ""}</p>${s.extra ? `<a class="btn" href="${esc(s.extra.url)}" target="_blank" rel="noopener">${ic("external-link", 17)} ${esc(s.extra.label)}</a>` : ""}</div></div>
      <div class="bar">${searchBox("ابحث داخل السلسلة (رقم الدرس أو الباب)…")}
        <select id="sort"><option value="new">الأحدث أولًا</option><option value="old">الأقدم أولًا</option>${numbered ? `<option value="num" selected>بالترتيب (الأول فالأخير)</option>` : ""}</select></div>
      ${sections.length > 1 ? `<div class="pill-row" id="secs"><button class="pill on" data-s="">الكل</button>${sections.map(x => `<button class="pill" data-s="${esc(x)}">${esc(x)}</button>`).join("")}</div>` : ""}
      <div class="count" id="count"></div><div id="out"></div>`;
    const out = document.getElementById("out"), count = document.getElementById("count");
    const paint = () => {
      let r = all.filter(l => (!st.sec || l.section === st.sec) && match(l, st.q));
      r = st.sort === "num" ? r.slice().sort(seriesOrder) : st.sort === "old" ? r.slice().reverse() : r;
      count.textContent = `${fmtNum(r.length)} درسًا`;
      let html = "", last, k = 0;
      for (const l of r.slice(0, st.shown)) {
        if (st.sort === "num" && !st.sec && sections.length > 1 && l.section !== last) { last = l.section; html += `<div class="sect">${esc(l.section || "أخرى")}</div>`; }
        html += row(l, { noSection: true, i: k++ });
      }
      out.innerHTML = r.length ? `<div class="list cols">${html}</div>${r.length > st.shown ? `<button class="more" id="more">عرض المزيد</button>` : ""}` : `<div class="empty">لا توجد نتائج.</div>`;
      const m = document.getElementById("more"); if (m) m.onclick = () => { st.shown += 100; paint(); };
    };
    document.getElementById("q").addEventListener("input", debounce(e => { st.q = e.target.value; paint(); }));
    document.getElementById("sort").onchange = e => { st.sort = e.target.value; paint(); };
    const secs = document.getElementById("secs");
    if (secs) secs.onclick = e => { const b = e.target.closest(".pill"); if (!b) return; st.sec = b.dataset.s;
      secs.querySelectorAll(".pill").forEach(x => x.classList.toggle("on", x === b)); st.shown = 100; paint(); };
    paint();
  }

  function watch(id) {
    const l = byId[id];
    if (!l) return notFound();
    const s = seriesById[l.series], sec = secOfSeries(s), flat = DB.series.filter(x => x.sec === s.sec).length === 1;
    const sib = DB.lessons.filter(x => x.series === l.series).sort(numberedSeries(l.series) ? seriesOrder : (a, b) => (b.date || "").localeCompare(a.date || "") || a.o - b.o);
    const i = sib.findIndex(x => x.id === id), prev = sib[i - 1], next = sib[i + 1];
    const title = useLabel(l) ? `${label(l)} — ${s.title}` : s.ordered ? `${dg(l.title)} — ${s.title}` : dg(l.title);
    document.title = title + " | الشيخ وصي الله بن محمد عباس حفظه الله";
    const player = l.kind === "audio"
      ? `<div class="frame"><div class="audio-panel"><span class="disc">${ic("headphones", 46)}</span><div class="ap-t">${esc(s.title)}</div>
           <audio id="aud" controls preload="metadata" src="${esc(l.src)}"></audio>
           <div class="speeds" role="group" aria-label="سرعة التشغيل">${[1, 1.25, 1.5, 2].map(v => `<button data-v="${v}" class="${v === 1 ? "on" : ""}">${fmtNum(v).replace("٫", ".")}×</button>`).join("")}</div></div></div>`
      : `<div class="frame"><div class="player"><iframe src="https://www.youtube-nocookie.com/embed/${esc(l.id)}?autoplay=1&rel=0" title="${esc(l.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div></div>`;
    const ext = l.kind === "audio"
      ? `<a class="btn" href="${esc(l.src)}" download target="_blank" rel="noopener">${ic("download", 17)} تحميل</a>`
      : `<a class="btn" href="https://www.youtube.com/watch?v=${esc(l.id)}" target="_blank" rel="noopener">${ic("external-link", 17)} فتح في يوتيوب</a>`;
    $app.innerHTML = `<div class="crumb"><a href="#/">الرئيسية</a> / ${flat ? "" : `<a href="#/section/${sec.id}">${sec.title}</a> / `}<a href="#/series/${s.id}">${esc(s.title)}</a></div>
      <div class="watch"><div>${player}
        <h1 class="w-title">${esc(title)}</h1>
        <div class="w-meta">${l.section ? `<span class="tag gold">${esc(l.section)}</span>` : ""}<span class="tag">${ic(kindIcon(l), 13)}${sec.title}</span>${ldate(l) ? `<span class="tag plain">${ldate(l)}</span>` : ""}${l.duration ? `<span class="tag plain">${ic("clock", 13)}${dur(l.duration)}</span>` : ""}</div>
        ${useLabel(l) ? `<p class="orig">${esc(l.title)}</p>` : ""}
        <div class="btns">
          <a class="btn pri" href="${next ? "#/watch/" + encodeURIComponent(next.id) : "#"}" aria-disabled="${!next}">التالي ${ic("chevron-left", 17)}</a>
          <a class="btn" href="${prev ? "#/watch/" + encodeURIComponent(prev.id) : "#"}" aria-disabled="${!prev}">${ic("chevron-left", 17, "flip")} السابق</a>
          ${ext}<button class="btn" id="share">${ic("link", 17)} نسخ الرابط</button></div>
      </div>
      <aside class="side"><h3>${esc(s.title)} <small>${fmtNum(i + 1)} / ${fmtNum(sib.length)}</small></h3>
        <div class="scroll">${sib.map(x => row(x, { now: id })).join("")}</div></aside></div>`;
    const cur = $app.querySelector(".side .now"); if (cur) cur.scrollIntoView({ block: "center" });
    document.getElementById("share").onclick = e => { navigator.clipboard?.writeText(location.href); e.currentTarget.innerHTML = ic("check", 17) + " تم النسخ"; };
    const aud = document.getElementById("aud");
    if (aud) {
      aud.play().catch(() => {});
      aud.onended = () => { if (next) location.hash = "#/watch/" + encodeURIComponent(next.id); };
      document.querySelector(".speeds").onclick = e => { const b = e.target.closest("button"); if (!b) return;
        aud.playbackRate = +b.dataset.v; document.querySelectorAll(".speeds button").forEach(x => x.classList.toggle("on", x === b)); };
    }
    window.scrollTo(0, 0);
  }
  const numberedSeries = id => !!seriesById[id].ordered || DB.lessons.some(l => l.series === id && l.n != null);

  function books() {
    const groups = [];
    DB.books.forEach(k => { const g = k.group || "الكتب"; let e = groups.find(x => x.g === g); if (!e) groups.push(e = { g, items: [] }); e.items.push(k); });
    const files = k => k.files || (k.url ? [{ label: "تحميل", url: k.url }] : []);
    const card = (k, i) => {
      const f = files(k), multi = f.length > 1, main = k.title.split(/\s[–—-]\s/)[0].replace(/\s*\(.*$/, "");
      return `<article class="book" style="--i:${Math.min(i, 12)}"${k.lang ? ` lang="${k.lang}"` : ""}>
        <div class="cover">${k.cover ? `<img loading="lazy" src="${esc(k.cover)}" alt="">` : `<span class="cover-t">${esc(main)}</span>`}</div>
        <div class="book-b"><h3>${esc(k.title)}</h3>${k.desc ? `<p>${esc(k.desc)}</p>` : ""}${k.note ? `<p class="note">${esc(k.note)}</p>` : ""}
          <div class="btns">${f.map((x, n) => `<a class="btn${n === 0 && !multi ? " pri" : " sm"}" href="${esc(x.url)}" target="_blank" rel="noopener">${n === 0 || !multi ? ic("download", 16) + " " : ""}${esc(multi ? x.label : (x.label || "تحميل"))}</a>`).join("")}</div></div></article>`;
    };
    $app.innerHTML = `<div class="crumb"><a href="#/">الرئيسية</a> / الكتب</div>
      <div class="title-page"><span class="tile-ic big">${ic("book-open", 34)}</span><div><h1 class="page-h">الكتب</h1><p class="lede">${secById.books.desc} — ${fmtNum(DB.books.length)} كتابًا</p></div></div>
      ${groups.map(g => `<div class="sec"><h2>${esc(g.g)}</h2></div><div class="books">${g.items.map(card).join("")}</div>`).join("")}`;
  }

  const notFound = () => { $app.innerHTML = `<div class="empty"><h2>الصفحة غير موجودة</h2><p><a href="#/" style="color:var(--rubric)">العودة للرئيسية</a></p></div>`; };

  /* ───────── Chrome: header nav, drawer, bottom bar ───────── */
  const drawer = document.getElementById("drawer"), scrim = document.getElementById("scrim"), burger = document.getElementById("burger");
  function setDrawer(open) {
    drawer.classList.toggle("open", open); drawer.setAttribute("aria-hidden", !open); scrim.hidden = !open;
    burger.setAttribute("aria-expanded", open); document.body.classList.toggle("lock", open);
    if (open) document.getElementById("drawer-x").focus(); else if (document.activeElement && drawer.contains(document.activeElement)) burger.focus();
  }
  function buildChrome() {
    const vis = visible();
    document.getElementById("burger").innerHTML = ic("menu", 22);
    document.getElementById("hsearch").innerHTML = ic("search", 20);
    document.getElementById("drawer-x").innerHTML = ic("x", 22);
    document.getElementById("nav").innerHTML = `<a href="#/" data-nav="home">الرئيسية</a>` + vis.map(s => `<a href="${s.route || "#/section/" + s.id}" data-nav="${s.id}">${s.title}</a>`).join("");
    document.getElementById("drawer-nav").innerHTML = [{ id: "home", title: "الرئيسية", icon: "house", route: "#/" }, { id: "library", title: "كل الأقسام", icon: "layout-grid", route: "#/library" }, { id: "search", title: "بحث", icon: "search", route: "#/search" }]
      .concat(vis).map(s => `<a href="${s.route || "#/section/" + s.id}" data-nav="${s.id}">${ic(s.icon, 22)}<span>${s.title}</span>${secById[s.id] && s.id !== "books" ? `<small>${fmtNum(sectionCount(s.id))}</small>` : ""}</a>`).join("");
    document.getElementById("drawer-f").innerHTML = `<a href="https://www.youtube.com/@wahatsunnah12" target="_blank" rel="noopener">${ic("external-link", 17)} قناة يوتيوب</a><a href="https://wasiullahabbas.wordpress.com/" target="_blank" rel="noopener">${ic("external-link", 17)} موقع الشيخ</a>`;
    const extra = ["audio", "lectures", "khutab", "urdu", "books"].map(id => vis.find(s => s.id === id)).filter(Boolean)[0];
    const items = [{ id: "home", t: "الرئيسية", i: "house", h: "#/" }, { id: "library", t: "الأقسام", i: "layout-grid", h: "#/library" }, { id: "search", t: "بحث", i: "search", h: "#/search", mid: true }];
    if (extra) items.push({ id: extra.id, t: extra.title.replace("الدروس ", ""), i: extra.icon, h: extra.route || "#/section/" + extra.id });
    items.push({ id: "more", t: "المزيد", i: "menu", btn: true });
    document.getElementById("bottom").innerHTML = items.map(x => x.btn
      ? `<a class="bn" href="#" role="button" data-nav="more" id="bn-more"><span class="bn-i">${ic(x.i, 22)}</span><span>${x.t}</span></a>`
      : `<a class="bn${x.mid ? " mid" : ""}" href="${x.h}" data-nav="${x.id}"><span class="bn-i">${ic(x.i, x.mid ? 25 : 22)}</span><span>${x.t}</span></a>`).join("");
    document.getElementById("bn-more").onclick = e => { e.preventDefault(); setDrawer(true); };
  }
  burger.onclick = () => setDrawer(!drawer.classList.contains("open"));
  scrim.onclick = document.getElementById("drawer-x").onclick = () => setDrawer(false);
  addEventListener("keydown", e => { if (e.key === "Escape" && drawer.classList.contains("open")) setDrawer(false); });

  /* ───────── Router ───────── */
  function route() {
    const [path, qs] = (location.hash.slice(1) || "/").split("?");
    const params = new URLSearchParams(qs || "");
    const [, a, b0] = path.split("/"), b = b0 ? decodeURIComponent(b0) : b0;
    document.title = "دروس الشيخ وصي الله بن محمد عباس حفظه الله";
    setDrawer(false);
    let navId = !a ? "home" : a;
    if (a === "series" && b) navId = seriesById[b]?.sec || "duroos";
    else if (a === "watch" && byId[b]) navId = secOfLesson(byId[b]).id;
    else if (a === "section") navId = b;
    else if (a === "lessons") navId = "search";
    document.querySelectorAll("[data-nav]").forEach(x => x.classList.toggle("on", x.dataset.nav === navId));
    if (!a) home();
    else if (a === "library" || (a === "series" && !b)) library();
    else if (a === "section") sectionPage(b);
    else if (a === "series") seriesPage(b);
    else if (a === "watch") watch(b);
    else if (a === "search" || a === "lessons") search(params);
    else if (a === "books") books();
    else notFound();
    if (a !== "watch") window.scrollTo(0, 0);
  }

  /* ───────── Theme ───────── */
  const root = document.documentElement, themeBtn = document.getElementById("theme");
  const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme:dark)").matches;
  const paintTheme = () => { themeBtn.innerHTML = ic(isDark() ? "sun" : "moon", 20); };
  try { const t = localStorage.getItem("theme"); if (t) root.dataset.theme = t; } catch {}
  themeBtn.onclick = () => { root.dataset.theme = isDark() ? "light" : "dark"; try { localStorage.setItem("theme", root.dataset.theme); } catch {} paintTheme(); };
  paintTheme();

  /* ───────── Boot: YouTube catalogue + optional WordPress library ───────── */
  const getJSON = u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);
  Promise.all([getJSON("catalogue.json"), getJSON("data/library.json")]).then(([cat, lib]) => {
    if (!cat) throw new Error("no catalogue");
    lib = lib || {};
    SECTIONS.forEach(s => secById[s.id] = s);
    DB = {
      series: [...cat.series, ...(lib.series || [])].map(s => ({ ...s, sec: s.sec || "duroos", unit: s.unit || UNIT[s.id] })),
      lessons: [...cat.lessons, ...(lib.lessons || [])].map((l, o) => ({ ...l, kind: l.kind || "video", date: l.date || "", duration: l.duration || 0, o })),
      books: lib.books || [], updated: cat.updated,
    };
    DB.series.forEach(s => seriesById[s.id] = s);
    DB.lessons = DB.lessons.filter(l => seriesById[l.series]).sort((a, b) => b.date.localeCompare(a.date) || a.o - b.o);   // dated newest-first, undated last
    DB.lessons.forEach(l => byId[l.id] = l);
    DB.series.forEach(s => {   // uniform per-series stats, whatever the source
      const ls = DB.lessons.filter(l => l.series === s.id), ds = ls.map(l => l.date).filter(Boolean).sort();
      s.count = ls.length; s.seconds = ls.every(l => l.duration) ? ls.reduce((a, l) => a + l.duration, 0) : 0; s.first = ds[0] || ""; s.last = ds[ds.length - 1] || "";
    });
    DB.series = DB.series.filter(s => s.count > 0);
    document.getElementById("updated").textContent = "آخر تحديث للفهرس: " + fmtDate(DB.updated);
    buildChrome();
    addEventListener("hashchange", route);
    route();
  }).catch(() => { $app.innerHTML = `<div class="empty">تعذّر تحميل الفهرس. شغّل الموقع عبر خادم محلي (python3 -m http.server).</div>`; });
})();
