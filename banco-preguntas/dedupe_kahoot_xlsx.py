# -*- coding: utf-8 -*-
"""Fase C (corregida): dedupe de medios identicos en el xlsx.
Soporta Target absolutos ('/xl/media/x.jpeg'), relativos ('../media/x.jpeg')
y 'media/x.jpeg'. Ademas limpia Overrides de media eliminados en [Content_Types].xml.
"""
import hashlib
import os
import re
import zipfile

WORK = os.path.dirname(os.path.abspath(__file__))
os.chdir(WORK)

XLSX = "1500_preguntas_kahoot_pictionary.xlsx"
XLSX_TMP = "1500_preguntas_kahoot_pictionary_tmp.xlsx"

with zipfile.ZipFile(XLSX, "r") as zin:
    names = zin.namelist()
    data = {n: zin.read(n) for n in names}

media_pattern = re.compile(r"^xl/media/image\d+\.(jpe?g|png)$", re.I)
media_names_before = [n for n in sorted(names) if media_pattern.match(n)]
hash_map = {}
rename = {}
for n in media_names_before:
    h = hashlib.sha256(data[n]).hexdigest()
    if h in hash_map:
        rename[n] = hash_map[h]
    else:
        hash_map[h] = n

print("media total: %d | unicos: %d" % (len(media_names_before), len(hash_map)), flush=True)
final_media = set(hash_map.values())
if not rename:
    print("Nada que deduplicar.", flush=True)
    raise SystemExit(0)


def parse_target(t):
    """Devuelve (estilo, ruta_normalizada_xl) o None si no es media."""
    m = re.match(r"^/xl/media/(.+)$", t, re.I)
    if m:
        return "abs", "xl/media/" + m.group(1)
    m = re.match(r"^\.\./media/(.+)$", t, re.I)
    if m:
        return "rel", "xl/media/" + m.group(1)
    m = re.match(r"^media/(.+)$", t, re.I)
    if m:
        return "bare", "xl/media/" + m.group(1)
    return None


def rewrite_target(t):
    p = parse_target(t)
    if not p:
        return t
    style, rel = p
    if rel in rename:
        canon = rename[rel]
        base = canon.split("/")[-1]
        if style == "abs":
            return "/xl/media/" + base
        if style == "rel":
            return "../media/" + base
        return "media/" + base
    return t


rels_pattern = re.compile(r"^xl/drawings/_rels/drawing\d+\.xml\.rels$", re.I)
changed = 0
for n in names:
    if rels_pattern.match(n):
        txt = data[n].decode("utf-8")
        new_txt = re.sub(r'Target="([^"]+)"', lambda m: 'Target="%s"' % rewrite_target(m.group(1)), txt)
        if new_txt != txt:
            data[n] = new_txt.encode("utf-8")
            changed += 1
print("rels reescritos: %d archivos" % changed, flush=True)

# [Content_Types].xml: eliminar Overrides de media eliminados
ct_name = "[Content_Types].xml"
ct = data[ct_name].decode("utf-8")
removed = set(rename.keys())
over_pat = re.compile(r'<Override PartName="(/xl/media/image\d+\.(?:jpe?g|png))"[^>]*/>', re.I)
found = over_pat.findall(ct)
kept_partnames = set()
def _keep(m):
    part = m.group(1)
    kept_partnames.add(part)
    rel = part.lstrip("/")
    if rel in removed:
        return ""
    return m.group(0)
ct2 = over_pat.sub(_keep, ct)
print("Overrides media: %d (de %d eliminados sobraran suficientes)" % (len(found), len(removed)), flush=True)
data[ct_name] = ct2.encode("utf-8")

# verificacion interna: todos los targets de drawing rels deben existir
missing = []
for n in names:
    if rels_pattern.match(n):
        for m in re.finditer(r'Target="([^"]+)"', data[n].decode("utf-8")):
            p = parse_target(m.group(1))
            if p and p[1] not in final_media:
                missing.append((n, m.group(1)))
if missing:
    print("ERROR: %d targets rotos, aborto:" % len(missing), missing[:5], flush=True)
    raise SystemExit(1)

with zipfile.ZipFile(XLSX_TMP, "w", zipfile.ZIP_DEFLATED) as zout:
    for n in names:
        if n in rename:
            continue  # saltar media duplicada/eliminada
        zout.writestr(n, data[n])

os.replace(XLSX_TMP, XLSX)
print("LISTO: media %d -> %d archivos" % (len(media_names_before), len(set(hash_map.values()))), flush=True)
print("Nuevo tamano: %.1f MB" % (os.path.getsize(XLSX) / 1048576), flush=True)
