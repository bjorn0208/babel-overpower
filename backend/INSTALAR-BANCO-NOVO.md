# Instalar banco novo vazio (Supabase novo, e-mail novo)

Instalador do Babel OS em projeto Supabase NOVO, sem dado de cliente.
Decisões: D-002 (banco novo), P-001 (nasce vazio), D-006 (dado nunca no Git).
O projeto antigo (`pdamarjxcmkzbhqxtapl`) NÃO é tocado em nenhum passo.

## 0. Pré-requisitos (Theus)

- [ ] `SUPABASE_ACCESS_TOKEN` do e-mail novo (criar em
      supabase.com/dashboard/account/tokens) — só na hora, via env
- [x] ref do projeto novo: `llsdqtbtuyuqxvepmniy` (`babel-os`, us-east-2, PG 17.6)
- [x] segredo de escrita: achado em
      `dados/complementos-20260926-1919/privado/arquivos-da-raiz/.env.md`
      (Token sbp_ + service_role; uso na hora, nunca impresso)
- [x] INSTALADO em 29/09: 295 tabelas, 758 policies, 452 funções,
      RLS em 295/295, 4 funções no ref novo, 0 no antigo [medido no banco]
- [ ] nome do projeto Vercel alvo (ver §5 — há deploys paralelos em curso)

## 1. Apontar o schema para o projeto novo

O `schema.sql` (2,4 MB, 352 tabelas, 0 linhas de dados [medido]) tem 4 URLs
do projeto antigo dentro de funções SQL (linhas 1020, 6837, 8358, 19136).
Gerar a cópia nova por substituição auditável — o diff deve mostrar
EXATAMENTE essas 4 linhas, nada mais:

```sh
python3 dados/ferramentas/gerar_instalador_banco_novo.py \
  backend/schema.sql pdamarjxcmkzbhqxtapl llsdqtbtuyuqxvepmniy /tmp/instalador.sql
# esperado: 8180 statements | kept 6866 | dropped 1314
TOK=$(python3 -c "txt=open('dados/complementos-20260926-1919/privado/arquivos-da-raiz/.env.md').read();print([l.split('- ',1)[1].strip() for l in txt.splitlines() if l.strip().startswith('Token- ')][0])")
SUPABASE_ACCESS_TOKEN="$TOK" supabase link --project-ref llsdqtbtuyuqxvepmniy --workdir backend --yes
SUPABASE_ACCESS_TOKEN="$TOK" supabase db query --linked --file /tmp/instalador.sql --workdir backend
```

## 2. Subir a estrutura

```sh
cd backend
SUPABASE_ACCESS_TOKEN=<redigido> supabase link --project-ref "$NEW_REF"
SUPABASE_ACCESS_TOKEN=<redigido> supabase db push --file /tmp/schema-novo.sql
```

Extensões exigidas (13, todas padrão Supabase): pg_cron, pg_net, citext,
hypopg, moddatetime, pg_stat_statements, pg_trgm, pgcrypto, pgmq,
supabase_vault, unaccent, uuid-ossp, vector.

## 3. Conferência (só leitura)

```sql
select count(*) from information_schema.tables where table_schema='public';
-- esperado: 318 (errata 29/09: o dump tem 352 CREATE TABLE no total, mas 57
-- são em schemas gerenciados; em public são 295 tabelas + 23 views = 318)
select count(*) from pg_policies;            -- esperado: 760
select count(*) from pg_extension;           -- esperado: >= 13
select count(*) from cron.job;               -- anotar; NÃO ativar nada (§4)
```

## 4. Travas antes de ligar qualquer coisa

1. Cron, filas, campanhas e webhooks: DESLIGADOS até o §6.
2. Vault/segredos: recriar no destino (ciphertext não se copia).
   Nomes em `dados/configuracoes/privado/recovered-edge-secrets.json`
   (só nomes; valores na hora, via env).
3. Defeito herdado já corrigido na obra (`87af990`, repo sistemababel):
   `cron-tags-curadoria` deve chamar `preencher_candidatos_tag`.
   Conferir na edge antes do deploy.

## 5. Frontend na Vercel nova — FEITO 29/09

- Alvo: `babel-os-login-previa` (conta nova `sistemababel`, 1 projeto só).
  Token em `.env` (raiz). Conta antiga (`theusveyra`, 54 projetos) NÃO mexida.
- Deploy: `cd babel-os-login-previa && vercel link --token $T
  --scope sistemababel --project babel-os-login-previa --yes &&
  vercel deploy --token $T --prod --yes` (conteúdo = pasta homônima).
- Prova: `https://babel-os-login-previa.vercel.app` → 200, título
  "entrar · babel-os" [medido]. Envs: 0 (página estática).

## 6. Corte (só com ok explícito)

Restaurar = estrutura pronta (§3 ok) → Auth/Storage/Realtime → edges →
frontend → ensaiar fluxos e isolamento → SÓ ENTÃO crons/filas.

Volta: o projeto antigo segue intacto; o novo se apaga sem perda.
