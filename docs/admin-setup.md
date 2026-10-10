# Admin portal — setup (phase 2)

The portal is a separate Cloudflare Worker (`admin/`) at **https://admin.drwasiullah.com**. Two locks, both must open:
1. **Cloudflare Access** (login with Google or an emailed one-time code) — only emails on the Access policy reach the Worker at all.
2. **The Worker itself** checks Access's signed token again, then looks the email up in the `users` table (role Admin or Editor). An email that passed Access but is not in the table sees "لا تملك صلاحية".

So a new team member must be added in **both** places: the Access policy (step 1 below) and the portal's «المستخدمون» page.

What the portal contains now: login, roles, audit log (every change is recorded with who/when/before/after), browsing of series, lessons and books, user management (Admin only), and the **audio upload workflow** (phase 3): «رفع درس» (drag files into an existing series, numbers continue automatically, Hijri date, upload straight to R2, save), «سلسلة جديدة», hide/show per lesson, and «النشر» (Publish). Editing titles, books, standalone items and so on come in phase 4. Editors see the content pages only; Admins also see «المستخدمون» and «السجل».

## Owner steps (once)
Menu names in the Cloudflare dashboard move around; the words in **bold** are what to look for.

1. **Create the Access application.** Cloudflare dashboard → **Zero Trust** → **Access controls** → **Applications** → **Add an application** → **Self-hosted**.
   - Name: `Admin portal` · Session duration: 24 hours (or shorter).
   - Application domain: `admin.drwasiullah.com` (leave the path empty).
   - Policy: name `Team`, action **Allow**, rule **Include → Emails** → add each team member's email.
   - Login methods: tick **One-time PIN** (works at once, nothing to configure). To also offer **Google**, first add it: Zero Trust → **Settings** → **Authentication** → **Login methods** → **Add new** → Google. It asks for a Client ID and secret: in Google Cloud Console → APIs & Services → **Credentials** → Create credentials → **OAuth client ID** → type *Web application*, authorised redirect URI `https://<your-team-domain>/cdn-cgi/access/callback` (the team domain is on the Zero Trust **Settings** page, like `xxxx.cloudflareaccess.com`). Paste the ID and secret back into Cloudflare.
   - Save, then open the application and copy its **Application Audience (AUD) Tag**.
2. **Send Claude two values** (they are not secrets): the **team domain** (`xxxx.cloudflareaccess.com`) and the **AUD tag**. They go into `admin/wrangler.jsonc` (`ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`). Until they are filled the portal answers every request with "غير مُهيّأ" (safe by default).
3. **Deploy the Worker** (Git Bash, repo folder, after merging): `npx wrangler deploy -c admin/wrangler.jsonc`. This also creates the DNS record for `admin.drwasiullah.com`. Repeat this command after every change under `admin/`. (The public site's own deploy is separate and unchanged.)
4. **Create the first Admin** (put your real email; it is deliberately not stored in the repo, which is public):
   ```
   npx wrangler d1 execute drwasiullah --remote --command "insert into users (email, role, name) values ('YOUR@EMAIL', 'admin', 'Your name')"
   ```
5. Open https://admin.drwasiullah.com, log in, and add the others from «المستخدمون».

## Tests (no Cloudflare needed)
- `node --no-warnings tests/admin_auth.mjs` — the Access token check (accepts a good token, refuses expired, wrong audience/issuer, forged, `alg: none`, …).
- `tests/admin_http.mjs` — the whole portal against a local dev server; the setup commands are at the top of the file.
Run both after touching `admin/`.

## Security notes
- The Worker has **no `workers.dev` address** and refuses requests without a valid Access token; the local-development shortcut (`x-dev-email`) only works when the variable `ENV=dev` is passed on the command line and is not in `wrangler.jsonc`.
- Pages are plain HTML forms with a strict CSP (no scripts at all), POSTs are accepted from the same origin only, all text is escaped, nothing from the portal is public.
- The `users` and `audit_log` tables never leave D1 (the nightly git backup excludes them). D1 Time Travel can restore them for 7 days.

## Audio upload and Publish (phase 3) — one-time setup
Uploads need no extra keys: the Worker is bound to the R2 bucket `drwasiullah-media` directly (`MEDIA` in `admin/wrangler.jsonc`), so redeploying `npx wrangler deploy -c admin/wrangler.jsonc` is enough for «رفع درس».

**Publish** (the «نشر الآن» button) asks GitHub to run `.github/workflows/publish.yml`, which exports the published rows from D1 into `site/data/library.json`, checks the site builds and commits to `main`; Cloudflare then deploys (about 2 minutes). It needs:
1. The repository secrets `CLOUDFLARE_API_TOKEN` (permission D1 **Edit**) and `CLOUDFLARE_ACCOUNT_ID` — already set for the backup.
2. A GitHub token for the portal: GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate. Resource owner: your account · Repository access: **Only select repositories → drwasiullah** · Permissions → Repository permissions → **Actions: Read and write** (nothing else) · pick an expiry (you will have to renew it; the portal then says «تعذّر طلب النشر»).
3. Give the token to the Worker (it is a secret, never put it in a file): `npx wrangler secret put GH_DISPATCH_TOKEN -c admin/wrangler.jsonc` and paste it.
The workflow file must be on `main` for the button to work (merge the branch first).

**Important — who owns `site/data/library.json` from now on:** the database. Every Publish overwrites that file with the export of D1, so do **not** edit it by hand or re-run `import_wordpress.py` any more (change the data in the portal instead). The YouTube catalogue (`catalogue.json`) is still written by the daily sync and is not touched. `site/data/media.json` (mirror manifest) is unchanged.

**What an Editor does to add a lecture:** «رفع درس» → choose the series (the next number is filled in) → drop the files → check number, title and Hijri date → «رفع وحفظ» → «النشر». Lessons saved as «مسودة» or hidden are kept but not shipped. A hidden/draft series hides all its lessons, and a series appears on the site only when it has at least one published lesson.

Tests: `tests/admin_run_all.sh` runs the token, HTTP and browser-upload tests on a throw-away local setup (needs ffmpeg and Playwright).

## Usage counters (phase 3b)
The public site counts, anonymously, three things per lesson and day: **plays** (audio: 30 seconds really listened, seeking forward does not count; once per page), **downloads** (the «تحميل» button) and **watches** (the video play button). Nothing about the visitor is stored (no cookie, no IP, no identifier), nothing is sent for visitors with Do Not Track / Global Privacy Control, and the counters live in the D1 table `stats_daily` (never in git). Page views are already measured by Cloudflare Web Analytics.

One-time setup after merging: create the table with `npx wrangler d1 migrations apply drwasiullah --remote` (answer `y`), then redeploy the **public site** as usual (merge to `main`; the public Worker now also answers `POST /api/event`) and the admin Worker (`npx wrangler deploy -c admin/wrangler.jsonc`). Admins see the numbers under «الإحصاءات» (top lessons, per series, last 14 days).
Free-tier note: one counted event = one D1 row written (limit 100,000 a day); if traffic ever exceeded that, counting would silently stop for the rest of the day and the site itself would be unaffected.
Test: `tests/analytics_run.sh`.
