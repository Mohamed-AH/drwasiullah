# Health check

Two free layers; neither needs a server of ours. Layer 1 is checked from outside by UptimeRobot, layer 2 by GitHub.

## 1. The `/health` route (for UptimeRobot or any uptime monitor)

`https://drwasiullah.com/health` is answered by a small Cloudflare Worker (`worker/index.js`; every other address is still served by the static site). It runs four checks and returns JSON:

```json
{"status":"ok","time":"2026-10-07T13:27:43Z","checks":{"home":{"ok":true,"detail":"200"},"sitemap":{"ok":true,"detail":"3333 addresses"},"media":{"ok":true,"detail":"206, CORS ok"},"www":{"ok":true,"detail":"301 -> https://drwasiullah.com/"}}}
```

| Check | Passes when |
|---|---|
| `home` | the home page is served and contains the Sheikh's name |
| `sitemap` | `sitemap.xml` is served and lists at least 2,000 addresses |
| `media` | an audio file on `media.drwasiullah.com` answers a ranged request **and** allows the site's origin (CORS; this is what a stale cache or a lost bucket policy breaks) |
| `www` | `www.drwasiullah.com` still answers (200, or a redirect to the main address) |

The HTTP status is **200 when everything passes and 503 when any check fails**, so even a plain "HTTP 200" monitor is enough; the body says which check failed and why. Results are kept for 30 seconds, so frequent monitoring does not hammer the sources. The route costs nothing (the Workers free plan allows 100,000 requests a day; a 5-minute monitor uses 288).

**In UptimeRobot** (you already have an account): Add New Monitor →
1. Monitor type **HTTP(s)**, URL `https://drwasiullah.com/health`, interval 5 minutes. Alerts fire on any non-200.
2. Optional, more precise: a second monitor of type **Keyword**, same URL, keyword `"status":"ok"`, alert when the keyword does **not** exist. (Keep both: the first catches the site being down, the second the checks failing.)
3. Choose your alert contacts (email, or Telegram / the mobile app).

Open the address in a browser to see the details whenever an alert arrives.

Not covered by `/health` (the Action below does these): data counts, random media files, YouTube videos.

## 2. Deeper content checks (GitHub Action, already in the repo)

`.github/workflows/health.yml` runs `tools/health_check.py` every 6 hours (and on demand: Actions → Health check → Run workflow). It checks that:

- the main pages answer 200 with the expected text, an unknown address gives 404, and the Content-Security-Policy header is sent;
- `sitemap.xml` lists about 3,300 addresses, and `library.json` / `catalogue.json` parse and hold a sane number of lessons;
- 6 random audio files and 2 PDFs on `media.drwasiullah.com` answer a ranged request **and** carry the CORS header the download button needs (a stale cached copy would fail here: purge the Cloudflare cache, see [mirror-setup.md](mirror-setup.md));
- 3 random video lessons still exist on YouTube.

A problem turns the run red and GitHub emails you. Make sure that is on: GitHub → Settings → Notifications → Actions → "Send notifications for failed workflows only" (email). Run it by hand once: `python tools/health_check.py` (needs Python 3 only).

It is a smoke test with small samples, not a link audit. For all files run `python tools/check_links.py` now and then (it skips nothing, and archive.org may be slow).

## 3. Things worth switching on in Cloudflare and Namecheap

- Cloudflare dashboard → Notifications: turn on the alerts offered for your plan (for example for failed builds of the site and for the domain's certificates).
- Namecheap: keep **auto-renew** on for `drwasiullah.com` and make sure the account email is one you read. A lapsed domain is the one failure none of the checks above can survive.

## When an alert fires

| Alert | First thing to look at |
|---|---|
| `/health` not answering, or `home` / `sitemap` failing | Cloudflare dashboard → Workers & Pages → the site → latest build. Fallback deploy: `git pull && npx wrangler deploy` |
| `media` failing, or "no CORS header" | purge the Cloudflare cache (Caching → Purge Everything), then check R2 → `drwasiullah-media` → CORS policy |
| YouTube video missing | the lesson was deleted or made private on YouTube; the daily sync marks it `REMOVED` and drops it on its next run |
| Page content wrong | the last commit to `main`: `git log -5`, then revert it if needed |
