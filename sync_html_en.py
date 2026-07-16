"""Pre-renderizza i testi statici di index.html/discover.html in INGLESE, leggendo
il dizionario EN da i18n.js. Cosi' il primo paint e' gia' in EN e non c'e' flash
IT->EN (il sito e' EN-only). Gli attributi data-i18n-* restano intatti: il toggle
lingua continua a funzionare e a runtime landing.js ri-applica EN (no-op).

USO (rilancia dopo aver cambiato una copy nel blocco `en` di i18n.js):
    python sync_html_en.py index.html discover.html
Idempotente. Richiede node (per leggere i18n.js)."""
import json, re, subprocess, sys

# Sorgente di verita': il blocco `en` di i18n.js (letto via node).
_JS = "global.window={};require('./i18n.js');process.stdout.write(JSON.stringify(window.SchelpI18n.en))"
en = json.loads(subprocess.check_output(["node", "-e", _JS]).decode("utf-8"))

def esc_text(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def esc_attr(s):
    return s.replace("&", "&amp;").replace('"', "&quot;")

HTML_KEYS = ["hero.lede.html", "hero.formHelp.html", "cookie.body.html"]

def transform(html):
    stats = {"text": 0, "html": 0, "attr": 0, "tpl": 0, "title": 0}

    # 1) data-i18n-text: solo contenuto testuale puro fino alla chiusura (</)
    def r_text(m):
        key = m.group(2)
        if key not in en:
            return m.group(0)
        stats["text"] += 1
        return m.group(1) + esc_text(en[key]) + m.group(4)
    html = re.sub(r'(data-i18n-text="([^"]+)"[^>]*>)([^<]*)(</)', r_text, html)

    # 2) data-i18n-html: sostituisce l'innerHTML (contenuto con tag inline)
    for key in HTML_KEYS:
        if key not in en:
            continue
        pat = re.compile(
            r'(<(\w+)([^>]*\sdata-i18n-html="' + re.escape(key) + r'"[^>]*)>)(.*?)(</\2>)',
            re.DOTALL)
        new, n = pat.subn(lambda m: m.group(1) + en[key] + m.group(5), html, count=1)
        if n:
            stats["html"] += 1
            html = new

    # 3) data-i18n-attr: imposta l'attributo reale sul tag (replace o add)
    def r_tag(m):
        tag = m.group(0)
        spec = re.search(r'data-i18n-attr="([^"]+)"', tag)
        if not spec:
            return tag
        for pair in spec.group(1).split(";"):
            if ":" not in pair:
                continue
            attr, key = [x.strip() for x in pair.split(":", 1)]
            if key not in en:
                continue
            val = esc_attr(en[key])
            ap = re.compile(r'(\s' + re.escape(attr) + r'=")[^"]*(")')
            if ap.search(tag):
                tag = ap.sub(lambda a: a.group(1) + val + a.group(2), tag, count=1)
            else:
                tag = tag[:-1] + ' ' + attr + '="' + val + '">'
            stats["attr"] += 1
        return tag
    html = re.sub(r'<[^>]*\sdata-i18n-attr="[^"]+"[^>]*>', r_tag, html)

    # 4) data-i18n-text-template (footer copyright, contiene {year})
    def r_tpl(m):
        key = m.group(2)
        if key not in en:
            return m.group(0)
        stats["tpl"] += 1
        return m.group(1) + esc_text(en[key]) + m.group(4)
    html = re.sub(r'(data-i18n-text-template="([^"]+)"[^>]*>)([^<]*)(</)', r_tpl, html)

    # 5) <title>
    if "meta.title" in en:
        new, n = re.subn(r'(<title[^>]*>)([^<]*)(</title>)',
                         lambda m: m.group(1) + esc_text(en["meta.title"]) + m.group(3),
                         html, count=1)
        if n:
            stats["title"] = n
            html = new
    return html, stats

for fn in sys.argv[1:]:
    src = open(fn, encoding="utf-8").read()
    out, st = transform(src)
    open(fn, "w", encoding="utf-8").write(out)
    print(f"{fn}: {st}")
