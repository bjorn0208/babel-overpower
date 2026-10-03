#!/usr/bin/env python3
"""Testa o TTS WebSocket da Fish: mede TTFB e valida PCM 8 kHz direto.

Uso: python3 test_ws_tts.py <chave_fish>
"""
import sys
import time

sys.path.insert(0, "/opt/babel")
import fish

chave = sys.argv[1]

for taxa in (8000, 16000, 44100):
    try:
        t0 = time.time()
        ws = fish.tts_stream_abrir(chave, sample_rate=taxa)
        t_abrir = time.time() - t0
        fish.tts_stream_texto(ws, "Oi, tudo bem? Aqui é a Bel, da Babel!")
        fish.tts_stream_fim(ws)
        t1 = None
        total = 0
        n = 0
        for chunk in fish.tts_stream_chunks(ws):
            if t1 is None:
                t1 = time.time() - t0
            total += len(chunk)
            n += 1
        fish.tts_stream_fechar(ws)
        dur_ms = total // 16   # PCM 8k s16le → 16 bytes/ms
        print(f"taxa {taxa}: abrir {t_abrir:.2f}s · 1º áudio {t1 and f'{t1:.2f}s'} · "
              f"{n} chunks · {total} bytes (~{dur_ms} ms de áudio a 8 kHz)")
        break   # a primeira taxa que funcionar é a que usamos
    except Exception as erro:
        print(f"taxa {taxa}: FALHOU — {erro}")
