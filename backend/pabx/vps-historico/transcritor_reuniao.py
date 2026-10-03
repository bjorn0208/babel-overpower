#!/usr/bin/env python3
"""Transcritor da Reunião (BABEL OS) — Deepgram por faixa + dossiê ao vivo.

Lê os PCMs que o ouvinte_reuniao.py grava (1 por participante), transcreve os
trechos novos e:
 1. grava cada turno com dono em `salas_reuniao_turnos` (Supabase plataforma);
 2. publica no Realtime (`sala:<id>`, evento `turno`) pro painel do time;
 3. de tempos em tempos passa o acumulado de cada pessoa num LLM barato
    (OpenRouter, chave em `provedores_llm`) e faz UPSERT do dossiê em
    `salas_reuniao_dossie` (+ broadcast `dossie`) — dados da pessoa pingando
    na tela durante a call. Linha `__geral__` guarda os combinados da reunião.

ASR: Deepgram nova-2 pt-BR (rede, ~1-2 s por trecho). O whisper.cpp local ficou
como reserva — nesta VPS (2 vCPU dividida com o PABX) ele estourava o tempo
limite em série e derrubava a transcrição inteira.

Silêncio não gasta ASR: trecho com volume RMS baixo nem sai daqui.
Sala com marcador `fim` → transcreve o resto, extrai dossiê final e APAGA o
áudio (privacidade: só o texto fica, no banco).
"""
import audioop
import io
import json
import os
import shutil
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import wave

ENV_PATH = "/opt/babel/reuniao.env"
BASE = "/var/spool/babel/reuniao"
WHISPER = "/opt/whisper.cpp/build/bin/whisper-cli"
MODELO = "/opt/whisper.cpp/models/ggml-small-q5_1.bin"
TAXA = 16000
BYTES_SEG = TAXA * 2                 # s16le mono
TRECHO_SEG = 8                       # transcreve a cada ~8 s de áudio novo (5 picava demais a frase)
MAX_TRECHO_SEG = 45                  # teto por rodada — o resto espera o próximo ciclo
RMS_MINIMO = 250                     # abaixo disso = silêncio, nem manda pro ASR
DOSSIE_CADA_CHARS = 350              # novos chars por pessoa que disparam extração
COMBINADOS_CADA_SEG = 90

DG_MODELO = "nova-3"
DG_IDIOMA = "pt-BR"
JANELA_CORTE_MS = 200                # granularidade da busca por silêncio
CAUDA_CORTE_SEG = 10                 # procura o corte nos últimos N s do bloco (6 cortava no meio da frase)

CAMPOS_PESSOA = ("nome", "cargo", "empresa", "dor", "orcamento", "prazo")


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
chave_llm = None

# estado por sala: offsets por pcm, acumulados, controle de extração
salas: dict[str, dict] = {}


# ─── Supabase da plataforma (service_role) ───────────────────────────────────

def _sb(caminho: str, dados: dict | list | None = None, metodo: str = "GET",
        prefer: str | None = None):
    req = urllib.request.Request(
        ENV["PLATAFORMA_SUPABASE_URL"] + caminho,
        data=json.dumps(dados).encode() if dados is not None else None,
        method=metodo,
        headers={"apikey": ENV["PLATAFORMA_SERVICE_ROLE"],
                 "Authorization": "Bearer " + ENV["PLATAFORMA_SERVICE_ROLE"],
                 "Content-Type": "application/json",
                 **({"Prefer": prefer} if prefer else {})})
    with urllib.request.urlopen(req, timeout=15) as resp:
        corpo = resp.read()
    return json.loads(corpo) if corpo else None


def buscar_chave_llm():
    linhas = _sb("/rest/v1/provedores_llm?slug=eq.openrouter&select=api_key&limit=1")
    return linhas[0]["api_key"] if linhas else None


def publicar(sala_id: str, evento: str, payload: dict):
    corpo = {"messages": [{"topic": f"sala:{sala_id}", "event": evento, "payload": payload}]}
    req = urllib.request.Request(
        ENV["PLATAFORMA_SUPABASE_URL"] + "/realtime/v1/api/broadcast",
        data=json.dumps(corpo).encode(),
        headers={"apikey": ENV["PLATAFORMA_SERVICE_ROLE"],
                 "Authorization": "Bearer " + ENV["PLATAFORMA_SERVICE_ROLE"],
                 "Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=10).read()


# ─── ASR: Deepgram (principal) + whisper local (reserva) ─────────────────────

def _wav(pcm: bytes) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(TAXA)
        w.writeframes(pcm)
    return buf.getvalue()


def _limpar(texto: str) -> str:
    if not texto:
        return ""
    for marca in ("[BLANK_AUDIO]", "[MUSIC]", "[MÚSICA", "[Música", "[Som de"):
        if marca in texto:
            return ""
    return " ".join(texto.split())


def cortar_no_silencio(pcm: bytes) -> bytes:
    """Recua o fim do bloco até a pausa mais funda da cauda.

    Sem isso o corte de tempo cai no meio da palavra e o ASR erra a ponta da
    frase (e a metade que sobra abre o bloco seguinte fora de contexto).
    """
    janela = int(TAXA * JANELA_CORTE_MS / 1000) * 2
    cauda = CAUDA_CORTE_SEG * BYTES_SEG
    if len(pcm) <= cauda + janela:
        return pcm
    inicio_busca = len(pcm) - cauda
    melhor_pos, melhor_rms = None, None
    for pos in range(inicio_busca, len(pcm) - janela, janela):
        r = audioop.rms(pcm[pos:pos + janela], 2)
        if melhor_rms is None or r < melhor_rms:
            melhor_pos, melhor_rms = pos, r
    # só vale a pena cortar se achou pausa de verdade
    if melhor_pos and melhor_rms is not None and melhor_rms < RMS_MINIMO:
        return pcm[:melhor_pos + janela]
    return pcm


def transcrever_deepgram(pcm: bytes, nomes: list[str] | None = None) -> str:
    chave = ENV.get("DEEPGRAM_API_KEY")
    if not chave:
        raise RuntimeError("DEEPGRAM_API_KEY ausente no reuniao.env")
    # smart_format desligado de propósito: em pt-BR ele trocava "um" por "1"
    # ("1 código", "1 print") — pontuação sozinha já resolve a leitura.
    # keyterm removido: no nova-3 só funciona em inglês; em pt-BR era ignorado.
    params = [("model", DG_MODELO), ("language", DG_IDIOMA),
              ("smart_format", "false"), ("punctuate", "true")]
    _ = nomes  # assinatura preservada pros chamadores; reforço de nomes não vale em pt-BR
    url = "https://api.deepgram.com/v1/listen?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, data=_wav(pcm), method="POST",
                                 headers={"Authorization": "Token " + chave,
                                          "Content-Type": "audio/wav"})
    with urllib.request.urlopen(req, timeout=25) as resp:
        d = json.load(resp)
    return d["results"]["channels"][0]["alternatives"][0]["transcript"].strip()


def transcrever_whisper(pcm: bytes) -> str:
    """Reserva local. Só entra se o Deepgram falhar (rede/cota)."""
    tmp = f"/tmp/reuniao-trecho-{os.getpid()}.wav"
    with open(tmp, "wb") as f:
        f.write(_wav(pcm))
    try:
        r = subprocess.run(
            [WHISPER, "-m", MODELO, "-f", tmp, "-l", "pt", "-nt", "-np"],
            capture_output=True, text=True, timeout=90)
        texto = (r.stdout or "").strip()
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass
    return texto


def transcrever(pcm: bytes, nomes: list[str] | None = None) -> str:
    try:
        return _limpar(transcrever_deepgram(pcm, nomes))
    except Exception as erro:
        print(f"deepgram falhou ({erro}) — caindo pro whisper local", flush=True)
        return _limpar(transcrever_whisper(pcm))


# ─── Dossiê (LLM barato via OpenRouter) ──────────────────────────────────────

def _llm(prompt: str, max_tokens: int = 220) -> dict | None:
    global chave_llm
    if not chave_llm:
        chave_llm = buscar_chave_llm()
    if not chave_llm:
        return None
    corpo = json.dumps({
        "model": "google/gemini-2.5-flash-lite",
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions", data=corpo,
        headers={"Authorization": "Bearer " + chave_llm,
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=25) as resp:
        texto = json.load(resp)["choices"][0]["message"]["content"].strip()
    if texto.startswith("```"):
        texto = texto.strip("`").replace("json", "", 1).strip()
    try:
        return json.loads(texto)
    except Exception:
        return None


def extrair_pessoa(fala_acumulada: str) -> dict:
    saida = _llm(
        "Desta transcrição da fala de UMA pessoa numa reunião comercial, extraia "
        "só o que ela disse explicitamente sobre si/sua empresa. Campos possíveis: "
        "nome, cargo, empresa, dor (problema que ela relatou), orcamento, prazo. "
        "Responda JSON puro só com campos encontrados (ex.: {\"empresa\":\"ACME\"}). "
        "Se nada, {}.\n\n" + fala_acumulada[-2000:])
    if not isinstance(saida, dict):
        return {}
    return {k: v for k, v in saida.items() if v and k in CAMPOS_PESSOA}


def extrair_combinados(transcricao_geral: str) -> dict:
    saida = _llm(
        "Desta transcrição de reunião comercial (falas com autor), liste o que foi "
        "COMBINADO até agora. Responda JSON puro: {\"combinados\":[\"...\"]} com frases "
        "curtas (decisões, compromissos, próximos passos ditos explicitamente). "
        "Se nada, {\"combinados\":[]}.\n\n" + transcricao_geral[-3000:], max_tokens=300)
    if isinstance(saida, dict) and isinstance(saida.get("combinados"), list):
        return {"combinados": [str(c) for c in saida["combinados"][:12]]}
    return {}


def upsert_dossie(sala: dict, peer_id: str, nome: str, dados: dict):
    _sb("/rest/v1/salas_reuniao_dossie?on_conflict=sala_id,peer_id",
        {"sala_id": sala["sala_id"], "tenant_id": sala["tenant_id"],
         "peer_id": peer_id, "nome": nome, "dados": dados,
         "atualizado_em": "now()"},
        metodo="POST", prefer="resolution=merge-duplicates")
    publicar(sala["sala_id"], "dossie", {"peerId": peer_id, "nome": nome, "dados": dados})


# ─── Ciclo por sala ──────────────────────────────────────────────────────────

def estado_da(sala_dir: str) -> dict | None:
    try:
        with open(os.path.join(sala_dir, "meta.json")) as f:
            meta = json.load(f)
    except Exception:
        return None
    if not meta.get("tenant_id"):
        return None
    chave = sala_dir
    if chave not in salas:
        salas[chave] = {"sala_id": meta["sala_id"], "tenant_id": meta["tenant_id"],
                        "offsets": {}, "fala": {}, "extraido_len": {}, "dossie": {},
                        "geral": "", "ult_combinados": 0.0, "combinados": None}
    salas[chave]["meta"] = meta
    return salas[chave]


def processar_faixa(sala: dict, sala_dir: str, arquivo: str, fim_da_sala: bool):
    peer_id = arquivo[:-4]
    caminho = os.path.join(sala_dir, arquivo)
    tamanho = os.path.getsize(caminho)
    lido = sala["offsets"].get(peer_id, 0)
    novos = tamanho - lido
    if novos <= 0:
        return
    if not fim_da_sala and novos < TRECHO_SEG * BYTES_SEG:
        return
    # Teto por rodada: bloco gigante deixa o ASR lento e engole fala no meio do
    # silêncio. O que passar do teto fica pro próximo ciclo — nada se perde.
    novos = min(novos, MAX_TRECHO_SEG * BYTES_SEG)
    with open(caminho, "rb") as f:
        f.seek(lido)
        pcm = f.read(novos)
    if not pcm:
        return
    if audioop.rms(pcm, 2) < RMS_MINIMO:
        sala["offsets"][peer_id] = lido + len(pcm)   # silêncio: consome e segue
        return
    if not fim_da_sala:
        pcm = cortar_no_silencio(pcm)
    nomes = [p.get("nome") for p in sala["meta"].get("participantes", {}).values()
             if p.get("nome")]
    try:
        texto = transcrever(pcm, nomes)
    except Exception as erro:
        # Offset NÃO avança: o mesmo trecho é tentado de novo no próximo ciclo.
        print(f"ASR falhou em {peer_id}: {erro}", flush=True)
        return
    sala["offsets"][peer_id] = lido + len(pcm)
    if not texto:
        return
    quem = sala["meta"].get("participantes", {}).get(peer_id, {})
    nome = quem.get("nome") or "Participante"
    do_time = bool(quem.get("do_time"))
    _sb("/rest/v1/salas_reuniao_turnos",
        {"sala_id": sala["sala_id"], "tenant_id": sala["tenant_id"],
         "peer_id": peer_id, "nome": nome, "do_time": do_time, "texto": texto},
        metodo="POST", prefer="return=minimal")
    publicar(sala["sala_id"], "turno",
             {"peerId": peer_id, "nome": nome, "doTime": do_time, "texto": texto,
              "t": time.time()})
    sala["fala"][peer_id] = (sala["fala"].get(peer_id, "") + " " + texto)[-6000:]
    sala["geral"] = (sala["geral"] + f"\n{nome}: {texto}")[-9000:]

    # dossiê só de quem NÃO é do time (o dado que interessa é do contato)
    if do_time:
        return
    acumulado = sala["fala"][peer_id]
    if fim_da_sala or len(acumulado) - sala["extraido_len"].get(peer_id, 0) >= DOSSIE_CADA_CHARS:
        sala["extraido_len"][peer_id] = len(acumulado)
        try:
            novos_dados = extrair_pessoa(acumulado)
        except Exception as erro:
            print(f"extração pessoa falhou: {erro}", flush=True)
            return
        atual = sala["dossie"].setdefault(peer_id, {})
        if novos_dados and {**atual, **novos_dados} != atual:
            atual.update(novos_dados)
            try:
                upsert_dossie(sala, peer_id, nome, atual)
            except Exception as erro:
                print(f"upsert dossiê falhou: {erro}", flush=True)


def ciclo():
    if not os.path.isdir(BASE):
        return
    for nome_dir in os.listdir(BASE):
        sala_dir = os.path.join(BASE, nome_dir)
        if not os.path.isdir(sala_dir):
            continue
        sala = estado_da(sala_dir)
        if sala is None:
            continue
        fim = os.path.exists(os.path.join(sala_dir, "fim"))
        for arquivo in os.listdir(sala_dir):
            if arquivo.endswith(".pcm"):
                try:
                    processar_faixa(sala, sala_dir, arquivo, fim)
                except Exception as erro:
                    print(f"faixa {arquivo}: {erro}", flush=True)
        # combinados da reunião (bloco geral) — de tempos em tempos ou no fim
        if sala["geral"] and (fim or time.time() - sala["ult_combinados"] > COMBINADOS_CADA_SEG):
            sala["ult_combinados"] = time.time()
            try:
                combinados = extrair_combinados(sala["geral"])
                if combinados and combinados != sala["combinados"]:
                    sala["combinados"] = combinados
                    upsert_dossie(sala, "__geral__", "Combinados", combinados)
            except Exception as erro:
                print(f"combinados falhou: {erro}", flush=True)
        if fim:
            # tudo processado — apaga o áudio (privacidade: fica só o texto no banco)
            shutil.rmtree(sala_dir, ignore_errors=True)
            salas.pop(sala_dir, None)
            print(f"[{nome_dir}] fechada e limpa", flush=True)


if __name__ == "__main__":
    os.makedirs(BASE, exist_ok=True)
    while True:
        try:
            ciclo()
        except Exception as erro:
            print(f"erro no ciclo: {erro}", flush=True)
        time.sleep(3)
