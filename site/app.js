(() => {
  const $app = document.getElementById("app");
  const PAGE = 60;
  let DB, byId = {}, seriesById = {};

  /* ---------- helpers ---------- */
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // Arabic-insensitive search: drop tashkeel/tatweel, unify alef/ya/ta-marbuta, Arabic digits -> latin
  const norm = s => String(s || "").toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  const nf = new Intl.NumberFormat("ar-EG");
  const fmtNum = n => nf.format(n);
  const fmtDate = d => d ? new Date(d).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" }) : "";
  const fmtYear = d => d ? nf.format(+d.slice(0, 4)).replace(/٬/g, "") : "";
  const dur = s => { if (!s) return ""; const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };
  const hours = s => { const h = Math.round(s / 3600); return h ? fmtNum(h) + " ساعة" : ""; };
  const thumb = id => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
  const icPlay = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style="scale:-1 1"><path d="M8 5v14l11-7z"/></svg>`;
  const icSearch = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;

  const label = l => {
    const s = seriesById[l.series];
    if (l.n != null && s && s.id !== "misc") return `${l.series === "fadail-sahabah" || l.series === "nasai" ? "المجلس" : (l.series === "muslim" ? "المجلس" : "الدرس")} ${fmtNum(l.n)}`;
    return l.title;
  };
  const seriesOrder = (a, b) => (a.n ?? 1e9) - (b.n ?? 1e9) || a.date.localeCompare(b.date);

  function lessonCard(l) {
    const s = seriesById[l.series];
    const title = l.n != null && s.id !== "misc" ? `${s.title} — ${label(l)}${l.section ? " · " + l.section : ""}` : l.title;
    return `<a class="card" href="#/watch/${l.id}">
      <div class="thumb"><img loading="lazy" src="${thumb(l.id)}" alt=""><span class="play"><i>${icPlay}</i></span>${l.duration ? `<span class="dur">${dur(l.duration)}</span>` : ""}</div>
      <div class="card-b"><h3>${esc(title)}</h3>
      <div class="meta"><span class="tag">${esc(s.title)}</span><span>${fmtDate(l.date)}</span></div></div></a>`;
  }
  function seriesCard(s) {
    return `<a class="card scard" href="#/series/${s.id}"><h3>${esc(s.title)}</h3><p>${esc(s.description)}</p>
      <div class="meta"><span class="tag gold">${fmtNum(s.count)} درسًا</span>${hours(s.seconds) ? `<span class="tag">${hours(s.seconds)}</span>` : ""}<span class="tag">${fmtYear(s.first)}–${fmtYear(s.last)}</span></div></a>`;
  }
  function row(l, opts = {}) {
    const s = seriesById[l.series];
    const main = l.n != null && s.id !== "misc" ? `${label(l)}${l.section && !opts.noSection ? " — " + l.section : ""}` : l.title;
    return `<a class="row${opts.now === l.id ? " now" : ""}" href="#/watch/${l.id}" ${opts.now === l.id ? 'aria-current="true"' : ""}>
      <span class="no">${l.n != null ? fmtNum(l.n) : "▶"}</span>
      <span><span class="t">${esc(opts.full ? l.title : main)}</span>${opts.showSeries ? `<br><span class="s">${esc(s.title)} · ${fmtDate(l.date)}</span>` : `<br><span class="s">${fmtDate(l.date)}</span>`}</span>
      <span class="d">${dur(l.duration)}</span></a>`;
  }
  const searchBox = (ph, v = "", id = "q") => `<div class="search">${icSearch}<input id="${id}" type="search" placeholder="${ph}" value="${esc(v)}" autocomplete="off" enterkeyhint="search"></div>`;

  function match(l, q) {
    if (!q) return true;
    const s = seriesById[l.series];
    const hay = l._h || (l._h = norm(`${l.title} ${s.title} ${l.section || ""} ${l.n != null ? "المجلس الدرس " + l.n : ""} ${l.date.slice(0, 4)}`));
    return norm(q).split(/\s+/).filter(Boolean).every(t => hay.includes(t));
  }
  const debounce = (f, ms = 160) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };

  /* ---------- views ---------- */
  function home() {
    const total = DB.lessons.reduce((a, l) => a + l.duration, 0);
    const latest = DB.lessons.slice(0, 8);
    $app.innerHTML = `
      <section class="hero"><h1>دروس الشيخ وصي الله عباس</h1>
        <p>فهرس منظّم لدروس ومحاضرات الشيخ أ.د. وصي الله بن محمد عباس حفظه الله، مرتّبة بحسب السلاسل والكتب لتصل إلى الدرس الذي تريده بسرعة.</p>
        ${searchBox("ابحث عن درس أو كتاب أو باب… مثال: صحيح مسلم كتاب الحج")}
        <div class="stats"><span><b>${fmtNum(DB.lessons.length)}</b>درسًا</span><span><b>${fmtNum(DB.series.length)}</b>سلسلة</span><span><b>${fmtNum(Math.round(total / 3600))}</b>ساعة</span></div></section>
      <div class="sec"><h2>السلاسل العلمية</h2><a href="#/series">عرض الكل ←</a></div>
      <div class="grid">${DB.series.map(seriesCard).join("")}</div>
      <div class="sec"><h2>أحدث الدروس</h2><a href="#/lessons">كل الدروس ←</a></div>
      <div class="grid">${latest.map(lessonCard).join("")}</div>`;
    const q = document.getElementById("q");
    q.addEventListener("keydown", e => { if (e.key === "Enter" && q.value.trim()) location.hash = "#/lessons?q=" + encodeURIComponent(q.value.trim()); });
  }

  function seriesIndex() {
    $app.innerHTML = `<div class="crumb"><a href="#/">الرئيسية</a> / السلاسل</div><h1 class="page-h">السلاسل العلمية</h1>
      <p class="lede">اختر سلسلة لتصفّح دروسها مرتبة.</p><div class="grid">${DB.series.map(seriesCard).join("")}</div>`;
  }

  function lessons(params) {
    const st = { q: params.get("q") || "", s: params.get("s") || "", sort: params.get("sort") || "new", shown: PAGE };
    $app.innerHTML = `<div class="crumb"><a href="#/">الرئيسية</a> / كل الدروس</div><h1 class="page-h">كل الدروس</h1>
      <div class="bar">${searchBox("ابحث في كل الدروس…", st.q)}
        <select id="s" aria-label="السلسلة"><option value="">كل السلاسل</option>${DB.series.map(s => `<option value="${s.id}" ${s.id === st.s ? "selected" : ""}>${esc(s.title)}</option>`).join("")}</select>
        <select id="sort" aria-label="الترتيب"><option value="new">الأحدث أولًا</option><option value="old" ${st.sort === "old" ? "selected" : ""}>الأقدم أولًا</option></select></div>
      <div class="count" id="count"></div><div id="out"></div>`;
    const out = document.getElementById("out"), count = document.getElementById("count");
    const paint = () => {
      let r = DB.lessons.filter(l => (!st.s || l.series === st.s) && match(l, st.q));
      if (st.sort === "old") r = r.slice().reverse();
      count.textContent = r.length ? `${fmtNum(r.length)} نتيجة` : "";
      out.innerHTML = r.length
        ? `<div class="list">${r.slice(0, st.shown).map(l => row(l, { showSeries: true, full: false })).join("")}</div>${r.length > st.shown ? `<button class="more" id="more">عرض المزيد</button>` : ""}`
        : `<div class="empty">لا توجد نتائج مطابقة. جرّب كلمات أقل أو اكتب اسم الكتاب فقط.</div>`;
      const m = document.getElementById("more");
      if (m) m.onclick = () => { st.shown += PAGE; paint(); };
      const p = new URLSearchParams(); if (st.q) p.set("q", st.q); if (st.s) p.set("s", st.s); if (st.sort !== "new") p.set("sort", st.sort);
      history.replaceState(null, "", "#/lessons" + (p.toString() ? "?" + p : ""));
    };
    document.getElementById("q").addEventListener("input", debounce(e => { st.q = e.target.value; st.shown = PAGE; paint(); }));
    document.getElementById("s").onchange = e => { st.s = e.target.value; st.shown = PAGE; paint(); };
    document.getElementById("sort").onchange = e => { st.sort = e.target.value; paint(); };
    paint();
  }

  function seriesPage(id, params) {
    const s = seriesById[id];
    if (!s) return notFound();
    const all = DB.lessons.filter(l => l.series === id);
    const numbered = all.some(l => l.n != null);
    const sections = [...new Set(all.filter(l => l.section).map(l => l.section))];
    const st = { q: "", sec: "", sort: numbered ? "num" : "new", shown: 100 };
    $app.innerHTML = `<div class="crumb"><a href="#/">الرئيسية</a> / <a href="#/series">السلاسل</a> / ${esc(s.title)}</div>
      <h1 class="page-h">${esc(s.title)}</h1><p class="lede">${esc(s.description)} — ${fmtNum(s.count)} درسًا${hours(s.seconds) ? " · " + hours(s.seconds) : ""}</p>
      <div class="bar">${searchBox("ابحث داخل السلسلة (رقم الدرس أو الباب)…")}
        <select id="sort"><option value="new">الأحدث أولًا</option><option value="old">الأقدم أولًا</option>${numbered ? `<option value="num" selected>بالترتيب (الأول فالأخير)</option>` : ""}</select></div>
      ${sections.length > 1 ? `<div class="pill-row" id="secs"><button class="pill on" data-s="">الكل</button>${sections.map(x => `<button class="pill" data-s="${esc(x)}">${esc(x)}</button>`).join("")}</div>` : ""}
      <div class="count" id="count"></div><div id="out"></div>`;
    const out = document.getElementById("out"), count = document.getElementById("count");
    const paint = () => {
      let r = all.filter(l => (!st.sec || l.section === st.sec) && match(l, st.q));
      r = st.sort === "num" ? r.slice().sort(seriesOrder) : st.sort === "old" ? r.slice().reverse() : r;
      count.textContent = `${fmtNum(r.length)} درسًا`;
      let html = "", last;
      for (const l of r.slice(0, st.shown)) {
        if (st.sort === "num" && !st.sec && sections.length > 1 && l.section !== last) { last = l.section; html += `<div class="sect">${esc(l.section || "أخرى")}</div>`; }
        html += row(l, { noSection: true });
      }
      out.innerHTML = r.length ? `<div class="list">${html}</div>${r.length > st.shown ? `<button class="more" id="more">عرض المزيد</button>` : ""}` : `<div class="empty">لا توجد نتائج.</div>`;
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
    const s = seriesById[l.series];
    const sib = DB.lessons.filter(x => x.series === l.series).sort(s.id === "misc" ? (a, b) => b.date.localeCompare(a.date) : seriesOrder);
    const i = sib.findIndex(x => x.id === id), prev = sib[i - 1], next = sib[i + 1];
    const title = l.n != null && s.id !== "misc" ? `${label(l)} — ${s.title}` : l.title;
    document.title = title + " | الشيخ وصي الله عباس";
    $app.innerHTML = `<div class="crumb"><a href="#/">الرئيسية</a> / <a href="#/series/${s.id}">${esc(s.title)}</a></div>
      <div class="watch"><div>
        <div class="player"><iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" title="${esc(l.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>
        <h1 class="w-title">${esc(title)}</h1>
        <div class="w-meta">${l.section ? `<span class="tag gold">${esc(l.section)}</span>` : ""}<span class="tag">${fmtDate(l.date)}</span>${l.duration ? `<span class="tag">${dur(l.duration)}</span>` : ""}</div>
        <p class="s" style="color:var(--muted);margin:0">${esc(l.title)}</p>
        <div class="btns">
          <a class="btn pri" href="${next ? "#/watch/" + next.id : "#"}" aria-disabled="${!next}">الدرس التالي ←</a>
          <a class="btn" href="${prev ? "#/watch/" + prev.id : "#"}" aria-disabled="${!prev}">→ الدرس السابق</a>
          <a class="btn" href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener">فتح في يوتيوب</a>
          <button class="btn" id="share">نسخ الرابط</button></div>
      </div>
      <aside class="side"><h3>${esc(s.title)} <small style="font:400 13px 'IBM Plex Sans Arabic';color:var(--muted)">(${fmtNum(i + 1)} من ${fmtNum(sib.length)})</small></h3>
        <div class="scroll">${sib.map(x => row(x, { now: id, noSection: false })).join("")}</div></aside></div>`;
    const cur = $app.querySelector(".side .now"); if (cur) cur.scrollIntoView({ block: "center" });
    document.getElementById("share").onclick = e => { navigator.clipboard?.writeText(location.href); e.target.textContent = "تم النسخ ✓"; };
    window.scrollTo(0, 0);
  }

  const notFound = () => { $app.innerHTML = `<div class="empty"><h2>الصفحة غير موجودة</h2><p><a href="#/" style="color:var(--green-2)">العودة للرئيسية</a></p></div>`; };

  /* ---------- router ---------- */
  function route() {
    const [path, qs] = (location.hash.slice(1) || "/").split("?");
    const params = new URLSearchParams(qs || "");
    const [, a, b] = path.split("/");
    document.title = "دروس الشيخ وصي الله عباس";
    document.querySelectorAll("[data-nav]").forEach(x => x.classList.toggle("on", x.dataset.nav === (a === "series" ? "series" : a === "lessons" ? "lessons" : !a ? "home" : "")));
    if (!a) home(); else if (a === "series") b ? seriesPage(b, params) : seriesIndex();
    else if (a === "lessons") lessons(params); else if (a === "watch") watch(b); else notFound();
    if (a !== "watch") window.scrollTo(0, 0);
  }

  /* ---------- theme ---------- */
  const root = document.documentElement;
  try { const t = localStorage.getItem("theme"); if (t) root.dataset.theme = t; } catch {}
  document.getElementById("theme").onclick = () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme:dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch {}
  };

  fetch("catalogue.json").then(r => r.json()).then(d => {
    DB = d;
    d.series.forEach(s => seriesById[s.id] = s);
    d.lessons.forEach(l => byId[l.id] = l);
    document.getElementById("updated").textContent = "آخر تحديث للفهرس: " + fmtDate(d.updated);
    addEventListener("hashchange", route);
    route();
  }).catch(() => { $app.innerHTML = `<div class="empty">تعذّر تحميل الفهرس. شغّل الموقع عبر خادم محلي (python3 -m http.server).</div>`; });
})();
