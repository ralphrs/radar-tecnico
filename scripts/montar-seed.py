"""Gera public/seed/*.json a partir de uma exportação do banco do artifact.

Uso: python3 scripts/montar-seed.py <pasta-da-exportacao>
A pasta tem uma subpasta por collection (items, destaques, items-politica...) com um JSON por documento.
"""
import json, os, sys

COLLECTIONS = ["items", "destaques", "items-politica", "destaques-politica", "items-esportes", "destaques-esportes", "meta"]
POR_PARTE = 150

origem = sys.argv[1]
destino = os.path.join(os.path.dirname(__file__), "..", "public", "seed")
os.makedirs(destino, exist_ok=True)
for f in os.listdir(destino):
    os.remove(os.path.join(destino, f))

docs = []
for c in COLLECTIONS:
    pasta = os.path.join(origem, c)
    if not os.path.isdir(pasta):
        continue
    for nome in sorted(os.listdir(pasta)):
        if not nome.endswith(".json"):
            continue
        data = json.load(open(os.path.join(pasta, nome), encoding="utf-8"))
        chave = data.get("coletado") or data.get("data") or data.get("ultimaRodada") or ""
        docs.append({"c": c, "id": nome[:-5], "k": chave, "data": data})

partes = []
for i in range(0, len(docs), POR_PARTE):
    nome = f"{i // POR_PARTE:03d}.json"
    with open(os.path.join(destino, nome), "w", encoding="utf-8") as f:
        json.dump(docs[i:i + POR_PARTE], f, ensure_ascii=False, separators=(",", ":"))
    partes.append(nome)
with open(os.path.join(destino, "index.json"), "w") as f:
    json.dump({"partes": partes, "total": len(docs)}, f)
print(len(docs), "documentos em", len(partes), "partes")
