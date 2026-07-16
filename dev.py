#!/usr/bin/env python3
# =====================================================================
# Schelp landing — dev-server locale (routing "alla Vercel" + proxy API)
# ---------------------------------------------------------------------
# Cosa fa:
#   1) serve i file statici della landing
#   2) applica i rewrites di vercel.json (URL puliti: /discover, ecc.)
#   3) PROXY di /public/* e /p/:id verso l'API di PRODUZIONE
#      -> il form invia davvero a produzione, niente CORS, niente Vercel
#   4) in locale forza SchelpConfig.formEndpoint = "/public/signup"
#      (path same-origin -> passa dal proxy). La produzione resta intatta.
#   5) live-reload: ricarica il browser a ogni salvataggio.
#
# Uso:   python dev.py            (http://localhost:8000)
#        PORT=3000 python dev.py  (porta diversa)
# =====================================================================
import http.server, socketserver, urllib.request, urllib.error
import json, os, re, sys, socket

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "8000"))
API  = os.environ.get("API_BASE", "https://api.apipodcast.org")  # target proxy = PRODUZIONE

# rewrites da vercel.json (se presente)
REWRITES = []
try:
    REWRITES = json.load(open(os.path.join(ROOT, "vercel.json"), encoding="utf-8")).get("rewrites", [])
except Exception:
    pass

# script iniettato in <head>: override endpoint (solo locale) + live-reload
INJECT = (
    '<script>'
    'try{if(window.SchelpConfig){window.SchelpConfig.formEndpoint="/public/signup";}}catch(e){}'
    '(function(){var last=null;setInterval(function(){'
    'fetch("/__reload").then(function(r){return r.text();}).then(function(v){'
    'if(last===null){last=v;}else if(v!==last){location.reload();}}).catch(function(){});'
    '},900);})();'
    '</script>'
)

def rewrite_path(p):
    """vercel rewrites (source->destination interno) + cleanUrls."""
    for rw in REWRITES:
        src, dst = rw.get("source", ""), rw.get("destination", "")
        rx = "^" + re.sub(r":\w+", r"[^/]+", re.escape(src).replace(r"\:", ":")) + "$"
        if dst.startswith("/") and re.match(rx, p):
            return dst
    if p != "/" and not os.path.splitext(p)[1]:
        if os.path.isfile(os.path.join(ROOT, p.lstrip("/") + ".html")):
            return p + ".html"
    return p

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, fmt, *args):
        sys.stdout.write("  " + (fmt % args) + "\n")

    def end_headers(self):
        # niente cache in dev: il browser prende sempre i file freschi
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        super().end_headers()

    # --- proxy verso l'API di produzione ---
    def _proxy(self, method, url):
        n = int(self.headers.get("Content-Length", 0) or 0)
        body = self.rfile.read(n) if n else None
        req = urllib.request.Request(url, data=body, method=method)
        for h in ("Content-Type", "Accept", "Authorization"):
            if h in self.headers:
                req.add_header(h, self.headers[h])
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data, status, ctype = r.read(), r.status, r.headers.get("Content-Type", "application/json")
        except urllib.error.HTTPError as e:
            data, status, ctype = e.read(), e.code, e.headers.get("Content-Type", "application/json")
        except Exception as e:
            data, status, ctype = json.dumps({"error": str(e)}).encode(), 502, "application/json"
        print("  [proxy] %s %s -> %s (%d)" % (method, self.path, url, status))
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _api_target(self, p):
        if p.startswith("/public/") or p.startswith("/api/"):
            return API + self.path
        if p.startswith("/p/"):
            return API + "/public/share/" + p[3:]
        return None

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type,Accept,Authorization")
        self.end_headers()

    def do_POST(self):
        p = self.path.split("?")[0]
        t = self._api_target(p)
        if t:
            return self._proxy("POST", t)
        self.send_error(404, "Not an API route")

    def do_GET(self):
        p = self.path.split("?")[0]
        if p == "/__reload":
            mt = 0.0
            for root, _dirs, files in os.walk(ROOT):
                if os.sep + ".git" in root:
                    continue
                for f in files:
                    if f.endswith((".html", ".css", ".js", ".svg", ".json")):
                        try: mt = max(mt, os.path.getmtime(os.path.join(root, f)))
                        except OSError: pass
            data = str(mt).encode()
            self.send_response(200); self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(data))); self.end_headers()
            self.wfile.write(data); return
        t = self._api_target(p)
        if t:
            return self._proxy("GET", t)
        # routing statico + inject in HTML
        self.path = rewrite_path(p) + (("?" + self.path.split("?", 1)[1]) if "?" in self.path else "")
        rel = self.path.split("?")[0].lstrip("/") or "index.html"
        fp = os.path.join(ROOT, rel)
        if os.path.isdir(fp):
            fp, rel = os.path.join(fp, "index.html"), rel.rstrip("/") + "/index.html"
        if fp.endswith(".html") and os.path.isfile(fp):
            html = open(fp, encoding="utf-8").read().replace("</head>", INJECT + "</head>", 1)
            data = html.encode("utf-8")
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data))); self.end_headers()
            self.wfile.write(data); return
        return super().do_GET()

class Server(socketserver.ThreadingTCPServer):
    # Dual-stack: su Windows "localhost" spesso risolve a IPv6 (::1); ascoltando
    # solo IPv4 il browser resta appeso. Bindiamo :: con V6ONLY=0 -> IPv4 + IPv6.
    address_family = socket.AF_INET6
    allow_reuse_address = True
    daemon_threads = True
    def server_bind(self):
        try:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except (AttributeError, OSError):
            pass
        super().server_bind()

def make_server():
    try:
        return Server(("", PORT), Handler)          # IPv6 dual-stack
    except OSError:
        socketserver.ThreadingTCPServer.allow_reuse_address = True
        return socketserver.ThreadingTCPServer(("", PORT), Handler)  # fallback IPv4

if __name__ == "__main__":
    print("Schelp landing dev")
    print("  ->  http://localhost:%d      (o http://127.0.0.1:%d)" % (PORT, PORT))
    print("  routing   : vercel.json (%d rewrites) + cleanUrls" % len(REWRITES))
    print("  API proxy : /public/*, /p/:id  ->  %s  (SCRIVE IN PRODUZIONE)" % API)
    print("  live-reload: on  ·  Ctrl+C per fermare\n")
    try:
        make_server().serve_forever()
    except KeyboardInterrupt:
        print("\nbye")
