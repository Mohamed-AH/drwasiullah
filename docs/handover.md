# Handover and break-glass notes

For the owner, and for whoever has to act if the owner is unavailable. **Contains no passwords or keys**: only where each thing lives. Keep the real credentials in a password manager with an emergency-access contact.

## Accounts (who holds what)
| Service | Holds | Recovery |
|---|---|---|
| Namecheap | the domain `drwasiullah.com` (registrar), nameservers point to Cloudflare | account email + 2FA recovery codes |
| Cloudflare | DNS, the site (Workers + static assets), `media.drwasiullah.com` (R2 bucket `drwasiullah-media`), D1 database `drwasiullah`, Access (who may open the portal), the portal Worker | account email + 2FA recovery codes; a second member recommended |
| GitHub `Mohamed-AH/drwasiullah` | code, data, nightly backups, all Actions, Publish | account + 2FA recovery codes; mirror in GitLab |
| Backblaze B2 | second copy of all media; encrypted nightly database copy | account + 2FA |
| GitLab | nightly mirror of the repository (private) | account + 2FA |
| healthchecks.io | the "did the backup run?" alarms | account |
| Google Search Console / Bing / UptimeRobot / YouTube API key | optional services | their own accounts |

## Secrets and variables (names only; values are in the services above, never in git)
**GitHub → Settings → Secrets and variables → Actions**
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`: D1 export, Publish, nightly backup (token permission D1 **Edit**; create in Cloudflare → My Profile → API Tokens)
- `YOUTUBE_API_KEY`: the daily YouTube sync (Google Cloud console)
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`: read-only R2 token for the media backup
- `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET`: the backup bucket's key (no delete permission)
- `BACKUP_PASSPHRASE`: opens the encrypted database copies (**also in the password manager, nothing works without it**)
- `GITLAB_TOKEN`, `GITLAB_PROJECT`: the mirror
- `HC_PING_D1_BACKUP`, `HC_PING_MEDIA_BACKUP`, `HC_PING_GIT_MIRROR`, `HC_PING_WEEKLY`: heartbeat URLs
- variable `GH_TOKEN_EXPIRES` (date), variable `SYNC_MODE` (optional)

**Cloudflare Worker secrets**: `GH_DISPATCH_TOKEN` on the portal Worker (`npx wrangler secret put GH_DISPATCH_TOKEN -c admin/wrangler.jsonc`; fine-grained GitHub token, Actions read & write on this repository only).
**On the owner's computer** (`.env`, git-ignored): R2 S3 keys with write access for `tools/mirror_media.py`, `YOUTUBE_API_KEY`; `npx wrangler login` for `tools/audio_batch.mjs`.
**Not in any backup, re-create from here:** the Cloudflare Access application and policy (Zero Trust → Access → Applications → the portal; team domain and AUD tag are in `admin/wrangler.jsonc`), the list of editors' emails (in the portal «المستخدمون»; also inside the encrypted database copy).

## If the owner is unavailable: what keeps working by itself
The public site is static and stays up. The daily YouTube sync, nightly backup, weekly media copy and mirror run on their own. Editors can still use the portal and Publish (as long as the GitHub token has not expired: note the date in `GH_TOKEN_EXPIRES`). Things that stop: token renewals, new credentials, billing problems, anything needing the owner's accounts.

## Break-glass: Cloudflare is down or the account is locked
1. Do not panic: `git` (GitHub and the GitLab mirror), the media copy in B2 and the encrypted database copy in B2 are all outside Cloudflare.
2. Status: https://www.cloudflarestatus.com. For an outage, wait; mirrored audio automatically falls back to archive.org in the player.
3. For a lost account: open a Cloudflare support ticket; meanwhile a degraded read-only copy can be published from git (`node scripts/build.mjs` makes `dist/`; any static host can serve it; the nameservers must then be changed at Namecheap, which takes up to 48 hours to propagate; `site/_headers` and `_redirects` are Cloudflare formats and would need an equivalent). Treat this as a last resort, not a plan to rehearse.
4. Restore content from `backup/` (restore-guide B) or the encrypted copy (H); media from B2 (restore-guide I).
