#!/bin/bash
# Babel — ativação única (Docker + banco + cérebro + voz + ouvido + front).
# Uso:
#   bash babel.sh up [--abrir] [servico...]  sobe tudo (ou só os listados); idempotente
#   bash babel.sh down [--db] [servico...]    para a frente (ou só os listados); --db para o banco junto
#   bash babel.sh status                      tabela de serviços + saúde
#   bash babel.sh testar                      smoke test das 5 portas (exit 1 se algo falhar)
#   bash babel.sh logs <servico>              segue o log (cerebro|voz|ouvido|front|tunel)
#   bash babel.sh tunel                       sobe o túnel Cloudflare (http2) e mostra a URL
#   bash babel.sh tunel-stop                  derruba o túnel
# Serviços: db cerebro voz ouvido front. Portas: 54321 3078 3100 3079 8080.
# NUNCA roda db push/reset/deploy: a CLI está linkada no projeto REMOTO.
set -u
cd "$(dirname "$0")/../.." || exit 1          # raiz do projeto
RAIZ="$PWD"
FRONT="$RAIZ/nova-frontend-babel"
BACK="$RAIZ/backend"
SUPABASE="$(command -v supabase || echo "$HOME/.local/bin/supabase")"
CLOUDFLARED="$(command -v cloudflared || echo "$HOME/.local/bin/cloudflared")"

pid_de() { # pid_de <porta> -> PID ouvindo na porta (vazio se ninguém)
  lsof -iTCP:"$1" -sTCP:LISTEN -t -n -P 2>/dev/null | head -n 1
}
vivo() { # vivo <pid> -> 0 se o processo existe
  [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null
}
espera_porta() { # espera_porta <porta> <segundos> -> 0 se abriu
  local p="$1" fim=$((SECONDS + $2))
  while [ "$SECONDS" -lt "$fim" ]; do
    [ -n "$(pid_de "$p")" ] && return 0
    sleep 1
  done
  return 1
}
http() { # http <url> -> código HTTP (000 se falhou)
  curl -s -m 5 -o /dev/null -w "%{http_code}" "$1" 2>/dev/null || echo 000
}
sobe_fundo() { # sobe_fundo <nome> <dir> <comando...> (nohup + pidfile + log; lê o PID do pidfile)
  # NÃO capturar com $(...): o filho herdaria o pipe e o chamador travaria.
  # O `;` antes do `&` garante que só o nohup vai p/ fundo ($! = PID dele).
  local nome="$1" dir="$2"; shift 2
  ( cd "$dir" || exit 1; nohup "$@" >"/tmp/babel-$nome.log" 2>&1 < /dev/null & echo $! >"/tmp/babel-$nome.pid" ) > /dev/null 2>&1
  sleep 1
}
adota() { # adota <nome> <porta> -> PID se já tem alguém na porta (registra pidfile)
  local p
  p="$(pid_de "$2")"
  if [ -n "$p" ]; then echo "$p" >"/tmp/babel-$1.pid"; echo "$p"; return 0; fi
  return 1
}
para_um() { # para_um <nome> <porta>
  local p f="/tmp/babel-$1.pid"
  [ -f "$f" ] && p="$(cat "$f" 2>/dev/null)" || p=""
  vivo "$p" || p="$(pid_de "$2")"
  if vivo "$p"; then
    kill "$p" 2>/dev/null
    for _ in 1 2 3 4 5; do vivo "$p" || break; sleep 1; done
    vivo "$p" && kill -9 "$p" 2>/dev/null
    echo "  $1 parado (era PID $p)"
  else
    echo "  $1 já estava parado"
  fi
  rm -f "$f"
}

# ---------- banco (Docker/Supabase) ----------
up_db() {
  if [ "$(http http://127.0.0.1:54321/rest/v1/)" = "200" ]; then
    echo "  db já está no ar (:54321)"
    return 0
  fi
  echo "  subindo Supabase local (Docker)..."
  ( cd "$BACK" && "$SUPABASE" start ) || { echo "  ERRO no supabase start"; return 1; }
  for _ in $(seq 1 36); do
    [ "$(http http://127.0.0.1:54321/rest/v1/)" = "200" ] && { echo "  db ok (:54321)"; return 0; }
    sleep 5
  done
  echo "  ERRO: Kong não respondeu em 3 min (:54321)"; return 1
}
down_db() {
  echo "  parando Supabase local..."
  ( cd "$BACK" && "$SUPABASE" stop ) || true
}

# ---------- frente ----------
up_cerebro() {
  local p; p="$(adota cerebro 3078)" && { echo "  cerebro já está no ar (PID $p :3078)"; return 0; }
  command -v node >/dev/null || { echo "  ERRO: node não encontrado"; return 1; }
  sobe_fundo cerebro "$FRONT" node cerebro/server.js; p="$(cat /tmp/babel-cerebro.pid 2>/dev/null)"
  espera_porta 3078 15 && echo "  cerebro ok (PID $p :3078)" || { echo "  ERRO: cerebro não abriu :3078 (ver /tmp/babel-cerebro.log)"; return 1; }
}
up_voz() {
  local p py="$FRONT/edge-tts/.venv/bin/python"
  p="$(adota voz 3100)" && { echo "  voz já está no ar (PID $p :3100)"; return 0; }
  [ -x "$py" ] || { echo "  AVISO: venv do Edge sumiu; voz do navegador segue normal"; return 0; }
  sobe_fundo voz "$FRONT" "$py" edge-tts/server.py --port 3100; p="$(cat /tmp/babel-voz.pid 2>/dev/null)"
  espera_porta 3100 20 && echo "  voz ok (PID $p :3100)" || { echo "  ERRO: voz não abriu :3100 (ver /tmp/babel-voz.log)"; return 1; }
}
up_ouvido() {
  local p
  p="$(adota ouvido 3079)" && { echo "  ouvido já está no ar (PID $p :3079)"; return 0; }
  if [ -x "$BACK/stt/iniciar-ouvido.sh" ] && [ -x "$BACK/stt/whisper.cpp/build-cpu/bin/whisper-server" ]; then
    sobe_fundo ouvido "$BACK/stt" bash iniciar-ouvido.sh; p="$(cat /tmp/babel-ouvido.pid 2>/dev/null)"
    espera_porta 3079 30 && echo "  ouvido ok (PID $p :3079)" || { echo "  ERRO: ouvido não abriu :3079 (ver /tmp/babel-ouvido.log)"; return 1; }
  else
    echo "  AVISO: ouvido local indisponível (backend/stt sem build); com GROQ_API_KEY o cérebro transcreve pela Groq"
  fi
}
up_front() {
  local p
  p="$(adota front 8080)" && { echo "  front já está no ar (PID $p :8080)"; return 0; }
  sobe_fundo front "$FRONT" python3 servir.py 8080; p="$(cat /tmp/babel-front.pid 2>/dev/null)"
  espera_porta 8080 15 && echo "  front ok (PID $p :8080)" || { echo "  ERRO: front não abriu :8080 (ver /tmp/babel-front.log)"; return 1; }
}

cmd_up() {
  local abrir=0 alvos=()
  for a in "$@"; do
    [ "$a" = "--abrir" ] && abrir=1 || alvos+=("$a")
  done
  [ "${#alvos[@]}" -eq 0 ] && alvos=(db cerebro voz ouvido front)
  local rc=0
  for s in "${alvos[@]}"; do
    case "$s" in
      db) up_db || rc=1 ;;
      cerebro|voz|ouvido|front) "up_$s" || rc=1 ;;
      *) echo "  serviço desconhecido: $s (db|cerebro|voz|ouvido|front)"; rc=1 ;;
    esac
  done
  echo
  cmd_status
  if [ "$abrir" = 1 ]; then
    ( command -v open >/dev/null && open "http://localhost:8080/" ) || true
  fi
  return "$rc"
}

cmd_down() {
  local com_db=0 alvos=()
  for a in "$@"; do
    [ "$a" = "--db" ] && com_db=1 || alvos+=("$a")
  done
  [ "${#alvos[@]}" -eq 0 ] && alvos=(front ouvido voz cerebro)
  for s in "${alvos[@]}"; do
    case "$s" in
      front) para_um front 8080 ;;
      ouvido) para_um ouvido 3079 ;;
      voz) para_um voz 3100 ;;
      cerebro) para_um cerebro 3078 ;;
      tunel) cmd_tunel_stop ;;
      *) echo "  serviço desconhecido: $s" ;;
    esac
  done
  [ "$com_db" = 1 ] && down_db
}

linha() { # linha <nome> <porta> <url-teste> <ok-aceito>
  local p code mark
  p="$(pid_de "$2")"
  if [ -z "$p" ]; then printf "%-8s porta %-5s FORA DO AR\n" "$1" "$2"; return 1; fi
  code="$(http "$3")"
  if [[ "$4" == *"$code"* ]]; then mark="ok ($code)"; else mark="PORTA ABERTA MAS TESTE=$code"; fi
  printf "%-8s porta %-5s PID %-6s %s\n" "$1" "$2" "$p" "$mark"
  [[ "$4" == *"$code"* ]]
}
cmd_status() {
  local rc=0
  linha db      54321 "http://127.0.0.1:54321/rest/v1/" "200" || rc=1
  linha cerebro 3078  "http://127.0.0.1:3078/api/info"  "200" || rc=1
  linha voz     3100  "http://127.0.0.1:3100/"          "200404" || rc=1
  linha ouvido  3079  "http://127.0.0.1:3079/"          "200" || rc=1
  linha front   8080  "http://127.0.0.1:8080/"          "302" || rc=1
  if [ -f /tmp/babel-tunel.url ]; then echo "tunel    $(cat /tmp/babel-tunel.url 2>/dev/null)"; fi
  echo "app: http://localhost:8080/  (login: babel123 / babel123)"
  return "$rc"
}

cmd_testar() {
  echo "== smoke test =="
  cmd_status && echo "TUDO VERDE" || { echo "FALHA (ver tabela acima + /tmp/babel-*.log)"; return 1; }
}

cmd_logs() {
  [ -n "${1:-}" ] || { echo "uso: babel.sh logs <cerebro|voz|ouvido|front|tunel>"; return 1; }
  tail -n 50 -f "/tmp/babel-$1.log"
}

cmd_tunel() {
  local p; p="$(pid_de 8080)"
  [ -n "$p" ] || { echo "o front (:8080) precisa estar no ar primeiro: babel.sh up front"; return 1; }
  [ -x "$CLOUDFLARED" ] || { echo "cloudflared não encontrado em $CLOUDFLARED"; return 1; }
  pkill -f "cloudflared tunnel --url" 2>/dev/null
  rm -f /tmp/babel-tunel.url
  nohup "$CLOUDFLARED" tunnel --protocol http2 --url http://127.0.0.1:8080 > /private/tmp/babel-tunel.log 2>&1 &
  echo $! > /tmp/babel-tunel.pid
  echo "aguardando URL do túnel..."
  for _ in $(seq 1 30); do
    grep -o 'https://[^ ]*\.trycloudflare\.com' /private/tmp/babel-tunel.log 2>/dev/null | head -n 1 > /tmp/babel-tunel.url
    [ -s /tmp/babel-tunel.url ] && { echo "túnel: $(cat /tmp/babel-tunel.url)"; echo "(a Vercel de teste precisa ser republicada para esta URL — ver TO-DE-LIST-7 T3)"; return 0; }
    sleep 2
  done
  echo "ERRO: URL não apareceu (ver /private/tmp/babel-tunel.log)"; return 1
}
cmd_tunel_stop() {
  pkill -f "cloudflared tunnel --url" 2>/dev/null
  rm -f /tmp/babel-tunel.pid /tmp/babel-tunel.url
  echo "túnel derrubado"
}

case "${1:-ajuda}" in
  up) shift; cmd_up "$@" ;;
  down) shift; cmd_down "$@" ;;
  status) cmd_status ;;
  testar) cmd_testar ;;
  logs) shift; cmd_logs "$@" ;;
  tunel) cmd_tunel ;;
  tunel-stop) cmd_tunel_stop ;;
  *) sed -n '2,14p' "$0" | sed 's/^# //' ;;
esac
