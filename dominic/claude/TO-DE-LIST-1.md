tarefa 1: auditoria no front. Gere um .md para vc se localizar. 

tarefa dois mesma coisa com o back

tarefa tres instalar o back no docker 

tarefa 4 abrir em localhost. 

proibido subagentes e execute com economia de tokens. 

voce falhou nos logs. preciso que atulize sempre. 

---

## Status (Claude Code)

| # | Tarefa | Status | Entregável |
|---|---|---|---|
| 1 | Auditoria do front + .md de localização | concluída | `dominic/AUDITORIA-FRONT.md` |
| 2 | Auditoria do back + .md de localização | concluída | `dominic/AUDITORIA-BACK.md` |
| 3 | Instalar o back no Docker | concluída | Supabase local (10 containers) + schema restaurado + 96 edges servidas |
| 4 | Abrir em localhost | concluída | http://localhost:8080 (front) → Supabase local http://127.0.0.1:54321 |

Restrições cumpridas: nenhum subagente criado; checagens automáticas com saída filtrada.

## Log

Horários em BRT, aproximados (~) quando reconstruídos depois. Este log foi preenchido retroativamente em 2026-10-02 01:14 — na execução original ele não foi atualizado (falha reconhecida).

| Data/hora | Tarefa | Ação | Evidência | Resultado |
|---|---|---|---|---|
| 01/10 ~23:24 | pré (Docker) | Docker Desktop 4.41.2 existente estava com cópia incompleta (faltavam `linuxkit/kernel` e `boot.img`); baixado DMG oficial build 191736 (Intel), checksum e assinatura validados; app quebrado movido para a Lixeira | `~/Library/Containers/com.docker.docker/backend.error.json`; `hdiutil verify` VALID; `codesign --verify` OK | Docker Engine 28.1.1 rodando; `hello-world` OK |
| 01/10 ~23:54 | 3 | `supabase start -x logflare,vector --ignore-health-check` (health checks estouram tempo nesta máquina) | `docker ps`: 10 containers healthy; REST/Auth 200 | Stack local no ar |
| 02/10 ~00:05 | 3 | Restauração do `backend/schema.sql` numa cópia: 4 URLs de produção trocadas por `host.docker.internal:54321`; `\restrict` removido; default privileges do `postgres` zerados antes da carga; role `consultor_dados_ro` criado | conferência: 295 tabelas, 23 views, 452 funções, RLS 295/295, 760 policies, 13 extensões, 0 cron, 0 refs à produção; ACL anon/authenticated idêntica ao dump (284/127 e 312/204) | Banco local fiel à produção (sem dados) |
| 02/10 ~00:20 | 1 | Mapa do front; `tsc` (0 erros); ESLint em `src` (25.069, 24.725 prettier); cruzamento front→banco (143 tabelas, 84 RPCs, 37 edges — 0 inexistentes); varredura de segredos/XSS | `dominic/AUDITORIA-FRONT.md` | 7 achados (F-01 a F-07) |
| 02/10 ~00:40 | 2 | `supabase db lint` (34 funções com problema); execução real das suspeitas; catálogo (SECURITY DEFINER, views, policies); teste de escalada `system_role` com usuários fictícios; varredura das 96 edges | `dominic/AUDITORIA-BACK.md` | 9 achados (B-01 a B-09); LGPD e busca vetorial confirmadas quebradas |
| 02/10 ~00:50 | 3 | Boot das 96 edges uma a uma (paralelo derrubou o container: exit 135) | `/tmp/claude-502/boot.txt`: 96/96 respondendo | Edges OK; edge runtime precisa de restart após ~90 funções (2,75 GB) |
| 02/10 ~00:47 | 4 | `frontend/.env.development.local` → Supabase local; binários nativos x64 extraídos (node_modules veio de Mac arm64); usuários de teste criados | Vite 7.3.3 em :8080; login `admin@babel.local` e `usuario@babel.local` OK | Aberto no navegador |

## Pendências deixadas
- Scripts de restauração estão só no scratchpad da sessão — salvar no repositório (ver lista 2).
- Banco local sem dados; secrets das edges não configurados.
