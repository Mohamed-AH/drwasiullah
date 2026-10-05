#!/usr/bin/env python3
"""Copy the site's PDFs (and optionally audio) into our own Cloudflare R2 bucket. Run on YOUR machine (needs access to the sources).

    pip install -r tools/requirements-mirror.txt
    set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY      (env vars, or a git-ignored .env file in the repo root)
    python tools/mirror_media.py --dry-run                         # list what would be copied
    python tools/mirror_media.py                                   # PDFs only (default, ~0.2 GB)
    python tools/mirror_media.py --kind audio --limit 20           # try a few audio files first
    python tools/mirror_media.py --verify                          # check every mirrored file is served by https://media.drwasiullah.com
    python tools/mirror_media.py --kind audio --series tirmidhi    # only these series (ids, several allowed)
    python tools/mirror_media.py --kind audio --ids fath-bari-2399 fath-bari-2400   # only these lessons (this also lets Makkah lessons through)
    python tools/mirror_media.py --kind audio --include-makkah     # everything, including all of Fath al-Bari (~10 GB)

Files hosted on makkahscholars.org (Fath al-Bari, Nuzhat lesson 22) are NOT copied unless you name them with --ids / --series or pass --include-makkah.

For every source URL in site/data/library.json it downloads the file, computes its SHA-256, uploads it to the bucket under a
content-addressed key (pdf/<sha16>.pdf, audio/<sha16>.mp3 - immutable, so cached forever) and records
source URL -> public URL in site/data/media.json. The site build uses that manifest: the mirrored copy becomes the primary link and
the original stays as the fallback. Resumable: anything already in the manifest is skipped, so an interrupted run just continues.
Commit site/data/media.json afterwards. Credentials are NEVER written to the repo. Needs boto3 (see tools/requirements-mirror.txt).
"""
import argparse, hashlib, json, os, sys, tempfile, time, urllib.parse, urllib.request, urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _lib import load_library   # library.json + makkah.json

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "site" / "data" / "media.json"
UA = {"User-Agent": "drwasiullah-mirror/1.0"}
MIME = {"pdf": "application/pdf", "mp3": "audio/mpeg", "m4a": "audio/mp4", "ogg": "audio/ogg", "wav": "audio/wav"}


def load_env():
    f = ROOT / ".env"
    if f.exists():
        for ln in f.read_text(encoding="utf-8").splitlines():
            if "=" in ln and not ln.lstrip().startswith("#"):
                k, v = ln.split("=", 1); os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def items(lib, kind, series=None, ids=None, include_makkah=False):
    out = []   # (source_url, kind)
    if kind in ("audio", "all"):
        for l in lib["lessons"]:
            if not l.get("src"): continue
            if series and l["series"] not in series: continue
            if ids and l["id"] not in ids: continue
            if "makkahscholars.org" in l["src"] and not (include_makkah or ids or series): continue   # a 10 GB series: only on request
            out.append((l["src"], "audio"))
    if kind in ("pdf", "all"):
        out += [(f["url"], "pdf") for b in lib.get("books", []) for f in b["files"]]
    seen, uniq = set(), []
    for u, k in out:
        if u not in seen: seen.add(u); uniq.append((u, k))
    return uniq


def download(url, kind, tries=3, max_seconds=240):
    """-> (temp path, sha256 hex, size). Streams to disk; retries 5xx/timeouts; rejects HTML error pages."""
    last = None
    for i in range(tries):
        if i: time.sleep(2 ** i)
        t0 = time.monotonic()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                ctype = (r.headers.get("Content-Type") or "").lower()
                if ctype.startswith("text/html"): raise ValueError(f"got HTML, not a file ({ctype})")
                h, n, first = hashlib.sha256(), 0, b""
                with tempfile.NamedTemporaryFile(delete=False) as tmp:
                    while chunk := r.read1(1 << 16):
                        if time.monotonic() - t0 > max_seconds: raise TimeoutError(f"stalled: more than {max_seconds}s for one file")   # a server that trickles bytes
                        if not first: first = chunk[:8]
                        h.update(chunk); tmp.write(chunk); n += len(chunk)
            if n == 0: raise ValueError("empty file")
            if kind == "pdf" and not first.startswith(b"%PDF"): raise ValueError("not a PDF (bad header)")
            return tmp.name, h.hexdigest(), n
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}"
            if e.code in (404, 410, 403): break          # retrying will not help
        except Exception as e:
            last = f"{type(e).__name__}: {e}"
    raise RuntimeError(last)


def save(manifest):
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    tmp = MANIFEST.with_suffix(".tmp")
    tmp.write_text(json.dumps(dict(sorted(manifest.items())), ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(MANIFEST)


def verify(manifest, only=None):
    bad = 0
    for src, m in manifest.items():
        if only and not m["key"].startswith(only + "/"): continue
        try:
            req = urllib.request.Request(m["url"], headers={**UA, "Range": "bytes=0-0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                cr = r.headers.get("Content-Range", ""); total = int(cr.rsplit("/", 1)[1]) if "/" in cr else int(r.headers.get("Content-Length", -1))
            ok = total == m["size"]; why = f"size {total} != {m['size']}"
        except Exception as e:
            ok, why = False, f"{type(e).__name__}: {e}"
        if not ok: bad += 1; print(f"  BAD  {m['url']}  ({why})")
    print(f"verify: {len(manifest) - bad} ok, {bad} bad")
    return bad == 0


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--library", default=str(ROOT / "site" / "data" / "library.json"))
    ap.add_argument("--kind", choices=["pdf", "audio", "all"], default="pdf")
    ap.add_argument("--limit", type=int, default=0, help="stop after N new uploads")
    ap.add_argument("--series", nargs="+", default=[], help="only lessons of these series ids")
    ap.add_argument("--ids", nargs="+", default=[], help="only these lesson ids (e.g. fath-bari-2399)")
    ap.add_argument("--include-makkah", action="store_true", help="also copy the lessons hosted on makkahscholars.org (Fath al-Bari, ~10 GB)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--verify", action="store_true", help="only check the public URLs of already mirrored files")
    a = ap.parse_args(argv)
    load_env()
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    base = os.environ.get("MEDIA_BASE", "https://media.drwasiullah.com").rstrip("/")
    if a.verify: return 0 if verify(manifest) else 1

    lib = load_library(a.library)
    todo = [(u, k) for u, k in items(lib, a.kind, set(a.series), set(a.ids), a.include_makkah) if u not in manifest]
    print(f"{len(todo)} to copy ({a.kind}); {len(manifest)} already mirrored", file=sys.stderr)
    if a.dry_run:
        for u, k in todo: print(f"  {k:5} {u}")
        return 0
    if not todo: return 0

    need = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]
    miss = [k for k in need if not os.environ.get(k)]
    if miss: sys.exit("missing environment variables: " + ", ".join(miss))
    import re
    if not os.environ.get("R2_ENDPOINT") and not re.fullmatch(r"[0-9a-f]{32}", os.environ["R2_ACCOUNT_ID"]):
        sys.exit("R2_ACCOUNT_ID must be your 32-character Cloudflare account ID (letters a-f and digits), not a token or key.\n"
                 "Find it in the Cloudflare dashboard: R2 overview page, right-hand side 'Account ID' (or the long hex string in the dashboard URL).")
    for k in ("R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"):
        if os.environ[k].startswith("cfat_") or os.environ[k].startswith("cfut_"):
            sys.exit(f"{k} looks like a Cloudflare API token. R2 needs the S3 pair (Access Key ID 32 hex chars + Secret Access Key 64 hex chars) from R2 -> Manage R2 API tokens -> Create API token.")
    import boto3
    from boto3.s3.transfer import TransferConfig
    from botocore.config import Config
    # gentle on unstable connections: few parallel parts, patient timeouts, automatic retries (a dropped connection used to fail the whole file)
    cfg = Config(retries={"max_attempts": 8, "mode": "standard"}, connect_timeout=30, read_timeout=120, tcp_keepalive=True)
    xfer = TransferConfig(max_concurrency=int(os.environ.get("MIRROR_UPLOAD_THREADS", "2")), multipart_chunksize=16 * 1024 * 1024, multipart_threshold=64 * 1024 * 1024)
    s3 = boto3.client("s3", region_name="auto", config=cfg, aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"], aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
                      endpoint_url=os.environ.get("R2_ENDPOINT") or f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com")
    bucket = os.environ.get("R2_BUCKET", "drwasiullah-media")

    done, failed = 0, []
    for i, (url, kind) in enumerate(todo, 1):
        if a.limit and done >= a.limit: break
        try:
            tmp, sha, size = download(url, kind)
            try:
                ext = (urllib.parse.urlsplit(url).path.rsplit(".", 1)[-1] or kind).lower()
                if ext not in MIME: ext = "pdf" if kind == "pdf" else "mp3"
                key = f"{kind}/{sha[:16]}.{ext}"
                extra = {"ContentType": MIME[ext], "CacheControl": "public, max-age=31536000, immutable", "Metadata": {"source": urllib.parse.quote(url, safe=":/")[:1000], "sha256": sha}}
                for attempt in range(1, 4):         # the connection can still drop mid-upload: start the upload again (up to 3 times)
                    try: s3.upload_file(tmp, bucket, key, ExtraArgs=extra, Config=xfer); break
                    except Exception as e:
                        if attempt == 3: raise
                        print(f"    upload interrupted ({type(e).__name__}); retrying {attempt}/2 ...", file=sys.stderr); time.sleep(5 * attempt)
            finally:
                os.unlink(tmp)
            manifest[url] = {"url": f"{base}/{key}", "key": key, "sha256": sha, "size": size}
            save(manifest); done += 1
            print(f"  [{i}/{len(todo)}] {size / 1e6:7.1f} MB  {key}  <- {url}", file=sys.stderr)
        except Exception as e:
            failed.append((url, str(e))); print(f"  FAILED {url}: {e}", file=sys.stderr)
    print(f"\nuploaded {done}, failed {len(failed)}, total mirrored {len(manifest)} -> {MANIFEST} (commit it)")
    if failed:
        for u, w in failed: print(f"   {w:30} {u}")
        return 1
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:   # progress is saved after every file: just run the script again to continue
        sys.exit("\ninterrupted - files already mirrored are kept in site/data/media.json; run again to continue")
