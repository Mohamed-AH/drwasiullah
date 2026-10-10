/* Publish = ask GitHub to run .github/workflows/publish.yml, which exports D1 into site/data/library.json, builds, commits to main
   (Cloudflare then deploys). Needs the Worker secret GH_DISPATCH_TOKEN (fine-grained token, Actions: read & write, this repo only). */
import { audit } from "./audit.mjs";

export async function lastPublish(db) {
  return db.prepare("SELECT id, at, actor, (strftime('%s','now') - strftime('%s', at)) AS age FROM audit_log WHERE action = 'publish' ORDER BY id DESC LIMIT 1").first();
}
export async function pendingChanges(db) {
  const last = await lastPublish(db);
  const r = await db.prepare("SELECT COUNT(*) c FROM audit_log WHERE id > ? AND (action LIKE 'lesson.%' OR action LIKE 'series.%')").bind(last ? last.id : 0).first();
  return { last, count: r.c };
}

export async function requestPublish(env, user, fetcher = fetch) {
  const token = env.GH_DISPATCH_TOKEN, repo = env.GH_REPO;
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo || "")) return "gh_missing";
  const { last, count } = await pendingChanges(env.DB);
  if (last && last.age < 60) return "wait";
  const base = env.GH_API_BASE || "https://api.github.com";
  let r;
  try {
    r = await fetcher(`${base}/repos/${repo}/actions/workflows/publish.yml/dispatches`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "drwasiullah-admin", "x-github-api-version": "2022-11-28", "content-type": "application/json" },
      body: JSON.stringify({ ref: "main", inputs: { actor: user.email } }),
    });
  } catch (e) { console.error("publish dispatch failed:", e); return "gh_failed"; }
  if (r.status !== 204) { console.error("publish dispatch HTTP", r.status, (await r.text()).slice(0, 300)); return "gh_failed"; }
  await audit(env.DB, user.email, "publish", "site", null, null, { pending: count });
  return "requested";
}
