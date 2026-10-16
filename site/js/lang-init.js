/* Runs first (classic script, only emitted once more than one language is public). A visitor who chose a language before is taken to the same page in it
   when they ARRIVE from outside the site; moving around inside the site never redirects, and crawlers / link previews are never redirected. */
(function () {
  try {
    var d = document.documentElement, ix = (d.getAttribute("data-indexed") || "").split(",");
    if (ix.length < 2) return;
    var saved = localStorage.getItem("lang"), cur = d.lang;
    if (!saved || saved === cur || ix.indexOf(saved) < 0) return;
    if (document.referrer && new URL(document.referrer).origin === location.origin) return;
    if (/bot|crawl|spider|slurp|preview|facebookexternalhit|lighthouse/i.test(navigator.userAgent)) return;
    var p = location.pathname; if (cur !== "ar") p = p.slice(cur.length + 1) || "/";
    location.replace((saved === "ar" ? "" : "/" + saved) + p + location.search + location.hash);
  } catch (e) { /* storage blocked: stay where we are */ }
})();
