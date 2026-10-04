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

## Target queries (updated 2026-10-03)
Target **«دروس الشيخ وصي الله عباس»** — on-page done (home title/description, header subtitle, JSON-LD `alternateName`).
**«الموقع الرسمي»** is in use since 2026-10-04: the Sheikh's team asked for it (name text in CLAUDE.md, *Wording*). It appears in the home title/description/hero, the header subtitle, every page title suffix, `og:site_name` and the WebSite JSON-LD (`alternateName` includes «الموقع الرسمي للشيخ وصي الله عباس»).
Owner actions: Search Console (verify, submit sitemap, request indexing); links to drwasiullah.com from the Sheikh's YouTube channel/WordPress/social profiles; the bio page; consistent name spelling; allow weeks.
