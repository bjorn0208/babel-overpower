#!/bin/bash
# Babel OS - serve a pasta em http://localhost:8080 e abre o app (Mac / Linux)
cd "$(dirname "$0")"
PORT=8080
if [ -x edge-tts/.venv/bin/python ]; then
  edge-tts/.venv/bin/python edge-tts/server.py --port 3100 >/tmp/babel-edge.log 2>&1 &
  echo "Vozes BR (Edge) em http://localhost:3100"
else
  echo "Aviso: vozes BR indisponiveis (venv do Edge sumiu). As vozes do navegador seguem normais."
fi
if command -v node >/dev/null; then
  node cerebro/server.js >/tmp/babel-cerebro.log 2>&1 &
  echo "Cérebro Babel em http://localhost:3078"
else
  echo "Aviso: cérebro indisponível (node não encontrado). As respostas locais seguem normais."
fi
if [ -x ../backend/stt/iniciar-ouvido.sh ] && [ -x ../backend/stt/whisper.cpp/build-cpu/bin/whisper-server ]; then
  nohup bash ../backend/stt/iniciar-ouvido.sh >/tmp/babel-ouvido.log 2>&1 &
  echo "Ouvido do Mentor (Whisper no Mac) em http://localhost:3079"
else
  echo "Aviso: ouvido local indisponível (backend/stt). Com GROQ_API_KEY no ~/.bashrc o cérebro transcreve pela Groq."
fi
( command -v open >/dev/null && open "http://localhost:$PORT/" ) || ( command -v xdg-open >/dev/null && xdg-open "http://localhost:$PORT/" )
echo
echo "Babel OS em http://localhost:$PORT/ — deixe esta janela aberta."
echo "No Chrome, só na primeira vez: clique no cadeado ao lado do endereço → Microfone → Permitir."
echo
python3 servir.py $PORT
