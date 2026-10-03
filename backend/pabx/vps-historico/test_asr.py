#!/usr/bin/env python3
"""Compara Fish ASR vs Deepgram numa gravação REAL de ligação (8 kHz)."""
import subprocess
import sys
import time
import urllib.request

sys.path.insert(0, "/opt/babel")
import deepgram
import fish
import ia_ligadora as motor  # reusa sb()/chave_api()

fish_key = motor.chave_api("fish_audio")
dg_key = motor.chave_api("deepgram")

# baixa a gravação mp3 mais recente de uma ligação real (numero != 'sim')
linhas = motor.sb("GET", "ia_chamadas?gravacao_url=not.is.null&numero=neq.sim"
                         "&select=gravacao_url,transcricao&order=criado_em.desc&limit=1")
if not linhas:
    print("nenhuma gravação real encontrada"); sys.exit(1)
caminho = linhas[0]["gravacao_url"]
url = (motor.ENV["SUPABASE_URL"] + "/storage/v1/object/gravacoes/" + caminho)
req = urllib.request.Request(url, headers={
    "Authorization": "Bearer " + motor.ENV["SUPABASE_SERVICE_ROLE"]})
mp3 = urllib.request.urlopen(req, timeout=30).read()

# mp3 → PCM s16le 8 kHz (o mesmo formato que o motor captura)
p = subprocess.run(["ffmpeg", "-loglevel", "quiet", "-i", "pipe:0",
                    "-f", "s16le", "-ar", "8000", "-ac", "1", "pipe:1"],
                   input=mp3, capture_output=True)
pcm = p.stdout
print(f"gravação: {caminho} ({len(pcm)//16000}s de áudio)\n")

t = time.time()
try:
    tf = fish.asr(fish_key, fish.slin8k_para_wav16k(pcm))
except Exception as e:
    tf = f"ERRO: {e}"
print(f"FISH     ({time.time()-t:.1f}s): {tf!r}\n")

t = time.time()
try:
    td = deepgram.transcrever(dg_key, pcm)
except Exception as e:
    td = f"ERRO: {e}"
print(f"DEEPGRAM ({time.time()-t:.1f}s): {td!r}")
