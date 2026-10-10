# Admin portal — setup (phase 2)

The portal is a separate Cloudflare Worker (`admin/`) at **https://admin.drwasiullah.com**. Two locks, both must open:
1. **Cloudflare Access** (login with Google or an emailed one-time code) — only emails on the Access policy reach the Worker at all.
2. **The Worker itself** checks Access's signed token again, then looks the email up in the `users` table (role Admin or Editor). An email that passed Access but is not in the table sees "لا تملك صلاحية".

So a new team member must be added in **both** places: the Access policy (step 1 below) and the portal's «المستخدمون» page.

What this phase contains: login, roles, audit log (every user change is recorded with who/when/before/after), read-only browsing of series, lessons and books, and user management (Admin only). Uploading and editing content comes in phases 3–4. Editors see the content pages only; Admins also see «المستخدمون» and «السجل».

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
