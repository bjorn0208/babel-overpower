#!/bin/bash
# Recria o banco LOCAL (Supabase CLI/Docker) a partir de backend/schema.sql, fiel à produção.
# Uso: bash backend/local/restaurar-local.sh   (APAGA o banco local e recarrega)
# Armadilhas tratadas: URLs da produção (pg_net) → local; \restrict do pg_dump 18;
# default privileges do destino (pré-carga); role consultor_dados_ro (pré/pós-carga).
set -euo pipefail
cd "$(dirname "$0")/.."                       # backend/
DB=supabase_db_sistemababel-local
TMP=$(mktemp -d)
grep -v -E '^\\(restrict|unrestrict) ' schema.sql \
  | sed 's#https://pdamarjxcmkzbhqxtapl\.supabase\.co#http://host.docker.internal:54321#g' > "$TMP/schema-local.sql"
[ "$(grep -c pdamarjxcmkzbhqxtapl "$TMP/schema-local.sql")" = 0 ] || { echo "ainda há URL de produção"; exit 1; }
supabase db reset || true                     # health check costuma estourar nesta máquina; o reset em si conclui
for f in local/pre-carga.sql "$TMP/schema-local.sql" local/pos-carga.sql local/conferencia.sql; do docker cp "$f" $DB:/tmp/; done
docker exec $DB psql -U postgres -v ON_ERROR_STOP=1 -q -f /tmp/pre-carga.sql
docker exec $DB psql -U postgres -v ON_ERROR_STOP=0 -q -o /dev/null -f /tmp/schema-local.sql 2> "$TMP/erros.log" || true
echo "erros na carga: $(grep -c ERROR "$TMP/erros.log") (esperado ~806, todos em schemas gerenciados) — log: $TMP/erros.log"
docker exec $DB psql -U postgres -v ON_ERROR_STOP=1 -q -f /tmp/pos-carga.sql
# Correções versionadas (supabase/migrations/*.sql) — aplicadas DEPOIS do schema base.
for m in supabase/migrations/*.sql; do
  docker cp "$m" $DB:/tmp/migration.sql
  docker exec $DB psql -U postgres -v ON_ERROR_STOP=1 -q -f /tmp/migration.sql && echo "migration ok: $(basename "$m")"
done
docker exec $DB psql -U postgres -f /tmp/conferencia.sql
