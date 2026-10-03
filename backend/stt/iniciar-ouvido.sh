#!/bin/bash
# Ouvido do Mentor: Whisper local (whisper.cpp) em http://127.0.0.1:3079 — transcreve a fala quando o cérebro não tem chave da Groq.
# Modelo padrão: base (leve, roda bem num Mac antigo). Para mais precisão: BABEL_WHISPER_MODELO=small-q5_1 bash iniciar-ouvido.sh
cd "$(dirname "$0")"
BIN=whisper.cpp/build-cpu/bin/whisper-server
MOD="modelos/ggml-${BABEL_WHISPER_MODELO:-base-q5_1}.bin"
[ -x "$BIN" ] || { echo "whisper-server não compilado (backend/stt/whisper.cpp/build-cpu)"; exit 1; }
[ -f "$MOD" ] || { echo "modelo não encontrado: $MOD"; exit 1; }
pkill -f "whisper-server.*--port 3079" 2>/dev/null
exec "$BIN" --host 127.0.0.1 --port 3079 -m "$MOD" -l pt -t "${BABEL_WHISPER_THREADS:-4}" -ng
