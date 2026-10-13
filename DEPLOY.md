# Hosting & domain guide (Cloudflare only)

The site source is in `site/`; `node scripts/build.mjs` pre-renders it into `dist/` (≈ 2,000 real HTML pages + sitemap + 404).
It is served by a **Cloudflare Worker with static assets** (`wrangler.jsonc` → `"build.command": "node scripts/build.mjs"`, `"directory": "./dist"`), the code lives in this public GitHub repo, and the domain
`drwasiullah.com` is registered at **Namecheap** with its DNS on **Cloudflare**.

## How a change goes live
Merge to `main` → Cloudflare runs `npx wrangler deploy`, which first runs the build command from `wrangler.jsonc`
(leave the dashboard's *Build command* **empty**; check the log shows `built 2008 pages …`) → live in a minute or two. Work happens on a feature branch and reaches `main` through a pull request.

## Set up (one-time, already done)
1. **Cloudflare → Workers & Pages → Create → Import a repository** → this repo (production branch `main`),
   project name `drwasiullah`. **Build command: empty.** Deploy command: `npx wrangler deploy`.
   (Without `wrangler.jsonc` Cloudflare guesses "Hugo" and fails with `npx hugo … could not determine executable`.)
   Node ≥ 18 is needed for the build; Cloudflare's default is fine.
2. **Domain:** the domain stays registered at Namecheap; only its *nameservers* point to Cloudflare.
   - Cloudflare → **Add a domain** `drwasiullah.com` (Free plan); delete Namecheap's parking records
     (`A`/`CNAME` for `@` and `www`). Keep the MX/TXT records if Namecheap *Email Forwarding* is used.
   - Namecheap → **Domain List → Manage → Nameservers → Custom DNS** → the two Cloudflare nameservers
     (turn DNSSEC off first if it was on). Wait until Cloudflare shows the domain **Active**.
   - **Workers & Pages → drwasiullah → Settings → Domains & Routes → Add → Custom domain**: `drwasiullah.com`
     and `www.drwasiullah.com` (DNS records + HTTPS certificate are created automatically).
   - *(Recommended)* **Rules → Redirect Rules**: `www.drwasiullah.com` → `https://drwasiullah.com{path}` (301);
     **SSL/TLS → Edge Certificates → Always Use HTTPS: On**.

## Housekeeping checklist
- [ ] Delete the old **Netlify** site (Netlify dashboard → Site settings → Delete site) and any unused GitHub Pages setting
      (repo Settings → Pages → Source: *None*). Their config files are no longer in the repo.
- [ ] 2-factor authentication on GitHub, Cloudflare and Namecheap; auto-renew and WHOIS privacy on at Namecheap.
- [ ] Cloudflare: enable **DNSSEC** (then paste the DS record at Namecheap), free **Web Analytics** (cookie-less),
      a billing *usage notification* (R2 storage is shared with the other project, see ROADMAP §3).
- [ ] GitHub: secret scanning + Dependabot; branch protection on `main` only with a bypass for GitHub Actions (Publish and the daily sync commit directly to `main`).

## Headers
`site/_headers` (applied by Cloudflare) sets caching, `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`, HSTS and a **Content-Security-Policy, enforced** since 2026-10-03. If the live site ever breaks
because of it, rename the header to `Content-Security-Policy-Report-Only` in `site/_headers` to diagnose.

## The admin portal and the other Workers
- **Admin portal** (`admin.drwasiullah.com`): a separate Worker, deployed by hand: `npx wrangler deploy -c admin/wrangler.jsonc` (after `git pull`). Setup and checklist: [docs/admin-setup.md](docs/admin-setup.md); daily use: [docs/admin-manual.md](docs/admin-manual.md).
- **Public Worker** (`worker/index.js`: `/health`, `/api/event`, `/api/live`) ships with the site's normal deploy.
- **Database changes** (new migrations) are applied by hand: `npx wrangler d1 migrations apply drwasiullah --remote`.
- **Publish** (the portal's button) and the daily YouTube sync commit straight to `main`; if you add branch protection, allow GitHub Actions to bypass it.

## Other places the site could run
Any static host could serve `dist/` (real paths, pre-rendered), but the portal, counters and live banners need Cloudflare Workers + D1. Cloudflare is the chosen one; don't keep a
second live copy — it splits search-engine ranking and confuses visitors.
