#!/usr/bin/env node
/* Warns before credentials expire, so a failed Publish or backup is never the first sign.
     node scripts/expiry_watch.mjs [--days 14]
   Checks (environment variables):
     CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_ACCOUNT_ID)  the token used by the backup and Publish Actions: expiry date from Cloudflare's verify endpoint, and that it still works
     GH_TOKEN_EXPIRES  (repository variable, YYYY-MM-DD)  the expiry of the portal's fine-grained GitHub token (that token lives in the portal Worker, which cannot be asked; you set this date when you create the token)
   Exit 1 when something is expired, expires within --days, or no longer works. A token with no expiry date is fine. A missing setting is only a warning. */
import { fileURLToPath } from "node:url";

export const daysLeft = (iso, now = Date.now()) => Math.floor((Date.parse(iso) - now) / 86400e3);

export async function cloudflare(token, account, fetcher = fetch) {
  const urls = ["https://api.cloudflare.com/client/v4/user/tokens/verify", ...(account ? [`https://api.cloudflare.com/client/v4/accounts/${account}/tokens/verify`] : [])];
  let last = "no answer";
  for (const u of urls) {
    try {
      const r = await fetcher(u, { headers: { authorization: `Bearer ${token}` } });
      const j = await r.json().catch(() => null);
      if (r.ok && j && j.success && j.result && j.result.status === "active") return { ok: true, expires: j.result.expires_on || null };
      last = j && j.result ? `status ${j.result.status}` : `HTTP ${r.status}`;
    } catch (e) { last = String(e.message || e); }
  }
  return { ok: false, detail: last };
}

export async function run(env, days = 14, now = Date.now(), fetcher = fetch) {
  const lines = [], problems = [], warnings = [];
  const check = (name, iso) => {
    if (!iso) { lines.push(`${name}: no expiry date`); return; }
    const d = daysLeft(iso, now);
    lines.push(`${name}: expires ${iso.slice(0, 10)} (${d} days)`);
    if (d < 0) problems.push(`${name} EXPIRED on ${iso.slice(0, 10)}`);
    else if (d <= days) problems.push(`${name} expires in ${d} day(s) (${iso.slice(0, 10)}): renew it now (docs/backup-plan.md, "Renewing a token")`);
  };
  if (env.CLOUDFLARE_API_TOKEN) {
    const r = await cloudflare(env.CLOUDFLARE_API_TOKEN, env.CLOUDFLARE_ACCOUNT_ID, fetcher);
    if (!r.ok) problems.push(`Cloudflare API token does not work (${r.detail}): the nightly backup and Publish will fail`);
    else check("Cloudflare API token", r.expires);
  } else warnings.push("CLOUDFLARE_API_TOKEN is not available: cannot check it");
  if (env.GH_TOKEN_EXPIRES) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(env.GH_TOKEN_EXPIRES)) problems.push("repository variable GH_TOKEN_EXPIRES must look like 2027-01-31");
    else check("Portal GitHub token (Publish)", env.GH_TOKEN_EXPIRES + "T23:59:59Z");
  } else warnings.push("repository variable GH_TOKEN_EXPIRES is not set: set it to the expiry date of the portal's GitHub token (Settings > Secrets and variables > Actions > Variables), or Publish will stop working without warning");
  return { lines, problems, warnings };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), days = a.includes("--days") ? Number(a[a.indexOf("--days") + 1]) : 14;
  const { lines, problems, warnings } = await run(process.env, days);
  lines.forEach(l => console.log(l));
  warnings.forEach(w => console.log(`::warning::${w}`));
  problems.forEach(p => console.error(`::error::${p}`));
  process.exit(problems.length ? 1 : 0);
}
