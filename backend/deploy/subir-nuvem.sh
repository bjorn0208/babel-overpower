#!/bin/bash
# Sobe o back do Babel OS para um projeto Supabase na nuvem. NÃO roda nada destrutivo sem confirmação.
#
# Uso:
#   export SUPABASE_ACCESS_TOKEN=sbp_...            # conta dona do projeto (Dashboard → Account → Access Tokens)
#   export REF=abcdefghijklmnop                     # ref do projeto de destino
#   export DB_URL='postgresql://postgres.REF:SENHA@aws-0-...pooler.supabase.com:5432/postgres'   # Connect → Session pooler
#   MODO=existente bash backend/deploy/subir-nuvem.sh   # projeto que JÁ tem o schema (produção atual): só correções + funções
#   MODO=novo      bash backend/deploy/subir-nuvem.sh   # projeto vazio: schema completo + correções + buckets + funções
#   SECO=1 ...                                          # só mostra o que faria (padrão: SECO=1)
#
# Segredos das funções: crie backend/supabase/.env.nuvem (KEY=valor por linha; nunca commitar).
set -euo pipefail
cd "$(dirname "$0")/.."                       # backend/
: "${REF:?defina REF}"; : "${DB_URL:?defina DB_URL}"; : "${SUPABASE_ACCESS_TOKEN:?defina SUPABASE_ACCESS_TOKEN}"
MODO=${MODO:-existente}; SECO=${SECO:-1}
roda(){ echo "+ $*"; [ "$SECO" = "1" ] || "$@"; }
psqlf(){ echo "+ psql < $1"; [ "$SECO" = "1" ] || psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$1"; }

echo "== Destino: $REF  · modo: $MODO  · seco: $SECO"
command -v psql >/dev/null || { echo "precisa do psql (brew install libpq)"; exit 1; }
if grep -rlE "127\.0\.0\.1|localhost:54321|host\.docker\.internal" supabase/migrations/*.sql >/dev/null 2>&1; then echo "ATENÇÃO: migration com endereço local"; exit 1; fi
if [ "$SECO" != "1" ]; then read -r -p "Digite o REF ($REF) para confirmar: " c; [ "$c" = "$REF" ] || { echo "cancelado"; exit 1; }; fi

roda supabase link --project-ref "$REF"

if [ "$MODO" = "novo" ]; then
  TMP=$(mktemp -d)
  grep -v -E '^\\(restrict|unrestrict) ' schema.sql | sed "s#https://pdamarjxcmkzbhqxtapl\.supabase\.co#https://$REF.supabase.co#g" > "$TMP/schema.sql"
  psqlf local/pre-carga.sql
  echo "+ psql < schema.sql (erros em schemas gerenciados são esperados)"; [ "$SECO" = "1" ] || psql "$DB_URL" -q -o /dev/null -f "$TMP/schema.sql" 2> "$TMP/erros.log" || true
  psqlf local/pos-carga.sql
  psqlf local/buckets.sql
fi

# Correções do Claude (idempotentes: podem rodar mais de uma vez)
for m in supabase/migrations/2026*.sql; do psqlf "$m"; done

# Segredos das funções
if [ -f supabase/.env.nuvem ]; then roda supabase secrets set --project-ref "$REF" --env-file supabase/.env.nuvem; else echo "(sem supabase/.env.nuvem — segredos não enviados)"; fi

# Funções (96, entrypoint em subpasta — ver ATIVACAO-GO-LIVE.md)
roda supabase functions deploy --project-ref "$REF" --use-api --jobs 4

cat <<TXT

== Depois do deploy (manual, nesta ordem):
1. Vault: select vault.create_secret('https://$REF.supabase.co','project_url'); e a service_role_key (Dashboard → API).
2. LLM: inserir/atualizar a linha 'openrouter' em provedores_llm com a chave real.
3. Auth → URL Configuration: Site URL = domínio do front; Redirect URLs.
4. Front: editar nova-frontend-babel/config.js (supabaseUrl=https://$REF.supabase.co, supabaseKey=anon/publishable) e publicar a pasta (vercel.json/netlify.toml prontos).
5. Webhooks (Z-API, WhatsApp, Instagram, Google) para https://$REF.supabase.co/functions/v1/<função> — só no corte.
6. Crons por último (pg_cron), depois do smoke test.
TXT
