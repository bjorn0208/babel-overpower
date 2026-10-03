#!/bin/bash
# Cria os usuários de teste no Supabase LOCAL (senha Teste@123456) e aplica o seed de demonstração.
# Uso: bash backend/local/testes/usuarios-teste.sh   (depois de restaurar-local.sh)
set -euo pipefail
cd "$(dirname "$0")"
API=http://127.0.0.1:54321
KEY=$(cd .. && supabase status -o json 2>/dev/null | python3 -c 'import sys,json;print(json.load(sys.stdin)["SERVICE_ROLE_KEY"])')
DB=supabase_db_sistemababel-local
criar(){ # email -> imprime id
  curl -s -X POST "$API/auth/v1/admin/users" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"Teste@123456\",\"email_confirm\":true}" >/dev/null
  docker exec $DB psql -U postgres -d postgres -Atc "select id from auth.users where email='$1'"
}
USR=$(criar usuario@babel.local); ADM=$(criar admin@babel.local); criar teste@babel.com >/dev/null
curl -s -X POST "$API/auth/v1/admin/users" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d "{\"email\":\"babel123@babel.local\",\"password\":\"babel123\",\"email_confirm\":true}" >/dev/null  # usuário curto: babel123 / babel123
docker exec $DB psql -U postgres -d postgres -q -c "set app.bypass_profile_guard = 'true';
  insert into profiles(id,email,full_name,system_role) values
   ('$USR','usuario@babel.local','Dominic','user'),('$ADM','admin@babel.local','Admin Babel','platform_admin')
  on conflict (id) do update set system_role=excluded.system_role, email=excluded.email, full_name=excluded.full_name;
  insert into profiles(id,email,system_role) select id,email,'user' from auth.users where email='teste@babel.com' on conflict (id) do nothing;"
docker cp buckets.sql $DB:/tmp/buckets.sql && docker exec $DB psql -U postgres -d postgres -q -f /tmp/buckets.sql
sed "s/252e30e8-894c-4854-bb93-9152f2364857/$USR/" seed-demo.sql | docker exec -i $DB psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q
docker exec $DB psql -U postgres -d postgres -Atc "select u.email, coalesce(p.system_role,'-') from auth.users u left join profiles p using(id) order by 1"
