# -*- coding: utf-8 -*-
"""Busca imagenes libres de derechos (Wikipedia ES -> EN -> Commons) segun
descripcion_imagen de cada pregunta con tiene_imagen=true en preguntas_trivia.json.
Guarda la miniatura en kahoot_images/trivia_q<id>.jpg, anota la fuente en
kahoot_images/cache.json (clave trivia:q<id>) y actualiza url_imagen de cada pregunta.
Reanudable: si el archivo ya existe, se salta la descarga.
"""
import io
import json
import os
import time
import urllib.parse
import urllib.request

from PIL import Image

WORK = os.path.dirname(os.path.abspath(__file__))
os.chdir(WORK)

JSON_PATH = os.path.join(WORK, "preguntas_trivia.json")
IMG_DIR = os.path.join(WORK, "kahoot_images")
CACHE_PATH = os.path.join(IMG_DIR, "cache.json")
MAX_BOX = (480, 480)

UA = {
    "User-Agent": "TriviaQuizImages/1.0 (personal use; urllib)",
}

# terminos de busqueda por id de pregunta (leyenda = respuesta_correcta)
TERMS = {
    6: ["campo de girasoles", "Girasol", "Sunflower field"],
    12: ["Baloncesto", "Basketball (ball)"],
    20: ["Coliseo de Roma", "Roman Colosseum"],
    28: ["Apple logo", "Apple Inc."],
    34: ["Minecraft"],
    43: ["La persistencia de la memoria", "The Persistence of Memory"],
    51: ["Alhambra"],
    57: ["Millennium Falcon"],
}


def api_get(url, retries=4):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < retries - 1:
                time.sleep(min(25, 5 * (attempt + 1)))
                continue
            print("  API fallo: %s" % e, flush=True)
            return None
        except Exception as e:
            if attempt == retries - 1:
                print("  API fallo: %s" % e, flush=True)
                return None
            time.sleep(1.5 * (attempt + 1))
    return None


def search_wiki(lang, term):
    url = (
        "https://%s.wikipedia.org/w/api.php?action=query&format=json&formatversion=2"
        "&generator=search&gsrsearch=%s&gsrlimit=4&gsrnamespace=0"
        "&prop=pageimages&piprop=thumbnail&pithumbsize=480"
        % (lang, urllib.parse.quote(term))
    )
    data = api_get(url)
    if not data:
        return None
    pages = data.get("query", {}).get("pages") or []
    pages = [p for p in pages if p.get("thumbnail", {}).get("source")]
    pages.sort(key=lambda p: p.get("index", 99))
    for p in pages:
        th = p["thumbnail"]
        return {"thumb_url": th["source"], "page_title": p.get("title", ""), "lang": lang}
    return None


def search_commons(term):
    url = (
        "https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2"
        "&generator=search&gsrsearch=%s&gsrlimit=4&gsrnamespace=6"
        "&prop=imageinfo&iiprop=url|size&iiurlwidth=480"
        % urllib.parse.quote(term)
    )
    data = api_get(url)
    if not data:
        return None
    pages = data.get("query", {}).get("pages") or []
    pages.sort(key=lambda p: p.get("index", 99))
    for p in pages:
        infos = p.get("imageinfo") or []
        if infos and infos[0].get("thumburl"):
            return {"thumb_url": infos[0]["thumburl"], "page_title": p.get("title", ""), "lang": "commons"}
    return None


def download_and_prepare(meta):
    req = urllib.request.Request(meta["thumb_url"], headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
    im = Image.open(io.BytesIO(raw)).convert("RGBA")
    bg = Image.new("RGB", im.size, (255, 255, 255))
    bg.paste(im, mask=im.split()[3])
    im = bg
    im.thumbnail(MAX_BOX, Image.LANCZOS)
    return im, im.size


def main():
    os.makedirs(IMG_DIR, exist_ok=True)
    with open(JSON_PATH, encoding="utf-8") as f:
        preguntas = json.load(f)
    cache = {}
    if os.path.exists(CACHE_PATH):
        with open(CACHE_PATH, encoding="utf-8") as f:
            cache = json.load(f)

    seleccion = [q for q in preguntas if q.get("tiene_imagen") and q.get("descripcion_imagen")]
    print("Preguntas con imagen: %d" % len(seleccion), flush=True)

    ok, sin = 0, []
    for q in seleccion:
        qid = q["id"]
        key = "trivia:q%s" % qid
        fname = "trivia_q%s.jpg" % qid
        fpath = os.path.join(IMG_DIR, fname)

        if os.path.exists(fpath) and key in cache:
            ok += 1
            print("q%s: ya existe '%s'" % (qid, fname), flush=True)
            q["url_imagen"] = "kahoot_images/%s" % fname
            continue

        meta = None
        for term in TERMS.get(qid, []):
            meta = search_wiki("es", term) or search_wiki("en", term) or search_commons(term)
            if meta:
                print("q%s: '%s' -> %s (%s)" % (qid, term, meta["page_title"], meta["lang"]), flush=True)
                break
            time.sleep(1.0)
        if meta:
            try:
                im, size = download_and_prepare(meta)
                im.save(fpath, "JPEG", quality=85)
                meta["file"] = fname
                meta["w"], meta["h"] = size[0], size[1]
                cache[key] = meta
                q["url_imagen"] = "kahoot_images/%s" % fname
                ok += 1
            except Exception as e:
                print("  descarga fallo q%s: %s" % (qid, e), flush=True)
                sin.append(qid)
        else:
            print("q%s: SIN resultado para %s" % (qid, TERMS.get(qid)), flush=True)
            sin.append(qid)
        time.sleep(1.5)

    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(preguntas, f, ensure_ascii=False, indent=1)
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=1)
    print("RESUMEN: %d con imagen / %d sin imagen %s" % (ok, len(sin), sin), flush=True)


if __name__ == "__main__":
    main()
