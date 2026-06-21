#!/usr/bin/env python3
"""
Rigenera la vetrina Discover della redazione (assets/podcasts/schelp/).

Scarica i podcast PUBBLICATI dell'utente "schelp" usando l'API AUTENTICATA
esistente (NESSUNA modifica al backend):

    login (email+password) -> GET /discover/author/schelp ->
    download di audio + cover -> assets/podcasts/schelp/podcasts.json
    con percorsi locali.

La pagina /discover resta 100% statica: legge quel JSON same-origin, niente
CORS, niente token nel browser.

PRE-REQUISITO IMPORTANTE
------------------------
Nell'app, loggato come "schelp", ogni podcast deve essere PUBBLICATO su Scopri
(opt-in pubblico) con un argomento: solo i podcast pubblicati compaiono qui.
L'endpoint restituisce i podcast nella LINGUA dell'account schelp.

Uso
---
    SCHELP_EMAIL='redazione@schelp.app' \
    SCHELP_PASSWORD='...' \
    python3 scripts/fetch_schelp_podcasts.py --language it

    # oppure con un token gia' pronto (salti il login):
    SCHELP_TOKEN='eyJ...' python3 scripts/fetch_schelp_podcasts.py --language it

Poi:
    git add assets/podcasts/schelp && git commit -m "chore: aggiorna podcast redazione" && git push
"""

import argparse
import json
import os
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets", "podcasts", "schelp")
OUT_JSON = os.path.join(OUT_DIR, "podcasts.json")
REL_PREFIX = "assets/podcasts/schelp"


def _req(url, data=None, headers=None):
    headers = dict(headers or {})
    body = None
    if data is not None:
        body = json.dumps(data).encode()
        headers.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data=body, headers=headers)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status, r.read()


def login(api, email, password):
    """POST /auth/login con {email, password} -> access_token."""
    try:
        _, raw = _req(api + "/auth/login", data={"email": email, "password": password})
        tok = json.loads(raw or b"{}")
        token = tok.get("access_token") or tok.get("token")
        if not token:
            raise SystemExit("Login OK ma nessun access_token nella risposta: %s" % tok)
        return token
    except urllib.error.HTTPError as e:
        raise SystemExit("Login fallito (HTTP %s). Controlla SCHELP_EMAIL/SCHELP_PASSWORD." % e.code)


def download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": "schelp-fetch"})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        f.write(r.read())


def ext_from_url(url, default):
    _, e = os.path.splitext(urllib.parse.urlparse(url).path)
    return e if e and len(e) <= 5 else default


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default=os.environ.get("SCHELP_API", "https://api.apipodcast.org"))
    ap.add_argument("--username", default=os.environ.get("SCHELP_USERNAME", "schelp"),
                    help="username per il percorso /discover/author/<username>")
    ap.add_argument("--language", default=os.environ.get("SCHELP_LANGUAGE"),
                    help="codice lingua da marcare sugli episodi (es. it, en) per il filtro Lingua")
    ap.add_argument("--per-page", type=int, default=50)
    args = ap.parse_args()

    token = os.environ.get("SCHELP_TOKEN")
    if not token:
        email = os.environ.get("SCHELP_EMAIL")
        pw = os.environ.get("SCHELP_PASSWORD")
        if not email or not pw:
            raise SystemExit("Imposta SCHELP_TOKEN, oppure SCHELP_EMAIL + SCHELP_PASSWORD.")
        token = login(args.api, email, pw)

    auth = {"Authorization": "Bearer " + token, "Accept": "application/json"}
    url = "%s/discover/author/%s?page=1&per_page=%d" % (
        args.api, urllib.parse.quote(args.username), args.per_page)
    try:
        _, raw = _req(url, headers=auth)
    except urllib.error.HTTPError as e:
        raise SystemExit("Richiesta podcast fallita (HTTP %s)." % e.code)
    data = json.loads(raw or b"{}")
    pods = data.get("podcasts", []) if isinstance(data, dict) else (data or [])
    print("Trovati %d podcast PUBBLICATI per '%s'." % (len(pods), args.username))
    if not pods:
        print("Nessun podcast pubblicato: verifica di aver reso PUBBLICI gli episodi nell'app (come schelp).")

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
            "language": args.language or p.get("language"),
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
    print("\nScritto %s (%d episodi)." % (OUT_JSON, len(out)))
    print("Ora: git add assets/podcasts/schelp && git commit -m \"chore: aggiorna podcast redazione\" && git push")


if __name__ == "__main__":
    main()
