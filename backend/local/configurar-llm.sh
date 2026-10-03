#!/bin/bash
# Liga o motor do agente no banco LOCAL: grava a chave do OpenRouter em provedores_llm (slug 'openrouter').
# Uso: OPENROUTER_API_KEY=sk-or-... bash backend/local/configurar-llm.sh
# (a chave não é impressa; na nuvem, faça o mesmo update pelo SQL Editor do projeto)
set -euo pipefail
: "${OPENROUTER_API_KEY:?defina OPENROUTER_API_KEY}"
DB=supabase_db_sistemababel-local
docker exec -i -e K="$OPENROUTER_API_KEY" $DB sh -c 'psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -v k="$K"' <<'SQL'
insert into provedores_llm (nome, slug, base_url, api_key, is_active)
values ('OpenRouter', 'openrouter', 'https://openrouter.ai/api/v1', :'k', true)
on conflict (slug) do update set api_key = excluded.api_key, base_url = excluded.base_url, is_active = true, updated_at = now();
SQL
docker exec $DB psql -U postgres -d postgres -Atc "select slug, is_active, length(api_key)>20 as chave_ok from provedores_llm where slug='openrouter'"
echo "Pronto. Reinicie as funções para limpar o cache: docker restart supabase_edge_runtime_sistemababel-local"
