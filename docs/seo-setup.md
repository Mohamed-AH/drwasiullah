# Search Console & search-engine setup (owner steps)

The site now has **real URLs** (`/series/…`, `/lesson/…`), pre-rendered HTML, per-page titles/descriptions, Open Graph tags,
structured data (JSON-LD), `sitemap.xml` and `robots.txt`. What remains must be done by the domain owner, once, after the new
build is live on https://drwasiullah.com.

## 1. Check the basics (5 minutes)
- https://drwasiullah.com/robots.txt shows `Allow: /` and a `Sitemap:` line.
- https://drwasiullah.com/sitemap.xml lists ≈ 2,000 URLs.
- Open any lesson page → *View page source*: you should see the title, `<link rel="canonical">`, and the lesson content (not an empty page).
- Old links such as `https://drwasiullah.com/#/watch/…` redirect to the new addresses.

## 2. Google Search Console (free)
1. Go to https://search.google.com/search-console and sign in with the Google account that should own the site.
2. **Add property → Domain** → `drwasiullah.com` (the *Domain* option, not "URL prefix": it covers www, http/https and every path).
3. Google shows a **TXT record** (`google-site-verification=…`). Add it in **Cloudflare → drwasiullah.com → DNS → Records → Add record**:
   Type `TXT`, Name `@`, Content = the value Google shows, TTL Auto. Click **Verify** in Search Console (can take a few minutes).
4. **Sitemaps** (left menu) → enter `sitemap.xml` → Submit. Status should become *Success* with ≈ 2,000 discovered URLs.
5. **URL inspection** (top bar): paste `https://drwasiullah.com/` → *Request indexing*. Repeat for 5–10 key pages
   (e.g. `/series/muslim/`, `/series/ibn-majah/`, `/books/`).
6. Add a second owner/user (Settings → Users and permissions) so the property is not tied to one person.

## 3. Bing Webmaster Tools (free; also feeds DuckDuckGo/Yahoo)
https://www.bing.com/webmasters → **Import from Google Search Console** (one click) → submit the same sitemap.

## 4. What to expect and watch
- Indexing is gradual: first pages in days, the bulk of ≈ 2,000 pages over **4–8 weeks**. Don't resubmit repeatedly.
- **Pages** report: look for "Crawled – currently not indexed" (normal for some of the near-identical lesson pages at first),
  "Duplicate without user-selected canonical" (should be 0) and "Not found (404)" (should be only old junk).
- **Performance → Queries**: which Arabic searches bring visitors (e.g. «شرح صحيح مسلم وصي الله عباس»).
- **Core Web Vitals** (appears after enough visits): aim for all "Good".
- Search results show the page `<title>` and description set per page; Arabic titles are used as-is.

## 5. Things that help ranking (later)
- Real descriptions/summaries per series and lesson (from the Sheikh's team), transcripts (see ROADMAP backlog), links to the site from the Sheikh's
  other sites/channels (YouTube channel description, WordPress blog, social profiles) — these are the strongest signals for a new domain.
- Keep URLs stable: never rename `/series/…` or `/lesson/…` ids (a change loses the indexed page).

## Target queries (added 2026-10-03)
We want to rank for **«دروس الشيخ وصي الله عباس»** and **«الموقع الرسمي للشيخ وصي الله عباس»**. On-page work is done (home `<title>`, description, visible intro sentence,
header subtitle, JSON-LD `alternateName` for WebSite and Person). What only the owner can do, in order of impact:
1. Search Console: verify the domain, submit `sitemap.xml`, then «URL inspection → Request indexing» for `/`, `/about/`, and the main series pages.
2. **Links from the Sheikh's other official pages** (YouTube channel «حول»/links, the wasiullahabbas.wordpress.com site, Telegram/Mixlr/social bios) pointing to https://drwasiullah.com — this is the strongest signal for "official site". Ask the WordPress site to link here and say "الموقع الرسمي".
3. Use the same exact name spelling everywhere (the full name + «وصي الله عباس»). Add the bio page (`docs/bio-spec.md`): «عن الشيخ» is what Google uses to connect the person with the site.
4. Give it weeks: a new domain needs time; check Search Console → Performance for these two queries.
Note: «الموقع الرسمي» is shown on the site; confirm the Sheikh's team agrees to that wording (it is a claim of official status).
