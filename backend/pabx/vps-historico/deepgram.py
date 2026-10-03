#!/usr/bin/env python3
"""Ouvidos da Bel via Deepgram — ASR treinado em telefone pt-BR.

Dois modos:
- transcrever(): batch (manda o trecho de fala já fechado, recebe o texto).
- SessaoDeepgram: streaming (transcreve ENQUANTO a pessoa fala; devolve o
  texto e o fim-de-turno no instante em que ela para — zero espera de ASR).
"""
import io
import json
import queue
import threading
import urllib.request
import wave

import websocket  # websocket-client

MODELO = "nova-2"
IDIOMA = "pt-BR"


def _wav8k(pcm):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(8000)
        w.writeframes(bytes(pcm))
    return buf.getvalue()


def transcrever(chave, pcm_slin8k, idioma=IDIOMA, modelo=MODELO):
    """Batch: PCM s16le 8 kHz → texto. Levanta exceção se a API falhar."""
    url = (f"https://api.deepgram.com/v1/listen?model={modelo}"
           f"&language={idioma}&smart_format=true&punctuate=true")
    req = urllib.request.Request(url, data=_wav8k(pcm_slin8k), method="POST",
                                 headers={"Authorization": "Token " + chave,
                                          "Content-Type": "audio/wav"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        d = json.load(resp)
    return d["results"]["channels"][0]["alternatives"][0]["transcript"].strip()


class SessaoDeepgram:
    """Streaming STT: alimenta PCM 8 kHz continuamente; entrega turnos prontos.

    A Deepgram detecta o fim da fala (endpointing) e manda speech_final — nesse
    instante o texto do turno JÁ está pronto, sem esperar o ASR rodar depois.
    """

    def __init__(self, chave, idioma=IDIOMA, modelo=MODELO, endpointing_ms=700):
        url = (f"wss://api.deepgram.com/v1/listen?model={modelo}"
               f"&language={idioma}&encoding=linear16&sample_rate=8000&channels=1"
               f"&punctuate=true&smart_format=true&interim_results=true"
               f"&endpointing={endpointing_ms}&vad_events=true")
        self.ws = websocket.create_connection(
            url, header=["Authorization: Token " + chave], timeout=10)
        self.turnos = queue.Queue()        # frases finalizadas (fim de turno)
        self.parcial = ""                  # transcrição interina do turno atual
        self.falando = False               # a pessoa está falando agora?
        self._vivo = True
        self._acc = ""                     # acumula is_final até o speech_final
        threading.Thread(target=self._receber, daemon=True).start()

    def _receber(self):
        while self._vivo:
            try:
                msg = self.ws.recv()
            except Exception:
                break
            if not msg:
                continue
            try:
                d = json.loads(msg)
            except Exception:
                continue
            tipo = d.get("type")
            if tipo == "SpeechStarted":
                self.falando = True
                continue
            if tipo != "Results":
                continue
            alt = (d.get("channel", {}).get("alternatives") or [{}])[0]
            texto = (alt.get("transcript") or "").strip()
            if d.get("is_final"):
                if texto:
                    self._acc = (self._acc + " " + texto).strip()
                self.parcial = self._acc
            else:
                self.parcial = (self._acc + " " + texto).strip()
            # fim de turno: a pessoa terminou de falar
            if d.get("speech_final") and self._acc:
                self.turnos.put(self._acc)
                self._acc = ""
                self.parcial = ""
                self.falando = False

    def alimentar(self, pcm):
        if self._vivo:
            try:
                self.ws.send_binary(bytes(pcm))
            except Exception:
                self._vivo = False

    def proximo_turno(self, timeout):
        """Bloqueia até um turno finalizar (endpoint) ou o timeout. str|None."""
        try:
            return self.turnos.get(timeout=timeout)
        except queue.Empty:
            return None

    def pegar_turno(self):
        """Texto acumulado do turno atual (final + interino) e ZERA — usado
        quando o NOSSO VAD decide o fim do turno (não dependemos do speech_final
        da Deepgram, que é intermitente com áudio contínuo)."""
        t = (self.parcial or self._acc).strip()
        self._acc = ""
        self.parcial = ""
        self.falando = False
        # esvazia também a fila de speech_final pra não vazar pro próximo turno
        try:
            while True:
                self.turnos.get_nowait()
        except queue.Empty:
            pass
        return t

    def resetar(self):
        self.pegar_turno()

    def fechar(self):
        self._vivo = False
        try:
            self.ws.send(json.dumps({"type": "CloseStream"}))
        except Exception:
            pass
        try:
            self.ws.close()
        except Exception:
            pass
