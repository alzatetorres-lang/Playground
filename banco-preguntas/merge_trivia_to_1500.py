# -*- coding: utf-8 -*-
"""Fusiona preguntas_trivia.json al final de questions_1500.json.
Cada pregunta de trivia se agrega como entry C1501.. en adelante con
tema="Varias", dificultad="Fácil". Tras verificar, se elimina preguntas_trivia.json
para dejar un unico JSON de preguntas.
"""
import json
import os

WORK = os.path.dirname(os.path.abspath(__file__))
BASE = "kahoot_images"

SRC = os.path.join(WORK, "preguntas_trivia.json")
DST = os.path.join(WORK, "questions_1500.json")
CACHE = os.path.join(WORK, BASE, "cache.json")

with open(SRC, encoding="utf-8") as f:
    trivia = json.load(f)
with open(DST, encoding="utf-8") as f:
    banco = json.load(f)
cache = {}
if os.path.exists(CACHE):
    with open(CACHE, encoding="utf-8") as f:
        cache = json.load(f)

existente = {q["id"] for q in banco["questions"]}
siguiente = 1501

for q in trivia:
    while "C%d" % siguiente in existente:
        siguiente += 1
    entry = {
        "id": "C%d" % siguiente,
        "tema": "Varias",
        "dificultad": "Fácil",
        "concepto": q["respuesta_correcta"],
        "respuesta": q["respuesta_correcta"],
        "kahoot": {
            "pregunta": q["pregunta"],
            "categoria_origen": q.get("categoria", ""),
            "opciones": q["opciones"],
            "respuesta_correcta": q["respuesta_correcta"],
        },
    }
    if q.get("tiene_imagen") and q.get("url_imagen"):
        entry["kahoot"]["imagen_pista"] = q.get("descripcion_imagen", "")
        entry["kahoot"]["estado_imagen"] = "Insertada"
        entry["kahoot"]["url_imagen"] = q["url_imagen"]
        entry["kahoot"]["imagen_url"] = cache.get("trivia:q%s" % q["id"], {}).get("thumb_url", "")
    banco["questions"].append(entry)
    existente.add(entry["id"])
    siguiente += 1

banco["total_preguntas"] = len(banco["questions"])

with open(DST, "w", encoding="utf-8") as f:
    json.dump(banco, f, ensure_ascii=False, indent=1)

print("total: %d (antes %d)" % (banco["total_preguntas"], banco["total_preguntas"] - len(trivia)))
print("ids nuevos: C1501..C%d aprox." % (siguiente - 1))
for q in banco["questions"][-3:]:
    print(q["id"], q["tema"], q["dificultad"], "->", q["kahoot"]["pregunta"][:50])
