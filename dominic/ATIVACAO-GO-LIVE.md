# Guia de ativação (go-live) — Babel OS (Supabase cloud + Vercel)

Pesquisa feita em 2026-10-02 por subagente Sonnet (pesquisa) a pedido do Dominic; revisão e execução pelo Claude Opus 5.5.
Itens marcados **[verificar]** precisam de confirmação na documentação antes de executar.

## Aplicação direta ao Babel (notas do executor)
- O deploy das 96 funções usa `entrypoint` em subpasta (`functions/<slug>/pacote/<slug>/index.ts`) — há issues abertas na CLI (#3676, #3426) com esse padrão → **testar o deploy de 1 função cedo**; usar `--use-api` se necessário.
- Migrations `20261002020000…020400` já corrigem pgvector/search_path, LGPD, tabelas apagadas e B-03 — entram no `db push`.
- O CLI desta pasta está vinculado a `llsdqtbtuyuqxvepmniy` (`.temp/linked-project.json`) — conferir o destino antes de qualquer `push`/`deploy`.
- O motor já tem `modo_teste` na entrada; chave do LLM vem de `provedores_llm` (dado) → no cloud, inserir a linha `openrouter` com a chave real.

## 1. Ordem no Supabase cloud
1. Projeto novo (PG 17, região próxima dos usuários); anotar ref e senha.
2. `supabase login && supabase link --project-ref <REF>`
3. Extensões: confirmar vector, pg_cron, pg_net, pgmq, supabase_vault (Dashboard → Database → Extensions).
4. `supabase db push --dry-run` → `supabase db push` (jobs de cron só no fim).
5. `supabase secrets set --env-file ./supabase/.env.prod`; conferir com `supabase secrets list` (SUPABASE_URL/ANON/SERVICE_ROLE já são injetadas).
6. `supabase functions deploy` (todas) — se der timeout: `--use-api --jobs 4`; webhooks externos exigem `verify_jwt=false`; conferir com `supabase functions list`.
7. Vault não é portável: recriar com `select vault.create_secret('<valor>','<nome>','<desc>');` (mesmos nomes que funções/crons leem; incluir `project_url` e `service_role_key`).
8. pg_cron/pg_net e agendamentos **por último**.

Crons com URL nova — padrão: `net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name='project_url') || '/functions/v1/<fn>', headers := jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='service_role_key'),'Content-Type','application/json'), body := '{}'::jsonb)`. Se houver URL fixa: `select cron.alter_job(jobid, command := replace(command,'<ref_antigo>','<ref_novo>')) from cron.job;`.

## 2. Usuários e Storage
- Sem usuários reais → recriar. Com usuários reais: `supabase db dump --db-url "<SRC>" --schema auth --data-only -f auth.sql` (não restaurar `auth.schema_migrations`; hashes bcrypt migram; JWT secret muda → todos relogam).
- Dados: `supabase db dump --db-url "<SRC>" --data-only --use-copy -f data.sql`, restaurar após o `db push` com `SET session_replication_role = replica;`.
- Arquivos do Storage: dump leva só metadados; copiar via API (download/upload) ou endpoint S3 com `rclone`/`aws s3 sync` **[verificar]**.

## 3. Webhooks
- **WhatsApp Cloud API:** Callback `https://<REF>.supabase.co/functions/v1/<fn>`; GET de verificação devolve `hub.challenge` puro; POST valida `X-Hub-Signature-256` (HMAC-SHA256 do corpo bruto com App Secret, comparação em tempo constante); responder 200 em < 5 s e processar assíncrono. Trocar URL só no corte.
- **Z-API:** webhook por instância (receber + status); manter header de segurança (Client-Token **[verificar]**); instâncias de teste ≠ produção.
- **Instagram:** mesmo app Meta, mesma lógica; em modo Development só usuários com papel no app.
- **Google OAuth:** redirect `https://<REF>.supabase.co/auth/v1/callback` (+ callback da edge se houver), origem JS da Vercel; Supabase Auth → Site URL e Redirect URLs.

## 4. Front na Vercel
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (nunca service_role); VITE_* entram no build → redeploy após mudar.
- `vercel.json` com rewrite SPA para `/index.html`; build `vite build`, saída `dist`.
- CORS das edges com o domínio novo.
- Smoke tests: deep link 200; login e-mail/Google; RLS por tenant; `curl -i` em edge ≠ 404/500; GET do webhook devolve challenge; mensagem de teste atravessa fila → LLM → resposta em modo teste; Storage up/down; busca vetorial retorna.

## 5. Corte e rollback
1. Tudo em modo seguro (crons `active=false`: `select cron.alter_job(jobid, active:=false) from cron.job;`), smoke tests.
2. Sem envio real em teste: flag de envio "seco", números/instâncias de teste; esvaziar/pausar filas pgmq antes de ligar workers.
3. Nunca dois ambientes recebendo o mesmo webhook; idempotência por id da mensagem (`ON CONFLICT DO NOTHING`).
4. Trocar webhooks → sair do modo seco → ligar crons → monitorar 30–60 min.
- **Rollback:** voltar URLs dos webhooks, desativar crons novos, "Promote" do deploy anterior na Vercel; manter ambiente antigo 24–48 h.

## 6. Pegadinhas
- pgvector + `search_path=''` (já corrigido nas migrations do Babel).
- Índices HNSW/IVFFlat após carga; `maintenance_work_mem` baixo pode falhar.
- pg_net é assíncrono: conferir `net._http_response`; timeout 5 s; Authorization inválida = 401 silencioso.
- Edge: ~256 MB de memória; limites de tempo por plano **[verificar]**; `/health` leve sem LLM.
- `grep -r "<ref_antigo>\|localhost\|127.0.0.1\|54321"` em migrations, funções e front antes do deploy.
- Rate limits OpenRouter/Voyage/Z-API; pooler (6543) para muitas conexões.
- RLS: `select tablename from pg_tables where schemaname='public' and not rowsecurity;` deve vir vazio.

## Fontes
https://supabase.com/docs/guides/platform/migrating-to-supabase/postgres · https://supabase.com/docs/reference/cli/introduction · https://supabase.com/docs/guides/functions/function-configuration · https://supabase.com/docs/guides/local-development/cli/config · https://github.com/supabase/cli/issues/3676 · https://github.com/supabase/cli/issues/3426 · https://hookdeck.com/webhooks/platforms/guide-to-whatsapp-webhooks-features-and-best-practices · https://webhookrelay.com/blog/whatsapp-cloud-api-webhooks/ · https://www.supaclone.io/blog/migrate-supabase-project-region-organization
