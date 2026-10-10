/* Unit test of the Cloudflare Access token check (admin/src/auth.mjs): a good token passes; every kind of bad token is refused. */
import { webcrypto as crypto } from "node:crypto";
import { verifyAccessJwt } from "../admin/src/auth.mjs";

const b64u = b => Buffer.from(b).toString("base64url");
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const other = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1", alg: "RS256", use: "sig" };
const jwks = { keys: [jwk] };
const ISS = "https://team.cloudflareaccess.com", AUD = "abc123", NOW = 1_800_000_000;

async function sign(payload, { key = privateKey, header = { alg: "RS256", kid: "k1", typ: "JWT" } } = {}) {
  const h = b64u(JSON.stringify(header)), p = b64u(JSON.stringify(payload));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(h + "." + p));
  return `${h}.${p}.${b64u(Buffer.from(sig))}`;
}
const good = { iss: ISS, aud: [AUD], email: "a@example.com", exp: NOW + 600, nbf: NOW - 5 };
let bad = 0;
const t = async (name, token, expectOk, opts = {}) => {
  let ok, err;
  try { await verifyAccessJwt(token, { jwks, aud: AUD, issuer: ISS, now: NOW, ...opts }); ok = true; } catch (e) { ok = false; err = e.message; }
  const pass = ok === expectOk; if (!pass) bad++;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${ok ? "" : "  (" + err + ")"}`);
};

await t("valid token", await sign(good), true);
await t("audience as plain string", await sign({ ...good, aud: AUD }), true);
await t("expired", await sign({ ...good, exp: NOW - 1 }), false);
await t("wrong audience", await sign({ ...good, aud: ["other"] }), false);
await t("wrong issuer", await sign({ ...good, iss: "https://evil.example" }), false);
await t("signed with another key", await sign(good, { key: other.privateKey }), false);
await t("alg none", `${b64u(JSON.stringify({ alg: "none", kid: "k1" }))}.${b64u(JSON.stringify(good))}.`, false);
await t("alg HS256", await sign(good, { header: { alg: "HS256", kid: "k1" } }), false);
await t("unknown kid", await sign(good, { header: { alg: "RS256", kid: "zzz" } }), false);
await t("no email", await sign({ ...good, email: undefined }), false);
await t("not yet valid", await sign({ ...good, nbf: NOW + 3600 }), false);
await t("tampered payload", (await sign(good)).replace(/\.[^.]+\./, "." + b64u(JSON.stringify({ ...good, email: "evil@example.com" })) + "."), false);
await t("garbage", "not-a-jwt", false);
await t("empty", "", false);
await t("audience not configured", await sign(good), false, { aud: "" });
await t("issuer not configured", await sign(good), false, { issuer: "" });
if (bad) { console.error(`!! ${bad} failed`); process.exit(1); }
console.log("all admin auth checks passed");
