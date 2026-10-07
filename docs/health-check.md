# Health check

Two free layers; neither needs a server of ours.

## 1. Is the site up? (outside monitor, a few minutes' setup)

Use one uptime service; it pings from outside Cloudflare and alerts by email or phone. Either works:

- **Better Stack** (free: 10 monitors, 3-minute checks, one status page; no commercial-use restriction) — recommended.
- **UptimeRobot** (free: 50 monitors, 5-minute checks; its free plan is limited to personal, non-commercial use).

Create these monitors (HTTP, keyword type where noted):

| Monitor | URL | Alert if |
|---|---|---|
| Home | `https://drwasiullah.com/` | down, or the keyword `وصي الله` is missing |
| Sitemap | `https://drwasiullah.com/sitemap.xml` | down, or `<urlset` is missing |
| An audio file | `https://media.drwasiullah.com/audio/f89d25796bd0c3c8.mp3` | down (this is lesson Tadrib 2; any mirrored file works) |
| `www` | `https://www.drwasiullah.com/` | down |

Turn on the alert by email, and by the service's Telegram or phone-app notification if you want a message on your phone. Also turn on its SSL-certificate expiry alert if it offers one.

## 2. Is the content healthy? (GitHub Action, already in the repo)

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
| Home or sitemap down | Cloudflare dashboard → Workers & Pages → the site → latest build. Fallback deploy: `git pull && npx wrangler deploy` |
| Media file down, or "no CORS header" | purge the Cloudflare cache (Caching → Purge Everything), then check R2 → `drwasiullah-media` → CORS policy |
| YouTube video missing | the lesson was deleted or made private on YouTube; the daily sync marks it `REMOVED` and drops it on its next run |
| Page content wrong | the last commit to `main`: `git log -5`, then revert it if needed |
