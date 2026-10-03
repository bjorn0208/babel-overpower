#!/usr/bin/env python3
"""Smart Turn v3 (Pipecat, BSD-2) — decide SEMANTICAMENTE se a pessoa terminou
de falar, em vez de esperar um silêncio fixo. 8 MB, CPU-only, suporta pt.

Uso no motor:
    from smart_turn import turno_completo
    completo, prob = turno_completo(pcm_slin8k)   # None = modelo indisponível

Carrega preguiçosamente; qualquer falha (sem modelo, sem libs) vira fallback
silencioso — o motor segue com as heurísticas de conteúdo sem quebrar.
"""
import audioop
import os

import numpy as np

MODELO = os.environ.get("SMART_TURN_MODELO", "/opt/babel/smart-turn-v3.2-cpu.onnx")
LIMIAR = float(os.environ.get("SMART_TURN_LIMIAR", "0.5"))

_sessao = None
_extrator = None
_erro_fatal = False


def _carregar():
    global _sessao, _extrator, _erro_fatal
    if _erro_fatal or _sessao is not None:
        return _sessao is not None
    try:
        import onnxruntime as ort
        from transformers import WhisperFeatureExtractor
        op = ort.SessionOptions()
        op.intra_op_num_threads = 2   # não disputa CPU com Asterisk/whisper
        _sessao = ort.InferenceSession(MODELO, sess_options=op,
                                       providers=["CPUExecutionProvider"])
        _extrator = WhisperFeatureExtractor(feature_size=80)
        return True
    except Exception:
        _erro_fatal = True
        return False


def turno_completo(pcm_slin8k, limiar=None):
    """PCM s16le 8 kHz → (completo: bool, probabilidade) ou (None, None)."""
    if not _carregar():
        return None, None
    corte = LIMIAR if limiar is None else float(limiar)
    try:
        # 8 kHz → 16 kHz, últimos 8 s, float32 normalizado
        pcm16k, _ = audioop.ratecv(pcm_slin8k, 2, 1, 8000, 16000, None)
        audio = np.frombuffer(pcm16k, dtype=np.int16).astype(np.float32) / 32768.0
        audio = audio[-8 * 16000:]
        feats = _extrator(audio, sampling_rate=16000, return_tensors="np",
                          padding="max_length", max_length=8 * 16000,
                          truncation=True, do_normalize=True)
        entrada = feats.input_features.squeeze(0).astype(np.float32)[None, ...]
        saida = _sessao.run(None, {"input_features": entrada})
        prob = float(saida[0].flatten()[0])
        return prob >= corte, prob
    except Exception:
        return None, None
