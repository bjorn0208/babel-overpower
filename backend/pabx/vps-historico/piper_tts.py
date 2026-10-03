#!/usr/bin/env python3
"""Voz LOCAL da IA ligadora (Piper) — substitui o TTS remoto do Fish Audio.

Por que existe: o Fish roda fora do Brasil. Só a viagem de rede até o servidor
deles custa ~634 ms medidos daqui, e isso acontece a cada resposta. O Piper
sintetiza na própria VPS: ~163 ms para uma frase inteira, zero rede.

Expõe a MESMA interface do fish.py (tts, tts_stream_*), então o motor troca de
voz sem reescrever a lógica de conversa.

Voz padrão: pt_BR-dii-high — feminina (F0 medido 197 Hz), mantendo a identidade
da Bel. As outras vozes pt-BR do Piper (faber, cadu, miro) são masculinas.
"""
import audioop
import io
import os
import queue as queue_mod
import threading
import wave

DIR = os.environ.get("PIPER_DIR", "/opt/babel/piper")
VOZ_BEL = os.environ.get("PIPER_VOZ", "pt_BR-dii-high")

# Vozes pt-BR instaladas. dii é a única feminina.
VOZES = {
    "pt_BR-dii-high": "pt_BR-dii-high.onnx",
    "pt_BR-faber-medium": "pt_BR-faber-medium.onnx",
    "pt_BR-cadu-medium": "pt_BR-cadu-medium.onnx",
    "pt_BR-miro-high": "pt_BR-miro-high.onnx",
}

_vozes_carregadas = {}
_lock = threading.Lock()          # PiperVoice não promete ser thread-safe


def _carregar(nome):
    """Carrega o modelo uma vez por processo (a carga custa ~500 ms)."""
    nome = nome if nome in VOZES else VOZ_BEL
    with _lock:
        if nome not in _vozes_carregadas:
            from piper import PiperVoice
            _vozes_carregadas[nome] = PiperVoice.load(os.path.join(DIR, VOZES[nome]))
        return _vozes_carregadas[nome]


def _sintetizar_slin8k(texto, voz_id=None, speed=1.0):
    """texto → PCM s16le 8 kHz mono (formato do AudioSocket), direto.

    O Piper entrega 22050 Hz; convertemos com audioop (nativo, ~1 ms) em vez de
    chamar ffmpeg, que custaria um processo novo a cada frase.
    """
    texto = (texto or "").strip()
    if not texto:
        return b""
    voz = _carregar(voz_id or VOZ_BEL)
    buf = io.BytesIO()
    with _lock:
        with wave.open(buf, "wb") as w:
            voz.synthesize_wav(texto, w)
    buf.seek(0)
    with wave.open(buf, "rb") as w:
        taxa = w.getframerate()
        canais = w.getnchannels()
        pcm = w.readframes(w.getnframes())
    if canais > 1:
        pcm = audioop.tomono(pcm, 2, 0.5, 0.5)
    if taxa != 8000:
        pcm, _ = audioop.ratecv(pcm, 2, 1, taxa, 8000, None)
    return pcm


# ---------------- interface compatível com fish.py ----------------

def tts(chave, texto, voz_id=None, speed=1.0):
    """texto → wav 8 kHz. `chave` é ignorada (não há API remota)."""
    pcm = _sintetizar_slin8k(texto, voz_id, speed)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(8000)
        w.writeframes(pcm)
    return buf.getvalue()


def tts_slin8k(texto, voz_id=None, speed=1.0):
    """Atalho sem passar por wav — é o que o motor realmente quer."""
    return _sintetizar_slin8k(texto, voz_id, speed)


class _Sessao:
    """Espelha a sessão de streaming do Fish, mas tudo acontece localmente.

    O motor manda texto e chama flush; a thread receptora dele consome
    tts_stream_chunks() e alimenta o tocador. Mantemos o mesmo contrato para
    não mexer no laço de conversa.
    """

    def __init__(self, voz_id, speed):
        self.voz_id = voz_id
        self.speed = speed
        self.entrada = queue_mod.Queue()
        self.viva = True


def tts_stream_abrir(chave, voz_id=None, sample_rate=8000, speed=1.0):
    return _Sessao(voz_id, speed)


def tts_stream_texto(s, texto):
    s.entrada.put(("texto", texto))


def tts_stream_flush(s):
    s.entrada.put(("flush", None))


def tts_stream_fim(s):
    s.entrada.put(("fim", None))


def tts_stream_chunks(s):
    """Gera PCM 8 kHz. Bloqueia esperando texto, igual ao WebSocket do Fish.

    Entrega em pedaços de 200 ms para o tocador começar a falar antes da frase
    inteira estar pronta e continuar respondendo a barge-in.
    """
    acumulado = []
    while s.viva:
        try:
            tipo, valor = s.entrada.get(timeout=30)
        except queue_mod.Empty:
            continue
        if tipo == "texto":
            if valor:
                acumulado.append(valor)
        elif tipo == "flush":
            texto = " ".join(acumulado).strip()
            acumulado = []
            if not texto:
                continue
            try:
                pcm = _sintetizar_slin8k(texto, s.voz_id, s.speed)
            except Exception:
                continue
            PEDACO = 3200          # 200 ms de slin 8 kHz
            for i in range(0, len(pcm), PEDACO):
                if not s.viva:
                    return
                yield pcm[i:i + PEDACO]
        elif tipo == "fim":
            return


def tts_stream_fechar(s):
    try:
        s.viva = False
        s.entrada.put(("fim", None))
    except Exception:
        pass


# Conversões — mesmas assinaturas do fish.py, para importação intercambiável.

def wav_para_slin8k(wav_bytes):
    try:
        with wave.open(io.BytesIO(wav_bytes), "rb") as w:
            taxa, canais = w.getframerate(), w.getnchannels()
            pcm = w.readframes(w.getnframes())
        if canais > 1:
            pcm = audioop.tomono(pcm, 2, 0.5, 0.5)
        if taxa != 8000:
            pcm, _ = audioop.ratecv(pcm, 2, 1, taxa, 8000, None)
        return pcm
    except Exception:
        import subprocess
        p = subprocess.run(
            ["ffmpeg", "-loglevel", "quiet", "-i", "pipe:0",
             "-f", "s16le", "-ar", "8000", "-ac", "1", "pipe:1"],
            input=wav_bytes, capture_output=True)
        return p.stdout


def slin8k_para_wav16k(pcm_bytes):
    pcm16, _ = audioop.ratecv(pcm_bytes, 2, 1, 8000, 16000, None)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(pcm16)
    return buf.getvalue()
