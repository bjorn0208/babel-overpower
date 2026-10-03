#!/usr/bin/env python3
"""Cliente Fish Audio (voz e ouvidos da IA ligadora) + conversões de áudio.

ASR: fala do cliente (wav) → texto pt-BR
TTS: texto → voz natural (wav), com voz clonável via reference_id
Conversões: telefone usa slin 8 kHz; Fish trabalha melhor em 16 kHz.
"""
import json
import subprocess
import urllib.request

import msgpack

API = "https://api.fish.audio/v1"


def asr(chave, wav_bytes, idioma="pt"):
    """Transcreve áudio wav → texto."""
    corpo = msgpack.packb({
        "audio": wav_bytes,
        "language": idioma,
        "ignore_timestamps": True,
    })
    req = urllib.request.Request(API + "/asr", data=corpo, headers={
        "Authorization": "Bearer " + chave,
        "Content-Type": "application/msgpack",
    })
    with urllib.request.urlopen(req, timeout=25) as resp:
        dados = resp.read()
    try:
        return (msgpack.unpackb(dados) or {}).get("text", "")
    except Exception:
        try:
            return json.loads(dados).get("text", "")
        except Exception:
            return ""


# Voz padrão da Bel: feminina brasileira, alegre (Isabela). Trocável por campanha.
VOZ_BEL = "5661bf8cb97740fcb10d2f756abf7779"


def tts(chave, texto, voz_id=None, speed=1.0):
    """Sintetiza texto → wav com o modelo S2 (emoção via tags [alegre], [rindo]…).
    voz_id = reference_id de voz da Fish; se vazio, usa a voz da Bel."""
    corpo = {"text": texto, "format": "wav", "latency": "balanced",
             "reference_id": voz_id or VOZ_BEL}
    if speed and abs(speed - 1.0) > 0.01:
        corpo["prosody"] = {"speed": speed, "volume": 0}
    req = urllib.request.Request(API + "/tts", data=msgpack.packb(corpo), headers={
        "Authorization": "Bearer " + chave,
        "Content-Type": "application/msgpack",
        "model": "s2",  # S2 = controle de emoção por marcadores no texto
    })
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


# ---------- TTS em streaming (WebSocket tts/live) ----------
# O texto entra aos pedaços (conforme o LLM gera) e o áudio sai em chunks
# conforme é sintetizado. TTFB ~300 ms no modo "balanced" — contra ~1 s do
# HTTP por frase. Pedimos PCM já em 8 kHz: zero conversão até o telefone.

import audioop as _audioop

try:
    import websocket  # websocket-client
except Exception:      # sem a lib, o motor cai no TTS HTTP sem quebrar
    websocket = None


def tts_stream_abrir(chave, voz_id=None, sample_rate=8000, speed=1.0):
    """Abre a sessão de TTS ao vivo. Devolve o websocket pronto pra receber texto."""
    if websocket is None:
        raise RuntimeError("websocket-client não instalado")
    ws = websocket.create_connection(
        "wss://api.fish.audio/v1/tts/live",
        header=[f"Authorization: Bearer {chave}", "model: s2"],
        timeout=15)
    req = {"text": "", "chunk_length": 120, "format": "pcm",
           "sample_rate": sample_rate, "normalize": True, "latency": "balanced",
           "reference_id": voz_id or VOZ_BEL, "temperature": 0.7, "top_p": 0.7}
    if speed and abs(speed - 1.0) > 0.01:
        req["prosody"] = {"speed": speed, "volume": 0}
    ws.send_binary(msgpack.packb({"event": "start", "request": req}))
    ws._taxa = sample_rate      # guardado p/ conversão no consumo
    ws._ratecv = None
    return ws


def tts_stream_texto(ws, texto):
    """Empurra um pedaço de texto (frase/palavras) pra sessão."""
    ws.send_binary(msgpack.packb({"event": "text", "text": texto + " "}))


def tts_stream_flush(ws):
    """Força a síntese do texto já enviado SEM fechar a sessão — é o que
    permite UMA sessão por ligação inteira (zero handshake por turno)."""
    ws.send_binary(msgpack.packb({"event": "flush"}))


def tts_stream_fim(ws):
    """Avisa que o texto acabou (o áudio restante ainda sai nos chunks)."""
    try:
        ws.send_binary(msgpack.packb({"event": "stop"}))
    except Exception:
        pass


def tts_stream_chunks(ws):
    """Gera chunks de PCM 8 kHz até o finish. Converte se a taxa vier maior."""
    while True:
        try:
            dados = ws.recv()
        except Exception:
            return
        if not isinstance(dados, (bytes, bytearray)):
            continue
        try:
            ev = msgpack.unpackb(dados)
        except Exception:
            continue
        evento = ev.get("event")
        if evento == "audio":
            pcm = ev.get("audio") or b""
            if not pcm:
                continue
            if ws._taxa != 8000:
                pcm, ws._ratecv = _audioop.ratecv(pcm, 2, 1, ws._taxa, 8000, ws._ratecv)
            yield pcm
        elif evento == "finish":
            return


def tts_stream_fechar(ws):
    try:
        ws.close()
    except Exception:
        pass


def wav_para_slin8k(wav_bytes):
    """wav (qualquer taxa) → PCM cru s16le 8 kHz mono (formato do AudioSocket)."""
    p = subprocess.run(
        ["ffmpeg", "-loglevel", "quiet", "-i", "pipe:0",
         "-f", "s16le", "-ar", "8000", "-ac", "1", "pipe:1"],
        input=wav_bytes, capture_output=True)
    return p.stdout


def slin8k_para_wav16k(pcm_bytes):
    """PCM cru 8 kHz → wav 16 kHz (o que o ASR entende melhor)."""
    p = subprocess.run(
        ["ffmpeg", "-loglevel", "quiet", "-f", "s16le", "-ar", "8000", "-ac", "1",
         "-i", "pipe:0", "-ar", "16000", "-f", "wav", "pipe:1"],
        input=pcm_bytes, capture_output=True)
    return p.stdout
