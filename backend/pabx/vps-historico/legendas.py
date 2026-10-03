#!/usr/bin/env python3
"""Legendas ao vivo do Babel Central.

Enquanto o vendedor está em chamada, este serviço lê a gravação em andamento
(MixMonitor escreve o wav aos poucos), transcreve cada trecho novo com a Fish
Audio e publica no Supabase Realtime — o app mostra o texto na tela na hora.

Marcadores: o dialplan cria /var/spool/babel/aovivo/<UNIQUEID> com o ramal
dentro; o hangup handler apaga ao desligar.
"""
import json
import os
import time
import urllib.request

import fish

ENV_PATH = "/opt/babel/babel.env"
AOVIVO = "/var/spool/babel/aovivo"
GRAVACOES = "/var/spool/babel/gravacoes"
BYTES_POR_SEG = 16000       # wav do MixMonitor: 8 kHz · 16 bits · mono
TRECHO_SEG = 4              # transcreve a cada ~4 s de áudio novo
CABECALHO_WAV = 44

def carregar_env():
    env = {}
    with open(ENV_PATH) as f:
        for linha in f:
            linha = linha.strip()
            if linha and not linha.startswith("#") and "=" in linha:
                k, v = linha.split("=", 1)
                env[k] = v
    return env

ENV = carregar_env()
offsets = {}    # uniqueid -> bytes já lidos
conversas = {}  # uniqueid -> texto acumulado da chamada
extraidos = {}  # uniqueid -> {nome, cargo, empresa} já detectados
chave_fish = None
chave_llm = None

def buscar_chave(provedor="fish_audio"):
    req = urllib.request.Request(
        ENV["SUPABASE_URL"] + f"/rest/v1/chaves_api?provedor=eq.{provedor}"
        "&ativa=eq.true&select=chave&limit=1",
        headers={"apikey": ENV["SUPABASE_SERVICE_ROLE"],
                 "Authorization": "Bearer " + ENV["SUPABASE_SERVICE_ROLE"]})
    with urllib.request.urlopen(req, timeout=10) as resp:
        linhas = json.load(resp)
    return linhas[0]["chave"] if linhas else None

def extrair_dados(uid, ramal):
    """Se na conversa apareceu nome/cargo/empresa, fixa na tela do vendedor."""
    if not chave_llm:
        return
    corpo = json.dumps({
        "model": "google/gemini-2.5-flash-lite",
        "max_tokens": 120,
        "messages": [{"role": "user", "content":
            "Desta transcrição parcial de uma ligação comercial, extraia APENAS o que "
            "foi dito explicitamente sobre a pessoa do outro lado: nome, cargo, empresa. "
            "Responda JSON puro só com os campos encontrados (ex.: {\"nome\":\"João\"}). "
            "Se nada, responda {}.\n\n" + conversas[uid][-1500:]}],
    }).encode()
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions", data=corpo,
        headers={"Authorization": "Bearer " + chave_llm,
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        texto = json.load(resp)["choices"][0]["message"]["content"].strip()
    if texto.startswith("```"):
        texto = texto.strip("`").replace("json", "", 1).strip()
    try:
        novos = {k: v for k, v in json.loads(texto).items()
                 if v and k in ("nome", "cargo", "empresa")}
    except Exception:
        return
    atual = extraidos.setdefault(uid, {})
    if novos and novos != atual:
        atual.update(novos)
        publicar(ramal, None, evento="dados", payload=atual)

def publicar(ramal, texto, evento="legenda", payload=None):
    corpo = json.dumps({"messages": [{
        "topic": f"legendas:{ramal}",
        "event": evento,
        "payload": payload if payload is not None else {"texto": texto, "t": time.time()},
    }]}).encode()
    req = urllib.request.Request(
        ENV["SUPABASE_URL"] + "/realtime/v1/api/broadcast", data=corpo,
        headers={"apikey": ENV["SUPABASE_SERVICE_ROLE"],
                 "Authorization": "Bearer " + ENV["SUPABASE_SERVICE_ROLE"],
                 "Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=10).read()

def ciclo():
    if not os.path.isdir(AOVIVO):
        return
    for uid in os.listdir(AOVIVO):
        marcador = os.path.join(AOVIVO, uid)
        wav = os.path.join(GRAVACOES, uid + ".wav")
        try:
            with open(marcador) as f:
                ramal = f.read().strip()
        except OSError:
            continue
        if not os.path.exists(wav):
            # gravação ainda não começou (ou já foi embora); limpa marcador velho
            if time.time() - os.path.getmtime(marcador) > 120:
                os.unlink(marcador)
            continue
        tamanho = os.path.getsize(wav)
        lido = offsets.get(uid, CABECALHO_WAV)
        novos = tamanho - lido
        if novos < TRECHO_SEG * BYTES_POR_SEG:
            # chamada acabou? wav parado há 60 s → esquece
            if time.time() - os.path.getmtime(wav) > 60:
                os.unlink(marcador)
                offsets.pop(uid, None)
                conversas.pop(uid, None)
                extraidos.pop(uid, None)
            continue
        with open(wav, "rb") as f:
            f.seek(lido)
            pcm = f.read(novos)
        offsets[uid] = lido + len(pcm)
        try:
            texto = fish.asr(chave_fish, fish.slin8k_para_wav16k(pcm))
            if texto.strip():
                publicar(ramal, texto.strip())
                conversas[uid] = (conversas.get(uid, "") + " " + texto.strip())[-4000:]
                extrair_dados(uid, ramal)
        except Exception as erro:
            print(f"asr/publicação falhou ({uid[:12]}): {erro}", flush=True)

if __name__ == "__main__":
    os.makedirs(AOVIVO, exist_ok=True)
    while True:
        try:
            if chave_fish is None:
                chave_fish = buscar_chave("fish_audio")
            if chave_llm is None:
                chave_llm = buscar_chave("openrouter")
            ciclo()
        except Exception as erro:
            print(f"erro no ciclo: {erro}", flush=True)
        time.sleep(2)
