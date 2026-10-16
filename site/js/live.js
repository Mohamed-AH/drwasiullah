/* The "live layer" in the browser: banners, announcements and schedule notices from GET /api/live (cached 60 s at the edge), so they change without a rebuild.
   Everything is built with createElement/textContent (never innerHTML) and every link goes through safeUrl (https only). Failure = nothing is shown. */
import { safeUrl, t, getLang, fmtDate } from "./core.js";

const arr = x => Array.isArray(x) ? x.slice(0, 50) : [];
const str = (x, n) => typeof x === "string" ? x.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f‪-‮⁦-⁩]/g, "").slice(0, n) : "";
const ARABIC = /[\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufefc]/;
const el = (tag, cls, text) => {
  const e = document.createElement(tag); if (cls) e.className = cls;
  if (text != null) { e.textContent = text; if (getLang() !== "ar" && ARABIC.test(text)) { e.lang = "ar"; e.dir = "rtl"; } }   // editors write in Arabic: mark it on pages of other languages
  return e;
};

export const loadLive = () => fetch("/api/live", { credentials: "omit" }).then(r => r.ok ? r.json() : null)
  .then(d => d && typeof d === "object" ? { banners: arr(d.banners), announcements: arr(d.announcements), notices: arr(d.notices) } : null).catch(() => null);

const HIJRI = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-arab", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh" });
const RIYADH = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Riyadh" });
const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Asia/Riyadh" });
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hijri = d => { const t = new Date(String(d).replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(d)) ? "" : "Z")); return isNaN(t) ? "" : getLang() === "ar" ? HIJRI.format(t) : fmtDate(RIYADH.format(t)); };
const safe = u => { try { const x = u ? safeUrl(u) : ""; return /^https:\/\//.test(x) ? x : ""; } catch { return ""; } };   // safeUrl answers "#" for anything unsafe: no link then

/* top strip: up to two banners; a visitor's "close" is remembered per banner in this browser only */
export function renderBanners(box, data) {
  if (!box) return;
  box.replaceChildren();
  if (!data) return;
  for (const b of data.banners.slice(0, 2)) {
    const id = Number(b.id), text = str(b.text, 300); if (!Number.isInteger(id) || !text) continue;
    const key = "bnr-" + id; let gone = false; try { gone = !!localStorage.getItem(key); } catch { /* storage blocked: show it */ }
    if (gone && b.dismissible) continue;
    const kind = ["info", "notice", "urgent"].includes(b.kind) ? b.kind : "info";
    const row = el("div", "banner banner-" + kind), inner = el("div", "wrap banner-in");
    inner.append(el("span", "b-text", text));
    const link = safe(str(b.link, 400));
    if (link) { const a = el("a", "b-link", t("live.details")); a.href = link; a.rel = "noopener"; if (!link.startsWith(location.origin)) a.target = "_blank"; inner.append(a); }
    if (b.dismissible) {
      const x = el("button", "b-x", "×"); x.type = "button"; x.setAttribute("aria-label", t("live.close"));
      x.addEventListener("click", () => { try { localStorage.setItem(key, "1"); } catch { /* ignore */ } row.remove(); });
      inner.append(x);
    }
    row.append(inner); box.append(row);
  }
}

/* announcements: the newest few on the home page, all of them on /news/ */
export function fillNews(root, data, limit, level = "h3") {
  if (!root) return 0;
  const list = root.classList.contains("news-list") ? root : root.querySelector(".news-list");
  if (!list) return 0;
  list.replaceChildren();
  const items = data ? data.announcements.slice(0, limit || 50) : [];
  for (const a of items) {
    const title = str(a.title, 200), body = str(a.body, 3000); if (!title) continue;
    const art = el("article", "news-item" + (a.pinned ? " pinned" : ""));
    art.append(el(level, null, title));
    const when = hijri(a.at); if (when) art.append(el("time", "news-when", when));
    if (body) art.append(el("p", "news-body", body));
    const link = safe(str(a.link, 400));
    if (link) { const l = el("a", "btn", str(a.link_label, 60) || t("live.details")); l.href = link; l.rel = "noopener"; if (!link.startsWith(location.origin)) l.target = "_blank"; art.append(l); }
    list.append(art);
  }
  if (!list.children.length) list.append(el("p", "muted", t("news.none")));
  return items.length;
}

/* "no lesson tonight": a badge on the slot of the schedule card of that weekday; today's and upcoming notices only */
export function applyNotices(root, data) {
  if (!root) return;
  root.querySelectorAll(".notice-badge").forEach(x => x.remove());
  root.querySelectorAll("li.slot-off").forEach(x => x.classList.remove("slot-off"));
  if (!data) return;
  const today = RIYADH.format(new Date());
  for (const n of data.notices) {
    const slot = str(n.slot, 20), day = str(n.day, 10), kind = n.kind === "changed" ? "changed" : "cancelled";
    if (!/^[a-z0-9-]{1,20}$/.test(slot) || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day < today) continue;
    const wd = DAYS.indexOf(WEEKDAY.format(new Date(day + "T12:00:00+03:00")));
    const card = root.querySelector(`.sched-day[data-day="${wd}"]`); if (!card) continue;
    for (const li of card.querySelectorAll(`li[data-slot="${slot}"]`)) {
      const note = str(n.note, 160), when = day === today ? t("today.tag") : t("live.day") + hijri(day + " 12:00:00");
      const b = el("span", "notice-badge notice-" + kind, kind === "cancelled" ? t("live.cancelled") + when + (note ? " — " + note : "") : (note || t("live.changed")) + " (" + when + ")");
      li.querySelector(".sw").append(b);
      if (kind === "cancelled") li.classList.add("slot-off");
    }
  }
}
