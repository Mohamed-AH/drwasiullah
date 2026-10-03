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
- [ ] GitHub: branch protection on `main` (require a pull request), secret scanning + Dependabot.

## Headers
`site/_headers` (applied by Cloudflare) sets caching, `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`, HSTS and a Content-Security-Policy in **report-only** mode — check the browser console on the
live site, then change `Content-Security-Policy-Report-Only` to `Content-Security-Policy` to enforce it.

## Other places the site could run
Any static host works (the site uses relative paths and hash routing). Cloudflare is the chosen one; don't keep a
second live copy — it splits search-engine ranking and confuses visitors.
