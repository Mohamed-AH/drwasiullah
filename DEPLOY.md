# Hosting & domain guide

The site is plain static files in `site/` (no build step). It works from any sub-path
(`https://user.github.io/drwasiullah/`) or from a root domain, so it can be hosted anywhere.

## Option A — GitHub Pages (free, no badge)

1. **Merge your work into `main`** (Pages deploys from `main`): open
   `https://github.com/Mohamed-AH/drwasiullah/compare/main...claude/hopeful-bell-dnbv3h`, click
   *Create pull request*, then *Merge pull request*.
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
   (The workflow `.github/workflows/pages.yml` is already in the repo.)
3. Open the **Actions** tab → *Deploy site to GitHub Pages* → wait for the green tick
   (re-run with *Run workflow* if it didn't start).
4. Your site is live at **https://mohamed-ah.github.io/drwasiullah/**.
5. Every later merge/push to `main` redeploys automatically.

Notes: the free GitHub plan needs a **public** repository for Pages. If the repo must stay private,
use Cloudflare Pages (Option C) instead. Delete `wasiwordpress.rar` from the repo if you don't need it.

## Buying a .com

- Registrars: **Cloudflare Registrar** (sells at cost, no renewal markup, free WHOIS privacy),
  **Porkbun**, **Namecheap**. A .com is roughly US$10–16 per year — check the renewal price, not just
  the first-year price. Avoid add-ons (hosting, email, "site builder") you don't need.
- Choose a name that is short, easy to spell in Latin letters, and easy to say aloud, e.g.
  `wasiullahabbas.com`, `drwasiullah.com`, `sheikhwasiullah.com`, `wasiullah-abbas.com`.
  Check availability on the registrar's search box. Turn **auto-renew ON** and use an email you will keep.
- Turn on **WHOIS privacy** (free at Cloudflare/Porkbun/Namecheap) so your personal details aren't public.

## Connect the domain

You will add DNS records at the place where the domain's DNS is managed (the registrar, or Cloudflare).
Replace `example.com` with your domain. DNS changes can take from minutes up to a few hours.

### GitHub Pages
1. DNS records:
   | Type | Name | Value |
   |---|---|---|
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | AAAA (optional) | `@` | `2606:50c0:8000::153`, `…8001::153`, `…8002::153`, `…8003::153` |
   | CNAME | `www` | `mohamed-ah.github.io` |
2. Repo **Settings → Pages → Custom domain**: type `example.com` → Save (GitHub checks DNS).
3. When the check passes, tick **Enforce HTTPS** (the certificate can take up to ~1 hour).
   `www.example.com` redirects to the main domain automatically.

### Netlify
1. Site → **Domain management → Add a domain** → `example.com`.
2. Easiest: **Use Netlify DNS** and change the domain's *nameservers* at the registrar to the four Netlify
   shows you. Or keep your DNS and add: `A @ → 75.2.60.5` and `CNAME www → <your-site>.netlify.app`
   (use the exact values Netlify displays).
3. HTTPS is issued automatically (**Domain management → HTTPS → Verify DNS / Provision certificate**).

### Cloudflare (free, fast, no badge)
The repo contains `wrangler.jsonc`, which tells Cloudflare to publish the `site/` folder with **no build**.
1. Cloudflare dashboard → **Workers & Pages → Create → Import a repository** → pick this repo
   (production branch: `main` — merge your PR first).
2. Project name `drwasiullah`; **Build command: leave empty**; **Deploy command: `npx wrangler deploy`**.
   (Without `wrangler.jsonc` Cloudflare guesses "Hugo" and fails with `npx hugo … could not determine executable`.)
3. Project → **Settings → Domains & Routes → Add → Custom domain**. If the domain is registered/managed at
   Cloudflare the DNS records are added for you in one click.

### drwasiullah.com bought at Namecheap → Cloudflare Worker
The domain stays registered at Namecheap; only its **nameservers** move to Cloudflare (a Worker can only
serve a custom domain whose DNS is on Cloudflare).
1. **Cloudflare → Add a domain** (*Websites → Add a site*): enter `drwasiullah.com`, pick the **Free** plan.
   Delete the old Namecheap parking records it imports (`A`/`CNAME` for `@` and `www`, any URL-redirect record).
   Cloudflare then shows **two nameservers** (`xxx.ns.cloudflare.com`).
2. **Namecheap → Domain List → Manage → Nameservers**: choose **Custom DNS**, paste the two Cloudflare
   nameservers, click the green ✓. (If DNSSEC is on in Namecheap's *Advanced DNS*, switch it off first.)
3. Back in Cloudflare click **Check nameservers**; wait until the domain shows **Active** (minutes to a few hours).
4. **Workers & Pages → drwasiullah → Settings → Domains & Routes → Add → Custom domain**: add
   `drwasiullah.com`, then add `www.drwasiullah.com`. DNS records and the HTTPS certificate are created for you.
5. *(Recommended)* send `www` to the bare domain: **Rules → Redirect Rules → Create rule** — if hostname equals
   `www.drwasiullah.com` → Dynamic redirect `concat("https://drwasiullah.com", http.request.uri.path)`, 301.
6. **SSL/TLS → Edge Certificates → Always Use HTTPS: On.**
7. Test `https://drwasiullah.com` in a private window. If you also use Namecheap email on this domain,
   re-create its MX records in Cloudflare DNS.

## About the "Netlify" badge
A plain Netlify site has no badge on its pages. A banner/badge usually means the site is an
**unclaimed Netlify Drop** (log in and claim it) or a *deploy preview*. GitHub Pages and Cloudflare Pages
add nothing to your pages.
