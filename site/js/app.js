/* Browser app. Pages arrive pre-rendered (scripts/build.mjs); this script wires them up and handles client-side navigation. */
import { init, state, byId, seriesById, secById, ic, safeYt, cleanQuery, oneOf, hashToPath, PAGE, SECTIONS } from "./core.js";
import { resolve, searchResults, seriesInfo, seriesList } from "./views.js";

const $ = s => document.querySelector(s);
const app = $("#app"), live = $("#sr-live");
const debounce = (f, ms = 160) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
const SECIDS = SECTIONS.map(s => s.id);

/* ───────── Meta (kept in sync on client-side navigation) ───────── */
function applyMeta(p) {
  const url = location.origin + p.path;
  document.title = p.title;
  const set = (sel, attr, v) => { const e = $(sel); if (e) e.setAttribute(attr, v); };
  set("#m-desc", "content", p.description); set("#m-canon", "href", url); set("#m-robots", "content", p.noindex ? "noindex, follow" : "index, follow, max-image-preview:large");
  set("#og-title", "content", p.title); set("#og-desc", "content", p.description); set("#og-url", "content", url); set("#og-img", "content", p.image); set("#og-type", "content", p.ogType);
  set("#tw-title", "content", p.title); set("#tw-desc", "content", p.description); set("#tw-img", "content", p.image);
  const ld = $("#ld"); if (ld) ld.textContent = JSON.stringify(p.jsonld).replace(/</g, "\\u003c");
}
function markNav(nav) {
  document.querySelectorAll("[data-nav]").forEach(a => {
    const on = a.dataset.nav === nav;
    a.classList.toggle("on", on && !a.classList.contains("bn"));
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
}

/* ───────── Router ───────── */
let navigated = false;   // true after the first client-side navigation: enables autoplay for audio lessons the user clicked on
export function go(url) { history.pushState(null, "", url); route(false); }
function route(initial) {
  setDrawer(false);
  const u = new URL(location.href), p = resolve(u.pathname, u.searchParams);
  const hydrated = initial && app.dataset.route === p.path && p.status === 200;
  if (!hydrated) { app.innerHTML = p.html; app.dataset.route = p.path; applyMeta(p); }
  markNav(p.nav);
  wire(p, !initial);
  if (!initial) {
    const h1 = app.querySelector("h1");
    if (h1) { h1.setAttribute("tabindex", "-1"); h1.focus({ preventScroll: true }); }
    live.textContent = p.title;
    scrollTo(0, 0);
    navigated = true;
  }
}
addEventListener("popstate", () => route(false));
document.addEventListener("click", e => {
  const a = e.target.closest("a[href]");
  if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if ((a.target && a.target !== "_self") || a.hasAttribute("download") || a.origin !== location.origin) return;
  if (a.getAttribute("href") === "#") return;
  if (!a.pathname.endsWith("/")) return;                      // files (.pdf, .json …) and the 404 page: normal navigation
  e.preventDefault();
  if (a.href === location.href) { scrollTo(0, 0); return; }
  go(a.pathname + a.search);
});

/* ───────── Per-page behaviour ───────── */
function wire(p, byNavigation) {
  const w = p.wire || { t: "none" };
  if (w.t === "home") wireHome();
  else if (w.t === "series") wireSeries(w.id);
  else if (w.t === "search") wireSearch();
  else if (w.t === "lesson") wireLesson(w, byNavigation);
}

function wireHome() {
  const f = app.querySelector("form.search"); if (!f) return;
  f.addEventListener("submit", e => { e.preventDefault(); const q = cleanQuery(f.q.value); go("/search/" + (q ? "?q=" + encodeURIComponent(q) : "")); });
}

function pills(container, onPick) {
  if (!container) return;
  container.addEventListener("click", e => {
    const b = e.target.closest(".pill"); if (!b) return;
    container.querySelectorAll(".pill").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
    onPick(b.dataset.s);
  });
}

function wireSeries(id) {
  const info = seriesInfo(id), q = $("#q"), sort = $("#sort"), out = $("#out"), count = $("#count");
  const st = { q: "", sec: "", sort: oneOf(sort.value, ["new", "old", "num"], "new") };
  const paint = () => { const r = seriesList(info, st); count.textContent = new Intl.NumberFormat("ar-EG", { useGrouping: false }).format(r.count) + " درسًا"; out.innerHTML = r.html; };
  q.addEventListener("input", debounce(e => { st.q = cleanQuery(e.target.value); paint(); }));
  sort.addEventListener("change", e => { st.sort = oneOf(e.target.value, ["new", "old", "num"], "new"); paint(); });
  pills($("#secs"), s => { st.sec = s; paint(); });
}

function wireSearch() {
  const params = new URL(location.href).searchParams;
  const st = { q: cleanQuery(params.get("q")), sec: oneOf(params.get("sec"), SECIDS), sort: oneOf(params.get("sort"), ["new", "old"], "new"), shown: PAGE };
  const out = $("#out"), count = $("#count"), q = $("#q");
  const nfmt = new Intl.NumberFormat("ar-EG", { useGrouping: false });
  const paint = () => {
    const r = searchResults(st);
    count.textContent = r.count ? `${nfmt.format(r.count)} نتيجة` : "";
    out.innerHTML = r.html + (r.more ? `<button type="button" class="more" id="more">عرض المزيد</button>` : "");
    const m = $("#more"); if (m) m.onclick = () => { st.shown += PAGE; paint(); m.blur(); };
    const sp = new URLSearchParams(); if (st.q) sp.set("q", st.q); if (st.sec) sp.set("sec", st.sec); if (st.sort !== "new") sp.set("sort", st.sort);
    history.replaceState(null, "", "/search/" + (sp.toString() ? "?" + sp : ""));
  };
  q.addEventListener("input", debounce(e => { st.q = cleanQuery(e.target.value); st.shown = PAGE; paint(); }));
  $("#sort").addEventListener("change", e => { st.sort = oneOf(e.target.value, ["new", "old"], "new"); paint(); });
  pills($("#secs"), s => { st.sec = oneOf(s, SECIDS); st.shown = PAGE; paint(); });
  paint();
  if (!st.q && !st.sec && matchMedia("(max-width:900px)").matches) q.focus({ preventScroll: true });
}

function wireLesson(w, byNavigation) {
  const sc = $(".side .scroll"), cur = sc && sc.querySelector(".now");
  if (cur) sc.scrollTop = cur.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - sc.clientHeight / 2;
  $("#share")?.addEventListener("click", e => { navigator.clipboard?.writeText(location.href); e.currentTarget.innerHTML = ic("check", 17) + " تم النسخ"; });

  const lite = $(".player.lite");   // YouTube is only loaded when the visitor presses play (faster, more private)
  if (lite) lite.querySelector(".lite-play").addEventListener("click", () => {
    const id = safeYt(lite.dataset.yt); if (!id) return;
    const f = document.createElement("iframe");
    f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`; f.title = $(".w-title")?.textContent || "";
    f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen"; 
    lite.classList.remove("lite"); lite.replaceChildren(f); f.focus();
  });

  const aud = $("#aud");
  if (aud) {
    let retried = false;
    aud.addEventListener("error", () => {   // dead or blocked file: retry once (archive.org nodes fail transiently), then say so
      if (aud.dataset.alt && aud.src !== aud.dataset.alt) { const t = aud.currentTime; aud.src = aud.dataset.alt; aud.load(); aud.currentTime = t; if (byNavigation) aud.play().catch(() => {}); return; }   // our copy failed: use the original
      if (!retried) { retried = true; const t = aud.currentTime; setTimeout(() => { aud.load(); aud.currentTime = t; if (byNavigation) aud.play().catch(() => {}); }, 1500); return; }
      if ($(".ap-err")) return;
      aud.insertAdjacentHTML("afterend", `<p class="ap-err" role="alert">تعذّر تشغيل هذا التسجيل الآن (الملف غير متاح عند المصدر). ${w.next ? "يمكنك الانتقال إلى الدرس التالي." : ""}</p>`);
    });
    if (byNavigation) aud.play().catch(() => {});       // the visitor just clicked a lesson: start it (never on a cold page load)
    aud.addEventListener("ended", () => { if (w.next) go(w.next); });
    $(".speeds").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      aud.playbackRate = +b.dataset.v;
      document.querySelectorAll(".speeds button").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
    });
  }
}

/* ───────── Chrome: drawer, theme (wired once) ───────── */
const drawer = $("#drawer"), scrim = $("#scrim"), burger = $("#burger"), pageParts = () => document.querySelectorAll("#app, .top, .foot, .bottom");
function setDrawer(open) {
  if (open === drawer.classList.contains("open")) return;
  drawer.classList.toggle("open", open); drawer.setAttribute("aria-hidden", !open); scrim.hidden = !open;
  burger.setAttribute("aria-expanded", open); document.body.classList.toggle("lock", open);
  if (open) {
    // The drawer is mid-transition (visibility) for a moment, so focus() can fail: retry for a few frames, THEN make the rest of the
    // page inert so keyboard and screen readers stay inside the menu (inert before focusing breaks focus in Chromium).
    const focusIn = tries => {
      if (!drawer.classList.contains("open")) return;
      const x = $("#drawer-x"); x.focus();
      if (document.activeElement === x || tries <= 0) pageParts().forEach(e => { e.inert = true; });
      else requestAnimationFrame(() => focusIn(tries - 1));
    };
    requestAnimationFrame(() => focusIn(12));
  } else { pageParts().forEach(e => { e.inert = false; }); burger.focus(); }
}
burger.addEventListener("click", () => setDrawer(!drawer.classList.contains("open")));
scrim.addEventListener("click", () => setDrawer(false));
$("#drawer-x").addEventListener("click", () => setDrawer(false));
$("#bn-more")?.addEventListener("click", e => { e.preventDefault(); setDrawer(true); });
addEventListener("keydown", e => {
  if (!drawer.classList.contains("open")) return;
  if (e.key === "Escape") return setDrawer(false);
  if (e.key !== "Tab") return;                               // focus trap
  const f = [...drawer.querySelectorAll("a[href],button")].filter(x => !x.disabled && x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

const root = document.documentElement, themeBtn = $("#theme");
const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme:dark)").matches;
const paintTheme = () => { themeBtn.innerHTML = ic(isDark() ? "sun" : "moon", 20); themeBtn.setAttribute("aria-label", isDark() ? "التبديل إلى الوضع النهاري" : "التبديل إلى الوضع الليلي"); };
themeBtn.addEventListener("click", () => { root.dataset.theme = isDark() ? "light" : "dark"; try { localStorage.setItem("theme", root.dataset.theme); } catch {} paintTheme(); });
paintTheme();

/* ───────── Boot ───────── */
const getJSON = u => fetch(u).then(r => r.ok ? r.json() : null).catch(() => null);
const hasBio = !!document.querySelector('a[href="/about/"]');   // the build links /about/ only when data/bio.json exists: no 404 request while the bio is dormant
Promise.all([getJSON("/catalogue.json"), getJSON("/data/library.json"), hasBio ? getJSON("/data/bio.json") : null]).then(([cat, lib, bio]) => {
  if (!cat) throw new Error("no catalogue");
  init(cat, lib || {}, bio);
  const legacy = () => { if (location.hash.startsWith("#/")) { history.replaceState(null, "", hashToPath(location.hash)); return true; } return false; };   // old shared links (#/watch/ID …)
  legacy();
  addEventListener("hashchange", () => { if (legacy()) route(false); });
  route(true);
}).catch(() => { /* the pre-rendered page stays as it is; only search/filters/players need the data */ });
