/* «إضافة من يوتيوب»: the editor pastes YouTube links (optionally with «المجلس الأول (الموضوع)» headings above them); the portal reads each video's public
   title/author (oEmbed, no key) and, when the Worker has the optional secret YOUTUBE_API_KEY, its duration and upload day; shows a review table; and only
   then registers the chosen videos as lessons (origin "library", kind "video", id = the YouTube id) in one audited batch. They are unpublished changes until Publish.
   Nothing is downloaded from YouTube: only the public metadata is read, the lesson plays through the normal YouTube embed.
   Two steps (preview -> add), server-rendered, no script: the review form carries everything it needs and the add step validates it all again. */
import { auditStmt } from "./audit.mjs";
import { esc, layout } from "./html.mjs";
import { hijriToGregorian } from "./hijri.mjs";

const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
export const MAX_ITEMS = 40;
const ID = /^[\w-]{11}$/;
const SECTIONS = ["duroos", "audio", "lectures", "khutab", "urdu", "urdu-qa"];
const SEC_AR = { duroos: "الدروس المرئية", audio: "الدروس الصوتية", lectures: "المحاضرات", khutab: "الخطب", urdu: "الدروس بالأردية", "urdu-qa": "الأسئلة والفتاوى (بالأردية)" };

/* ───────── parsing ───────── */
const ORD = { "الاول": 1, "الحادي": 1, "الثاني": 2, "الثالث": 3, "الرابع": 4, "الخامس": 5, "السادس": 6, "السابع": 7, "الثامن": 8, "التاسع": 9, "العاشر": 10 };
const norm = s => String(s).replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/[ً-ٰٟـ]/g, "");
const digits = s => String(s).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
const URL_RE = /https?:\/\/[^\s<>"')\]،]+/gi;

/* the 11-character video id of a YouTube link, or "" */
export function videoId(url) {
  let u; try { u = new URL(url); } catch { return ""; }
  const h = u.hostname.replace(/^(www|m|music)\./, "");
  let id = "";
  if (h === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (h === "youtube.com" || h === "youtube-nocookie.com") id = u.pathname === "/watch" ? (u.searchParams.get("v") || "") : (/^\/(live|embed|shorts|v)\/([\w-]{11})/.exec(u.pathname) || [])[2] || "";
  return ID.test(id) ? id : "";
}

/* "المجلس الأول (باب فضل التوحيد)" -> { n: 1, topic: "باب فضل التوحيد" } */
export function parseHeading(line) {
  const text = digits(norm(line)), m = /المجلس\s+(?:رقم\s+)?(\d{1,3}|[^\s\d()«»:：\-–—]+(?:\s+عشر)?)/.exec(text);
  if (!m) return null;
  const raw = m[1].replace(/\s+/g, " "), teen = /^(\S+) عشر$/.exec(raw), n = /^\d+$/.test(raw) ? +raw : teen ? (ORD[teen[1]] ? ORD[teen[1]] + 10 : 0) : ORD[raw] || 0;
  if (!n) return null;
  const i = line.indexOf("المجلس"), rest = i >= 0 ? line.slice(i + 6) : line;                      // the original (un-normalised) text keeps the topic as written
  const after = rest.replace(/^\s*(?:رقم\s+)?[^\s:：\-–—(（«]+(?:\s+عشر)?/, "");
  let topic = "";
  const bk = /[(（«]\s*([^)）»]+?)\s*[)）»]/.exec(after);
  if (bk) topic = bk[1]; else { const c = /[:：\-–—]\s*(.+)$/.exec(after); if (c) topic = c[1]; }
  return { n, topic: clean(topic, 200) };
}

/* free text -> [{ id, n?, topic? }]; a «المجلس …» heading applies to the first link after it; duplicates are dropped */
export function parseInput(text) {
  const out = [], seen = new Set();
  let pending = null;
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const urls = line.match(URL_RE) || [], plain = line.replace(URL_RE, " ").trim();
    const h = plain ? parseHeading(plain) : null;
    if (h) pending = h;
    else if (plain && pending && !pending.topic && !urls.length) pending = { ...pending, topic: clean(plain.replace(/^[(（«\-–—:\s]+|[)）»\s]+$/g, ""), 200) };   // the topic on its own line
    for (const u of urls) {
      const id = videoId(u.replace(/[.,;:!؟،]+$/, ""));
      if (!id || seen.has(id)) continue;
      seen.add(id); out.push(pending ? { id, n: pending.n, topic: pending.topic } : { id }); pending = null;
      if (out.length >= MAX_ITEMS) return out;
    }
  }
  return out;
}

/* ───────── metadata ───────── */
const HIJRI_IN_TITLE = /(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(14\d{2})/;
export function hijriInTitle(title) {
  const m = HIJRI_IN_TITLE.exec(digits(String(title ?? "")));
  if (!m) return "";
  const d = +m[1], mo = +m[2], y = +m[3];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= 30 && hijriToGregorian(y, mo, d) ? `${y}-${mo}-${d}` : "";
}
export const isoSeconds = iso => { const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(iso || "")); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0; };

/* fetcher is injectable for tests; env.YT_BASE (tests) replaces https://www.youtube.com / https://www.googleapis.com */
export async function fetchMeta(ids, env = {}, fetcher = fetch) {
  const yt = env.YT_BASE || "https://www.youtube.com", api = env.YT_API_BASE || "https://www.googleapis.com", meta = {};
  await Promise.all(ids.map(async id => {
    try {
      const r = await fetcher(`${yt}/oembed?url=${encodeURIComponent("https://www.youtube.com/watch?v=" + id)}&format=json`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) { meta[id] = { err: r.status === 404 || r.status === 401 ? "غير موجود أو خاص" : "تعذّر الجلب" }; return; }
      const j = await r.json();
      meta[id] = { title: clean(j.title, 300), author: clean(j.author_name, 120) };
    } catch { meta[id] = { err: "تعذّر الجلب" }; }
  }));
  if (env.YOUTUBE_API_KEY && ids.length) {                       // optional: duration + upload day for the whole batch in one call
    try {
      const r = await fetcher(`${api}/youtube/v3/videos?part=contentDetails,snippet&id=${ids.join(",")}&key=${encodeURIComponent(env.YOUTUBE_API_KEY)}`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) for (const v of (await r.json()).items || []) {
        const m = meta[v.id] || (meta[v.id] = {});
        m.duration = isoSeconds(v.contentDetails && v.contentDetails.duration);
        if (v.snippet) { m.day = String(v.snippet.publishedAt || "").slice(0, 10); if (!m.title) m.title = clean(v.snippet.title, 300); if (!m.author) m.author = clean(v.snippet.channelTitle, 120); }
      }
    } catch { /* the duration stays empty; the editor can type it */ }
  }
  return meta;
}

/* ───────── pages ───────── */
export function youtubePage(user, flash) {
  const body = `<p class="muted">الصق روابط يوتيوب لدروس الشيخ (رابط في كل سطر، أو نصًّا فيه أسطر مثل «المجلس الأول (موضوعه)» يليها الرابط). لا يُنزَّل شيء من يوتيوب: يُقرأ العنوان فقط ويُعرض الدرس بمشغّل يوتيوب. بعد المراجعة تُضاف الدروس كتغييرات غير منشورة حتى تضغط «النشر».</p>
<form method="post" action="/youtube/preview"><p><label for="yt-text">الروابط أو النص</label><br><textarea id="yt-text" name="text" rows="12" class="wide" dir="auto" required maxlength="20000"></textarea></p>
<p><button>مراجعة الدروس</button></p></form>`;
  return layout({ title: "إضافة من يوتيوب", user, path: "/youtube", body, flash });
}

const secOpts = sel => SECTIONS.map(s => `<option value="${s}"${s === sel ? " selected" : ""}>${esc(SEC_AR[s])}</option>`).join("");
const minutes = s => s ? Math.round(s / 60) : "";

export async function previewPage(f, env, user, fetcher = fetch) {
  const text = String(f.get("text") ?? "").slice(0, 20000), items = parseInput(text);
  if (!items.length) return layout({ title: "إضافة من يوتيوب", user, path: "/youtube", body: `<p class="flash err">لم أجد أي رابط يوتيوب صالح في النص.</p><p><a href="/youtube">رجوع</a></p>`, flash: null });
  const db = env.DB, meta = await fetchMeta(items.map(i => i.id), env, fetcher);
  const have = new Set((await db.prepare(`SELECT id FROM lessons WHERE id IN (${items.map(() => "?").join(",")})`).bind(...items.map(i => i.id)).all()).results.map(r => r.id));
  const series = (await db.prepare("SELECT id, title FROM series ORDER BY sec, origin, pos").all()).results;
  const seed = String(f.get("series") ?? "");
  const rows = items.map(it => {
    const m = meta[it.id] || {}, exists = have.has(it.id), hd = hijriInTitle(m.title) || "";
    return `<tr><td><input type="checkbox" name="inc_${it.id}" value="1"${exists || m.err ? "" : " checked"}${exists ? " disabled" : ""} aria-label="إضافة هذا الدرس"><input type="hidden" name="ids" value="${it.id}"></td>
<td class="ltr"><a href="https://www.youtube.com/watch?v=${it.id}" target="_blank" rel="noopener noreferrer">${it.id}</a>${exists ? ` <span class="tag">موجود</span>` : ""}${m.err ? ` <span class="tag">${esc(m.err)}</span>` : ""}</td>
<td><input name="n_${it.id}" class="num" type="number" min="1" max="9999" value="${it.n ?? ""}" aria-label="الرقم"></td>
<td><input name="title_${it.id}" class="wide" maxlength="200" value="${esc(it.topic || m.title || "")}" aria-label="العنوان"><br><span class="muted">${esc(m.author || "")}${m.title && it.topic ? " · " + esc(m.title) : ""}</span></td>
<td><input name="hd_${it.id}" class="ltr" size="10" maxlength="10" value="${esc(hd)}" placeholder="1448-6-12" aria-label="التاريخ الهجري"></td>
<td><input name="dur_${it.id}" class="num" type="number" min="0" max="1440" value="${minutes(m.duration)}" aria-label="المدة بالدقائق"></td></tr>`;
  }).join("");
  const body = `<p class="muted">راجع كل درس: اجعل العنوان كما في المصدر، والرقم رقم المجلس، والتاريخ هجريًّا بالشكل <span class="ltr">1448-6-12</span> (يُستخرج تلقائيًّا إن كان في العنوان بصيغة 12-6-1448). ألغِ علامة ما لا تريده.</p>
<form method="post" action="/youtube/add"><fieldset><legend>السلسلة</legend>
<p><label><input type="radio" name="mode" value="existing"${seed ? " checked" : ""}> سلسلة موجودة</label> <select name="series" aria-label="السلسلة الموجودة"><option value="">— اختر —</option>${series.map(s => `<option value="${esc(s.id)}"${s.id === seed ? " selected" : ""}>${esc(s.title)}</option>`).join("")}</select></p>
<p><label><input type="radio" name="mode" value="new"${seed ? "" : " checked"}> سلسلة جديدة</label></p>
<p><label>المعرّف (إنجليزي) <input name="new_id" class="ltr" size="24" maxlength="40" pattern="[a-z0-9][a-z0-9\\-]{1,39}" placeholder="tawheed-sama-1448"></label>
<label>القسم <select name="new_sec">${secOpts("duroos")}</select></label> <label>اسم الوحدة <input name="new_unit" size="8" maxlength="20" value="المجلس"></label></p>
<p><label>عنوان السلسلة<br><input name="new_title" class="wide" maxlength="150"></label></p>
<p><label>وصف قصير<br><textarea name="new_description" rows="2" maxlength="300" class="wide"></textarea></label></p>
<p><label><input type="checkbox" name="new_keep" value="1" checked> إظهار عنوان كل درس بجانب رقمه</label> <label><input type="checkbox" name="new_ordered" value="1" checked> دروس مرقّمة بالترتيب</label></p></fieldset>
<div class="scroll" tabindex="0" role="region" aria-label="الدروس المقترحة"><table><thead><tr><th>إضافة</th><th>الفيديو</th><th>الرقم</th><th>العنوان</th><th>التاريخ الهجري</th><th>المدة (دقيقة)</th></tr></thead><tbody>${rows}</tbody></table></div>
<p><label>الحالة <select name="status"><option value="published">منشور (يظهر بعد «النشر»)</option><option value="draft">مسودة</option></select></label></p>
<p><label><input type="checkbox" name="confirm" value="1" required> أؤكد أن هذه الدروس من دروس الشيخ وأنها مرفوعة على قناة معتمدة.</label></p>
<p><button>إضافة الدروس المحددة</button> <a href="/youtube">رجوع</a></p></form>`;
  return layout({ title: "مراجعة الدروس", user, path: "/youtube", body, flash: null });
}

/* ───────── the write ───────── */
export async function addYoutube(f, env, user, redirect) {
  const db = env.DB, bad = (code = "invalid") => redirect("/youtube", code, "err");
  if (!f.get("confirm")) return bad();
  const ids = [...new Set(f.getAll("ids").map(String))].filter(i => ID.test(i)).slice(0, MAX_ITEMS);
  const picked = ids.filter(i => f.get("inc_" + i));
  if (!picked.length) return bad("yt_none");
  let sid = clean(f.get("series"), 60), newSeries = null;
  if (f.get("mode") === "new") {
    const id = clean(f.get("new_id"), 40).toLowerCase(), title = clean(f.get("new_title"), 150), sec = clean(f.get("new_sec"), 12);
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(id) || !title || !SECTIONS.includes(sec)) return bad();
    if (await db.prepare("SELECT 1 FROM series WHERE id = ?").bind(id).first()) return bad("series_exists");
    const description = clean(f.get("new_description"), 300), unit = clean(f.get("new_unit"), 20) || "الدرس";
    newSeries = { id, title, sec, ...(description ? { description } : {}), unit, ordered: f.get("new_ordered") ? true : false, ...(f.get("new_keep") ? { keepTitle: true } : {}) };
    sid = id;
  } else if (!await db.prepare("SELECT 1 FROM series WHERE id = ?").bind(sid).first()) return bad();
  const status = f.get("status") === "draft" ? "draft" : "published";
  const have = new Set((await db.prepare(`SELECT id FROM lessons WHERE id IN (${picked.map(() => "?").join(",")})`).bind(...picked).all()).results.map(r => r.id));
  const rows = [];
  for (const id of picked) {
    if (have.has(id)) continue;                                                                   // never overwrite or duplicate an existing lesson
    const nRaw = String(f.get("n_" + id) ?? "").trim(), n = nRaw === "" ? null : Number(nRaw);
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 9999)) return bad();
    const title = clean(f.get("title_" + id), 200);
    if (!title) return bad();
    const d = { id, title, series: sid, kind: "video" };
    if (n !== null) d.n = n;
    const hdRaw = String(f.get("hd_" + id) ?? "").trim();
    if (hdRaw) {
      const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(hdRaw), date = m && +m[1] >= 1300 && +m[1] <= 1600 ? hijriToGregorian(+m[1], +m[2], +m[3]) : "";
      if (!date) return bad("bad_date");
      d.hd = `${+m[1]}-${+m[2]}-${+m[3]}`; d.date = date;
    }
    const mins = String(f.get("dur_" + id) ?? "").trim();
    if (mins !== "") { const v = Number(mins); if (!Number.isInteger(v) || v < 0 || v > 1440) return bad(); if (v) d.duration = v * 60; }
    rows.push(d);
  }
  if (!rows.length) return bad("yt_none");
  const base = (await db.prepare("SELECT COALESCE(MAX(pos), -1) + 1 AS p FROM lessons WHERE origin = 'library'").first()).p;
  const stmts = [];
  if (newSeries) {
    const spos = (await db.prepare("SELECT COALESCE(MAX(pos), -1) + 1 AS p FROM series WHERE origin = 'library'").first()).p;
    stmts.push(db.prepare("INSERT INTO series (id, origin, pos, sec, title, status, data) VALUES (?,?,?,?,?,?,?)").bind(newSeries.id, "library", spos, newSeries.sec, newSeries.title, "published", JSON.stringify(newSeries)));
    stmts.push(auditStmt(db, user.email, "series.add", "series", newSeries.id, null, newSeries));
  }
  rows.forEach((d, i) => {
    stmts.push(db.prepare("INSERT INTO lessons (id, origin, pos, series_id, kind, n, section, status, data) VALUES (?,?,?,?,?,?,?,?,?)").bind(d.id, "library", base + i, sid, "video", d.n ?? null, null, status, JSON.stringify(d)));
    stmts.push(auditStmt(db, user.email, "lesson.add", "lesson", d.id, null, { series: sid, n: d.n ?? null, status, title: d.title, source: "youtube" }));
  });
  await db.batch(stmts);
  return redirect(`/series/${encodeURIComponent(sid)}`, "yt_added", "ok");
}
