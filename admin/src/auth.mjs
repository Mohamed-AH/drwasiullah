/* Cloudflare Access token check. Access signs a JWT (RS256) for every request that passed its login and sends it in the
   Cf-Access-Jwt-Assertion header. We verify signature, issuer, audience and expiry ourselves, so a request that somehow reached
   the Worker without going through Access is refused (fail closed). */
const dec = s => new TextDecoder().decode(b64u(s));
function b64u(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/"); s += "=".repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

export async function verifyAccessJwt(token, { jwks, aud, issuer, now = Date.now() / 1000 }) {
  if (typeof token !== "string" || token.length > 8192) throw new Error("no token");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  let header, payload;
  try { header = JSON.parse(dec(parts[0])); payload = JSON.parse(dec(parts[1])); } catch { throw new Error("malformed token"); }
  if (header.alg !== "RS256") throw new Error("unexpected algorithm");
  const jwk = (jwks && jwks.keys || []).find(k => k.kid === header.kid && k.kty === "RSA");
  if (!jwk) throw new Error("unknown key");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64u(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
  if (!ok) throw new Error("bad signature");
  if (!issuer || payload.iss !== issuer) throw new Error("wrong issuer");
  const auds = [].concat(payload.aud || []);
  if (!aud || !auds.includes(aud)) throw new Error("wrong audience");
  if (typeof payload.exp !== "number" || payload.exp <= now) throw new Error("expired");
  if (typeof payload.nbf === "number" && payload.nbf > now + 60) throw new Error("not yet valid");
  if (typeof payload.email !== "string" || !payload.email) throw new Error("no email in token");
  return payload;
}

let jwksCache = { at: 0, keys: null };
export async function fetchJwks(domain, fetcher = fetch) {
  if (jwksCache.keys && Date.now() - jwksCache.at < 3600e3) return jwksCache.keys;
  const r = await fetcher(`https://${domain}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error(`certs HTTP ${r.status}`);
  jwksCache = { at: Date.now(), keys: await r.json() };
  return jwksCache.keys;
}
export const forgetJwks = () => { jwksCache = { at: 0, keys: null }; };

/* -> { email } or throws. In local development only (var ENV=dev, never set in wrangler.jsonc) the header x-dev-email stands in for Access. */
export async function identify(request, env) {
  if (env.ENV === "dev" && request.headers.get("x-dev-email")) return { email: request.headers.get("x-dev-email").toLowerCase() };
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) throw Object.assign(new Error("not configured"), { status: 503 });
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) throw Object.assign(new Error("no Access token"), { status: 401 });
  const issuer = "https://" + env.ACCESS_TEAM_DOMAIN;
  let payload;
  try { payload = await verifyAccessJwt(token, { jwks: await fetchJwks(env.ACCESS_TEAM_DOMAIN), aud: env.ACCESS_AUD, issuer }); }
  catch (e) {
    if (e.message === "unknown key") {            // Cloudflare rotates its keys: refresh once
      forgetJwks();
      payload = await verifyAccessJwt(token, { jwks: await fetchJwks(env.ACCESS_TEAM_DOMAIN), aud: env.ACCESS_AUD, issuer }).catch(() => null);
    }
    if (!payload) throw Object.assign(new Error("invalid Access token"), { status: 401 });
  }
  return { email: payload.email.toLowerCase() };
}
