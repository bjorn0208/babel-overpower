#!/usr/bin/env python3
"""Gera o banco de fillers na voz da Bel (uma vez) e salva em /opt/babel/fillers.

Uso: python3 gera_fillers.py <chave_fish> [voz_id]
"""
import os
import sys

sys.path.insert(0, "/opt/babel")
import fish

FRASES = {
    "curto":    ["uhum", "aham", "certo", "tá", "sei"],
    "pensando": ["é...", "então...", "olha...", "deixa eu ver...", "boa pergunta..."],
    "reacao":   ["ah, sim!", "perfeito!", "que bom!"],
    # sons-ponte: curtos e neutros, tocados no início de CADA resposta
    "ponte":    ["hm...", "então...", "olha...", "ah, tá...", "é..."],
}

chave = sys.argv[1]
voz_id = sys.argv[2] if len(sys.argv) > 2 else None
os.makedirs("/opt/babel/fillers", exist_ok=True)

for categoria, lista in FRASES.items():
    for i, frase in enumerate(lista):
        destino = f"/opt/babel/fillers/{categoria}__{i}.sln"
        if os.path.exists(destino):
            print(f"já existe: {destino}")
            continue
        wav = fish.tts(chave, "[caloroso] " + frase, voz_id)
        pcm = fish.wav_para_slin8k(wav)
        with open(destino, "wb") as f:
            f.write(pcm)
        print(f"{destino} ← {frase!r} ({len(pcm) // 16} ms)")
print("pronto.")
