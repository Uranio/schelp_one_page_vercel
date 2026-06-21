#!/usr/bin/env python3
"""
Rigenera la vetrina Discover della redazione (assets/podcasts/schelp/).

Scarica i podcast PUBBLICATI dell'utente "schelp" usando l'API AUTENTICATA
esistente (NESSUNA modifica al backend): login -> /discover/author/schelp ->
download di audio + cover -> scrittura di assets/podcasts/schelp/podcasts.json
con percorsi locali (la pagina resta 100% statica, niente CORS, niente token
nel browser).

Uso:
    SCHELP_PASSWORD='...' python3 scripts/fetch_schelp_podcasts.py \
        --username schelp \
        --api https://api.apipodcast.org

Oppure passando un token già pronto:
    SCHELP_TOKEN='eyJ...' python3 scripts/fetch_schelp_podcasts.py

Rieseguilo ogni volta che la redazione pubblica nuovi episodi, poi committa
la cartella assets/podcasts/schelp/.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets", "podcasts", "schelp")
OUT_JSON = os.path.join(OUT_DIR, "podcasts.json")
REL_PREFIX = "assets/podcasts/schelp"


def _req(url, data=None, headers=None, method=None):
    headers = headers or {}
    body = None
    if data is not None:
        if headers.get("Content-Type") == "application/x-www-form-urlencoded":
            body = urllib.parse.urlencode(data).encode()
        else:
            body = json.dumps(data).encode()
            headers.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, r.read()


def login(api, username, password):
    """Prova prima JSON, poi form OAuth2. Restituisce l'access token."""
    attempts = [
        (api + "/auth/login", {"username": username, "password": password}, None),
        (api + "/auth/login", {"email": username, "password": password}, None),
        (api + "/auth/login", {"username": username, "password": password},
         {"Content-Type": "application/x-www-form-urlencoded"}),
    ]
    last = None
    for url, payload, hdr in attempts:
        try:
            status, raw = _req(url, data=payload, headers=hdr or {})
            tok = json.loads(raw or b"{}")
            token = tok.get("access_token") or tok.get("token") or (tok.get("data") or {}).get("access_token")
            if token:
                return token
        except urllib.error.HTTPError as e:
            last = "%s -> HTTP %s" % (url, e.code)
        except Exception as e:  # noqa: BLE001
            last = "%s -> %s" % (url, e)
    raise SystemExit("Login fallito. Verifica credenziali/endpoint. Ultimo: %s" % last)


def download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": "schelp-fetch"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        f.write(r.read())


def ext_from_url(url, default):
    path = urllib.parse.urlparse(url).path
    _, e = os.path.splitext(path)
    return e if e and len(e) <= 5 else default


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default=os.environ.get("SCHELP_API", "https://api.apipodcast.org"))
    ap.add_argument("--username", default=os.environ.get("SCHELP_USERNAME", "schelp"))
    ap.add_argument("--per-page", type=int, default=50)
    args = ap.parse_args()

    token = os.environ.get("SCHELP_TOKEN")
    if not token:
        pw = os.environ.get("SCHELP_PASSWORD")
        if not pw:
            raise SystemExit("Imposta SCHELP_TOKEN oppure SCHELP_PASSWORD.")
        token = login(args.api, args.username, pw)

    auth = {"Authorization": "Bearer " + token, "Accept": "application/json"}
    url = "%s/discover/author/%s?page=1&per_page=%d" % (args.api, urllib.parse.quote(args.username), args.per_page)
    status, raw = _req(url, headers=auth)
    data = json.loads(raw or b"{}")
    pods = data.get("podcasts", []) if isinstance(data, dict) else (data or [])
    print("Trovati %d podcast pubblicati per '%s'." % (len(pods), args.username))

    os.makedirs(OUT_DIR, exist_ok=True)
    out = []
    for p in pods:
        pid = p.get("id")
        audio_url = p.get("audio_url") or ""
        image_url = p.get("image_url") or ""
        entry = {
            "id": pid,
            "title": p.get("title") or "Podcast",
            "duration_minutes": p.get("duration_minutes"),
            "podcast_type": p.get("podcast_type"),
            "interest": p.get("interest"),
            "author": p.get("author") or args.username,
            "language": p.get("language") or p.get("lang"),
            "waveform_peaks": p.get("waveform_peaks"),
        }
        if audio_url:
            fn = "p%s%s" % (pid, ext_from_url(audio_url, ".mp3"))
            download(audio_url, os.path.join(OUT_DIR, fn))
            entry["audio_url"] = "%s/%s" % (REL_PREFIX, fn)
        if image_url:
            fn = "p%s%s" % (pid, ext_from_url(image_url, ".png"))
            download(image_url, os.path.join(OUT_DIR, fn))
            entry["image_url"] = "%s/%s" % (REL_PREFIX, fn)
        out.append(entry)
        print("  ✓ %s — %s" % (pid, entry["title"]))

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("Scritto %s (%d episodi)." % (OUT_JSON, len(out)))


if __name__ == "__main__":
    main()
