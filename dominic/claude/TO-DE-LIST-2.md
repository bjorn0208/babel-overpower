Nesta pasta tem um back e um front que foi danificado e tambem tem uma versao nova de front. esse sistema se chama babel-os e é um sistema multtenants de agentes, o detalhe e que o motor ragentic quebrou. 

terefa vamos recuperar o banco e o motor do agente. e no lugar do frontend pretendo encaixar o novo frontend, vamos validar aqui na pasta estando ok vamos subir na nuvem. 

vc deve nessa primeira tarefa buscar na internet todas as skills e mcps que possa te ajudar. voce vai no final gerar um to de list detalhado com log de todas as tarefas. 

> Respostas do Dominic (02/10): **1** — dados do projeto antigo · **2** — "como assim quais ferramentas instalar?" · **3** — Vite, mas sem perder o front novo · **4** — "Faça uma auditoria do próprio plano."

---

# Plano de execução — Lista 2 (Claude Code) · v2 (pós-auditoria)

**Objetivo:** recuperar banco e motor ragentic do Babel OS, substituir o front danificado pelo front novo (migrado para Vite, preservando o original), validar localmente no Docker e só então publicar na nuvem.
**Restrições:** sem subagentes · economia de tokens · log a cada tarefa · nuvem e produção só com aprovação registrada · não mover código sem autorização (regra 4 do `dominic/README.md`).

## 1. Decisões

| ID | Decisão | Status |
|---|---|---|
| **D0** | **Tudo local** (02/10 ~01:31): "Não é necessário nada disso, pois tem o docker e as pastas locais para usar" — sem acesso à nuvem, sem instalar ferramentas, sem git; D2, D8, D9, D10 dispensadas | ✅ |
| D1 | Origem dos dados | ✅ **pastas locais** (schema.sql + seeds de `historico-migrations/` + dados de teste) — sem dados de produção, o que elimina o risco A-01 |
| D2 | Ferramentas a instalar | ✅ dispensada (D0) |
| D3 | Chaves do motor para teste local | ⛔ pendente — ver A-03 (as chaves de LLM estão **nos dados**: `provedores_llm.api_key`) |
| D4 | Arquitetura do front novo | ✅ **Vite**, com `nova-frontend-babel/` intocado como referência |
| D5 | Cérebro/Groq/vozes na nuvem | ⛔ pendente |
| D6 | Pasta do projeto Vite + divisão com o Muse | ⛔ pendente — proposta: `babel-os-vite/` na raiz |
| D7 | Destino na nuvem | ⛔ pendente — ver A-07 |
| D8 | **Neutralizar credenciais dos dados no ambiente local** | ⛔ **novo, obrigatório antes de importar** — ver A-01 |
| D9 | **Acesso ao projeto antigo** | ⛔ **novo** — ver A-02 |
| D10 | `git init` na raiz (proposta P2 do Muse) | ⛔ **novo** — recomendado antes de alterar código |

## 2. Auditoria do plano v1

Revisão crítica do plano v1 (gerado às ~01:16), confrontado com as decisões D1/D4 e com verificações feitas às ~01:23.

| ID | Severidade | Problema no plano v1 | Evidência | Correção no v2 |
|---|---|---|---|---|
| A-01 | **CRÍTICA** | Importar dados reais e ligar o motor localmente **dispararia mensagens reais de WhatsApp para clientes** e gastaria LLM pago: as credenciais de integração estão **nos dados**, não só nos secrets | Colunas `canais.zapi_token/zapi_instance_id/zapi_security_token/zapi_api_url/ig_token`, `provedores_llm.api_key`, `conexoes_google.refresh_token`, `ferramentas_dinamicas.endpoint_url`, `tools_do_agente.endpoint_url` (24 tabelas com colunas desse tipo) | Tarefa 1.5: importar com `session_replication_role=replica` (sem triggers) e **sanitizar** essas colunas antes de qualquer edge/cron rodar; Z-API apontada para um stub local |
| A-02 | **ALTA** | Plano assumia acesso ao projeto antigo. O Supabase CLI está logado numa conta que **não** possui `pdamarjxcmkzbhqxtapl` nem `llsdqtbtuyuqxvepmniy` | `supabase projects list` → 9 projetos, nenhum dos dois | D9: credencial da conta antiga (ver seção 5) |
| A-03 | **ALTA** | Já existe um MCP `supabase` em `~/.mcp.json` apontando para a **produção antiga com escrita** (`database, development, functions, branching`), habilitado neste projeto. O v1 afirmou "nenhum MCP configurado" — **erro de levantamento meu** | `~/.mcp.json`; `.claude/settings.local.json` → `enabledMcpjsonServers: ["supabase"]`; `claude mcp list` | Tarefa 0.2: acrescentar `&read_only=true` na URL antes de autenticar |
| A-04 | ALTA | Fase 1 tratava "carregar dados" como um passo. Faltava: ordem `auth` → `public` (FK `profiles.id → auth.users`); **arquivos do Storage** (o dump só traz metadados de `storage.objects`); **Vault** (12 funções leem segredos — ciphertext não é portátil); drift de schema (o `schema.sql` é de 26/09) | `pg_proc` com `vault.decrypted_secrets`: `ler_segredo_cron`, `obter_segredo_vault`, `ler_chave_gestao_openrouter`, `_cronjob_montar_command`… | Tarefas 1.1 (drift), 1.4–1.8 desdobradas |
| A-05 | ALTA | **Paridade de funcionalidades ignorada.** O front novo tem 14 telas; o atual tem rotas públicas usadas por clientes finais (`/contrato/:chave`, `/rifa/:chave`, `/agendar/:chave`, `/consulta/:chave`, `/acompanhamento/:token`, `/sala/:chave`, `/cadastro`) e apps de admin (curadoria, gestão, impersonar). Substituir sem inventário quebra links já enviados a clientes | `frontend/src/App.tsx` (16 rotas); `nova-frontend-babel/cerebro/dados.js` (14 telas) | Tarefa 3.2: matriz de paridade e decisão por rota (portar / manter no front antigo / descartar) |
| A-06 | MÉDIA | Sem controle de versão: nenhuma forma de desfazer alterações em migrations/edges/front | raiz sem `.git` (MAPA-DAS-PASTAS.md do Muse) | D10 + tarefa 0.1 |
| A-07 | MÉDIA | A fase 5 não tinha **migração de dados para a nuvem** nem **corte**: usuários do Auth (hashes de senha), arquivos do Storage, webhooks externos (Meta/Z-API/Instagram/Google OAuth) apontando para as functions do projeto antigo, URLs públicas | INSTALAR-BANCO-NOVO.md §6 cita o corte, o plano v1 não | Fase 5 reescrita com 5.4–5.7 |
| A-08 | MÉDIA | Dois agentes (Claude e Muse) escrevendo nos mesmos arquivos: o `dominic/README.md` foi sobrescrito em minutos | log 01:36 | Regra de posse: Claude não edita arquivos do Muse e vice-versa; mudanças cruzadas via lista |
| A-09 | MÉDIA | "Não perder o front novo" sem critério de aceite | — | Tarefa 3.8: comparação visual (screenshots Playwright) original × Vite por tela |
| A-10 | MÉDIA | Correções SQL sem testes de regressão; `backend/referencia-testes/` existente não foi considerado | — | Tarefa 1.11 |
| A-11 | BAIXA | `activity_logs` (B-01): o v1 dizia "corrigir", sem decidir se cria a tabela ou ajusta as funções | a tabela não existe nem na produção | Tarefa 1.10 explicita a escolha (ajustar as funções para a trilha de auditoria existente) |
| A-12 | BAIXA | Sem critério de pronto por fase nem estimativa | — | "Pronto quando" em cada fase |
| A-13 | BAIXA | Teste de motor local precisa limitar o edge runtime (estoura memória com ~90 funções aquecidas) | log da lista 1 | Restart do edge runtime no roteiro de teste |
| A-14 | BAIXA | Dados reais de clientes (dados pessoais) num notebook sem criptografia | — | Dump fora de pastas sincronizadas; apagar após a carga; registrar no log |

## 3. Ferramentas (resposta à pergunta 2)

"Instalar" = registrar no Claude Code servidores MCP e plugins para eu operar o banco, o navegador e a nuvem de forma direta (em vez de só via terminal). Eu mesmo faço a instalação; o que depende de você é: (a) o **OK**, porque alguns rodam código de terceiros via `npx`; (b) **login no navegador** para os de nuvem; (c) **reiniciar o Claude Code** depois (`claude --continue` retoma esta conversa) — MCPs novos só carregam no início da sessão.

| Ferramenta | Situação | Precisa de você |
|---|---|---|
| MCP Supabase **local** (`http://127.0.0.1:54321/mcp`) | Testado, funciona | Só o OK |
| MCP Supabase **produção antiga** (`~/.mcp.json`) | Já existe, **sem read-only** (A-03) | OK para eu acrescentar `read_only=true` + seu login OAuth com a conta dona do projeto |
| Plugin `supabase` (marketplace oficial) — skills de Postgres/RLS | Não instalado | Só o OK |
| Chrome DevTools MCP (Google) | Não instalado | Só o OK |
| `context7`, `playwright`, `typescript-lsp` (marketplace oficial) | Não instalados | Só o OK |
| Vercel MCP | Não instalado | Login OAuth — só na fase 5 |

## 4. To-do list v2

Status: ✅ concluída · 🔄 em andamento · ⛔ bloqueada · ⬜ não iniciada

### Fase 0 — Preparação
| # | Tarefa | Depende | Status |
|---|---|---|---|
| 0.1 | ~~`git init`~~ | D0 | dispensada |
| 0.2 | ~~MCP produção read-only~~ — não será autenticado nem usado | D0 | dispensada |
| 0.3 | ~~Instalar ferramentas~~ | D0 | dispensada |
| 0.6 | Atenção: `backend/supabase/.temp/linked-project.json` vincula o CLI ao projeto de nuvem `llsdqtbtuyuqxvepmniy` (desde 29/09) → **todo comando usa `--local`**; nunca `db push`/`functions deploy` sem `--local` | — | ✅ regra |
| 0.4 | Pesquisa de skills/MCPs | — | ✅ |
| 0.5 | Scripts de restauração salvos em `backend/local/` | — | ✅ |

### Fase 1 — Banco (pronto quando: dados importados e sanitizados, `db lint` sem erro nas funções do motor, conferência de contagens batendo com a origem)
| # | Tarefa | Depende | Status |
|---|---|---|---|
| 1.1–1.5 | ~~Drift, dump e sanitização de dados da produção~~ | D0/D1 | dispensadas |
| 1.6 | Dados-base locais: aplicar os seeds de `historico-migrations/` que ainda fazem sentido no schema atual (36 arquivos com seed) | — | ⬜ |
| 1.7 | Buckets de storage (12 usados pelo front) criados localmente | — | ⬜ |
| 1.8 | Vault: segredos de teste para as 12 funções dependentes; seed mínimo do motor (2 tenants, agente, nicho, `agendamentos_config`) | 1.6 | ⬜ |
| 1.9 | Migrations `20261002020000_corrige_busca_vetorial_search_path.sql` (4 funções vetoriais, B-02) e `20261002020100_corrige_rifa_painel_agente_group_by.sql` | — | ✅ |
| 1.10 | Migrations `…020200_recria_tabelas_apagadas_em_uso`, `…020300_corrige_colunas_renomeadas`, `…020400_fecha_buscar_pergunta_similar` | 1.9 | ✅ |
| 1.10b | 7 funções com erro **sem nenhum chamador** no código (`agregar_comparativo_nicho`, `analisar_causa_efeito_tenant`, `aprovar_depoimento_para_rag`, `aprovar_trecho_conversa_para_rag`, `get_indicador_publico`, `monitor_saude_motor`, `obter_prompts_conversa`) — verificar se algum cron (`agendamentos_config`) as usa antes de corrigir ou remover | 1.6 | ⬜ |
| 1.11 | Regressão: `supabase db lint` + execução real das funções corrigidas + `backend/referencia-testes/` | 1.9, 1.10 | ⬜ |

### Fase 2 — Motor ragentic (pronto quando: mensagem simulada recebe resposta com RAG, sem nenhuma chamada externa real exceto o LLM de teste)
| # | Tarefa | Depende | Status |
|---|---|---|---|
| 2.1 | Documentar o fluxo do motor em `dominic/MOTOR-RAGENTIC.md` | — | ⬜ |
| 2.2 | Stub local da Z-API/WhatsApp (servidor que só registra o que receberia) | — | ⬜ |
| 2.3 | `backend/supabase/functions/.env` local (só o subconjunto do motor) | D3 | ⛔ |
| 2.4 | Fechar autenticação das edges públicas (B-04) | — | ⬜ |
| 2.5 | Recriar jobs do pg_cron do motor apontando para edges locais — **desligados** | 1.4 | ⬜ |
| 2.6 | Teste ponta a ponta (com restart do edge runtime antes — A-13) | 1.11, 2.2, 2.3 | ⬜ |
| 2.7 | Isolamento multi-tenant (tenant A não vê B) | 2.6 | ⬜ |
| 2.8 | Ligar `ragentic_tick` localmente por um período curto e observar | 2.6 | ⬜ |

### Fase 3 — Front novo em Vite (pronto quando: as 14 telas idênticas ao original e lendo dados reais; rotas públicas com destino decidido)
| # | Tarefa | Depende | Status |
|---|---|---|---|
| 3.1 | Combinar com o Muse a pasta (`babel-os-vite/`) e a regra de posse (A-08) | D6 | ⛔ |
| 3.2 | **Matriz de paridade** (A-05): rotas e apps do front atual × 14 telas do novo; decisão por item | — | ⬜ |
| 3.3 | Scaffold Vite + TS; **copiar** (não mover) `babel-os.html` e assets; o original segue intocado | 3.1 | ⬜ |
| 3.4 | Quebrar o HTML em módulos (CSS, telas, componentes) mantendo comportamento | 3.3 | ⬜ |
| 3.5 | Supabase Auth + papéis (reusar a lógica de `frontend/src/auth/`) | 3.3 | ⬜ |
| 3.6 | Trocar dados mocados por dados reais, tela a tela | 3.5, 1.6 | ⬜ |
| 3.7 | Esfera/cérebro → motor ragentic; remover chave Groq do navegador | D5, 2.6 | ⛔ |
| 3.8 | Paridade visual: screenshots original × Vite em cada tela (A-09) | 3.4 | ⬜ |

### Fase 4 — Validação local (portão)
| # | Tarefa | Depende | Status |
|---|---|---|---|
| 4.1 | Roteiro por tela (Playwright/Chrome DevTools): console sem erro, dados carregando | fase 3 | ⬜ |
| 4.2 | Agente respondendo pelo front novo | 2.6, 3.7 | ⬜ |
| 4.3 | `/security-review` das migrations e edges alteradas | fases 1–2 | ⬜ |
| 4.4 | Relatório de validação → pedido de aprovação para a nuvem | 4.1–4.3 | ⬜ |

### Fase 5 — Nuvem (somente com aprovação registrada)
| # | Tarefa | Depende | Status |
|---|---|---|---|
| 5.1 | Confirmar destino (D7) e janela de corte | 4.4 | ⛔ |
| 5.2 | `supabase db push` (migrations novas) no destino | 5.1 | ⬜ |
| 5.3 | `supabase secrets set` + `supabase functions deploy` | 5.2 | ⬜ |
| 5.4 | Migrar dados para o destino (dump **sem** sanitização, direto origem → destino), Auth incluído | 5.2 | ⬜ |
| 5.5 | Migrar arquivos do Storage | 5.4 | ⬜ |
| 5.6 | Repontar webhooks externos (Meta/WhatsApp oficial, Z-API, Instagram, Google OAuth redirect) para o destino | 5.3 | ⬜ |
| 5.7 | Deploy do front (Vercel) com envs de produção | 5.3 | ⬜ |
| 5.8 | Smoke test; **só então** ligar crons/filas | 5.4–5.7 | ⬜ |
| 5.9 | Volta: projeto antigo intacto até o aceite final | — | ⬜ |

## 5. O que preciso agora (D9 — acesso ao projeto antigo)

Qualquer uma, sem colar a senha no chat:
- **(a)** Criar o arquivo `backend/local/.env.antigo` com `DB_URL_ANTIGO=postgresql://...` (Dashboard do projeto antigo → Connect → Session pooler). Eu leio a variável sem imprimir.
- **(b)** Token da conta dona (`sbp_...`) no mesmo arquivo como `SUPABASE_ACCESS_TOKEN_ANTIGO=...` — uso só por comando, sem trocar o login atual do CLI.

## 7. Avaliação de viabilidade — motor + front novo (pedido 02/10)

| Peça | Situação medida | Dificuldade |
|---|---|---|
| Motor ragentic | ~20 mil linhas (`index.ts` 5,1k + `_shared` 15,3k), 79 tabelas. **Sobe e responde localmente** (`agente_nao_encontrado` com agente fictício). Entrada simples `{message, agente_id, phone, modo_teste}`; `modo_teste` evita envio real. Chave e modelo do LLM vêm do **banco** (`provedores_llm`, slug `openrouter`), não de env. Chamado por `chat-publico`, `executor-padrao`, `cron-retomar-agente`, `processar-acompanhamentos` | **Média-baixa**: falta só seed (tenant, `agentes_usuario`, `provedores_llm`) + **1 chave OpenRouter** (paga) — único bloqueio externo |
| Front novo → Vite (como está) | 1 HTML, JS puro 308 KB (1.817 linhas, não minificado), CSS 106 KB, **zero dependências externas** | **Baixa**: vira `index.html` de um projeto Vite sem mudança |
| Front novo → dados reais | 48 constantes mocadas lidas direto pelas telas (`CONVS` 45 usos, `EVENTS` 20, `CLIENTES` 11…); 8 pontos de escrita; estado global `S` + `render()` | **Média**: camada de dados que carrega do Supabase e preenche as mesmas constantes (UI intocada); trabalho real = mapear cada constante para as tabelas e as 8 escritas para inserts/updates |
| Login | Front novo não tem | **Baixa-média**: reaproveitar Supabase Auth do front atual |
| Esfera/cérebro → motor | Hoje `fetch` em `localhost:3078` (Node local) | **Média**: trocar por chamada à edge do motor (`chat-publico`/`ragentic-processar-inline`) |
| Rotas públicas do front antigo | Fora do front novo (A-05) | **Média**: decidir manter no antigo ou portar |

**Conclusão:** viável sem reescrita. Ordem sugerida: (1) Vite com o HTML como está → (2) login → (3) camada de dados tela a tela começando por `CONVS`/`CLIENTES`/`LEADS` → (4) esfera no motor (requer chave OpenRouter).

## 6. Log

| Data/hora (BRT) | Tarefa | Ação | Evidência | Resultado |
|---|---|---|---|---|
| 02/10 ~01:10 | — | Leitura de `TO-DO-LIST-2.md`, `dominic/README.md`, `AGENTS.md`, `dominic/muse/`, `nova-frontend-babel/LEIA-ME.txt` | — | Escopo entendido |
| 02/10 ~01:11 | diagnóstico | Front novo: 0 refs a Supabase; endpoints `localhost:3078/3100/8000`, Groq, DuckDuckGo, Wikipedia; 14 telas | grep `babel-os.html`, `cerebro/dados.js` | Integração com banco é trabalho novo |
| 02/10 ~01:11 | diagnóstico | Motor × lint: 2 RPCs do motor com erro; 4 funções vetoriais com `search_path=""` | `supabase db lint`; `pg_proc` | Causa principal da quebra do RAG |
| 02/10 ~01:11 | diagnóstico | `ragentic_tick` criado por dados (`agendamentos_config`) | `historico-migrations/*.sql` | Motor sem relógio enquanto não houver dados |
| 02/10 ~01:12 | 1.x | `database.dump` não existe no Mac | `mdfind` vazio | → D1 |
| 02/10 ~01:12 | 0.4 | Pesquisa web de MCPs/skills/plugins | links da v1 (abaixo) | concluída |
| 02/10 ~01:13 | 0.4 | MCP do Supabase local testado | `initialize` → 200 (v0.12.0) | disponível |
| 02/10 ~01:14 | README | `dominic/README.md` reescrito | — | depois sobrescrito pelo Muse (versão dele mantida) |
| 02/10 ~01:14 | lista 1 | Log da lista 1 preenchido retroativamente | `TO-DE-LIST-1.md` | concluída |
| 02/10 ~01:15 | 0.5 | `backend/local/restaurar-local.sh` + 3 SQL; `bash -n` OK; não executado | `backend/local/` | concluída |
| 02/10 ~01:16 | plano v1 | Plano e log v1 gerados | — | substituído pelo v2 |
| 02/10 ~01:20 | D1–D4 | Dominic: dados do projeto antigo; Vite preservando o front novo; pergunta sobre ferramentas; pediu auditoria do plano | mensagem | D1 ✅ D4 ✅ |
| 02/10 ~01:21 | D9 | CLI logado em conta sem os projetos Babel | `supabase projects list` | → A-02 |
| 02/10 ~01:22 | 0.2 | MCP `supabase` da produção antiga encontrado em `~/.mcp.json`, sem read-only; erro do v1 ("nenhum MCP") corrigido | `claude mcp list` | → A-03 |
| 02/10 ~01:23 | auditoria | Colunas de credenciais/endpoints nos dados (24 tabelas) e 12 funções dependentes do Vault | `information_schema.columns`; `pg_proc` | → A-01, A-04 |
| 02/10 ~01:26 | auditoria | Auditoria do plano (A-01…A-14) e plano v2 | este arquivo | concluída |
| 02/10 ~01:31 | D0 | Dominic: tudo local (Docker + pastas). D1 redefinida para dados locais; D2/D8/D9/D10 e tarefas 0.1–0.3, 1.1–1.5 dispensadas. Fontes locais: 36 migrations de seed no histórico; nenhum dump/CSV de dados | `ls historico-migrations`; `find` | plano v3 |
| 02/10 ~01:34 | 1.9 | Migration 1: `search_path = public, extensions` em `busca_hibrida_emocao`, `busca_vetorial`, `detectar_intent_categoria`, `buscar_memoria_dono` (tolerante: busca por nome). Migration 2: `rifa_painel_agente` — chave de agrupamento em derivada (`p.chave`), idempotente | antes: `operator does not exist`; depois: as 2 buscas executam sem erro; migration 2 rodada 2× (2ª: "já corrigida"); `plpgsql_check` sem erros; `db lint`: as 5 funções do motor OK (restam 18 funções com erro, fora do motor → 1.10) | concluída |
| 02/10 ~01:35 | 1.9 | `backend/local/restaurar-local.sh` passa a aplicar `supabase/migrations/*.sql` após o schema base (evita `db reset` quebrar). Extensão `plpgsql_check` criada só para teste e removida (fidelidade à produção) | `bash -n` OK; `pg_extension` sem plpgsql_check | concluída |
| 02/10 01:36 | log | Arquivos renomeados por terceiros (`TO-DO-LIST-2.md`→`TO-DE-LIST-2.md`, `TO-DE-LIST- 3.md`→`TO-DE-LIST-3.md`; conteúdo intacto). **Horários deste log corrigidos**: eu tinha registrado estimativas à frente do relógio (até "02:12" quando eram 01:36); refeitos pela hora real de criação dos arquivos (`stat`) | `date`; `stat` | corrigido |
| 02/10 ~01:32 | 0.6 | Encontrado vínculo do CLI com a nuvem (`.temp/linked-project.json` → `llsdqtbtuyuqxvepmniy`, de 29/09); regra: sempre `--local` | arquivo | registrado |
| 02/10 01:37 | 1.10 | Lista renomeada por terceiros detectada; pedido "siga a lista" interpretado. Levantamento das 18 funções com erro × chamadores (front/edge/SQL): 8 com chamador ativo | `db lint` + grep | priorizadas |
| 02/10 01:38 | 1.10 | Causa raiz: migration `20260509230545_sem-nome.sql` apagou 25 tabelas "órfãs (zero refs no frontend)" — mas funções SQL ainda usavam 4 delas; `activity_logs` apagada em 15/04 sem ajustar as funções LGPD | `historico-migrations/` | registrado |
| 02/10 01:39 | 1.10 | Migration `…020200`: recria `activity_logs`, `produto_template_conhecimento`, `produto_template_midias` (DDL/policies originais) e `repropostas_lead_campanha` (inferida). Achado: `produto_template_midias` é usada pelo trigger de cadastro `copiar_templates_produto_para_novo_tenant` → cadastro de tenant falhava em nicho com template | aplicada 2× (idempotente) | concluída |
| 02/10 01:40 | 1.10 | Migration `…020300` (reescrita textual com trava): `metricas_base` (product→produto), `obter_documentos_publicos_cliente` (file_*→nome_arquivo/rotulo/caminho_arquivo/tipo_arquivo; chaves do JSON mantidas), `enviar_reproposta` (status ambíguo), `criar_cliente_manual` (gen_random_bytes + cast uuid), `fn_saude_motor` (int→timestamptz engolido por EXCEPTION) | execução real como `usuario@babel.local`: exportar_meus_dados OK, solicitar_exclusao_conta grava pedido, metricas_base OK, criar_cliente_manual cria lead; fn_saude_motor com fila real: antes 0 filas, depois 1 (pendentes=1) | concluída |
| 02/10 01:41 | 1.10 | Falsos positivos do lint confirmados em runtime: `gestao_eliminar_expirados` (SQL dinâmico; dry-run como admin → 2 linhas) e `gerar_sugestoes_fusao_tag` (tabela temporária) | execução real | sem correção |
| 02/10 01:42 | 1.10 | Migration `…020400` (B-03): `buscar_pergunta_similar` só para `service_role` (único chamador: `_shared/loop-mentor.ts` do motor, cliente service_role) | API como anon → `42501 permission denied`; como service_role → `[]` | concluída |
| 02/10 01:42 | 1.11 | Lint do banco: 34 → 9 funções com erro (2 falsos positivos + 7 sem chamador → 1.10b); as funções do motor e as chamadas por front/edges estão limpas | `supabase db lint --local` | parcial |
| 02/10 01:49 | 7 | Avaliação de viabilidade motor + front novo: chamada real ao motor local (responde; pede agente), contrato de entrada, origem da chave LLM (`provedores_llm`), perfil do `babel-os.html` (JS puro, sem deps, 48 mocks, 8 escritas) | `curl` motor; análise do HTML | concluída — viável sem reescrita (seção 7) |
| 02/10 02:10 | 8 | Novo pedido: deploy em ~10h (prazo ≈ 12:00); fluxo Docker → testes → nuvem; pesquisa de ativação (go-live) delegada a 1 subagente **Sonnet** (ordem do Dominic: Sonnet pesquisa, Opus 5.5 executa); próximo: entender o front novo perguntando ao Dominic | subagente em background | em andamento |
| 02/10 02:11 | 8 | Pesquisa de ativação concluída (subagente Sonnet) e salva em `dominic/ATIVACAO-GO-LIVE.md` com notas aplicadas ao Babel (risco: entrypoints em subpasta no `functions deploy` — CLI #3676/#3426) | arquivo | concluída; aguardando respostas do Dominic sobre o front novo |

Fontes da pesquisa (0.4): [Supabase MCP](https://supabase.com/docs/guides/ai-tools/mcp) · [Supabase plugins](https://supabase.com/docs/guides/ai-tools/plugins) · [Supabase agent skills](https://claudemarketplaces.com/skills/supabase/agent-skills/supabase-postgres-best-practices) · [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/client-configurations.md) · [Vercel MCP](https://vercel.com/docs/agent-resources/vercel-mcp) · [plugins oficiais](https://designrevision.com/blog/official-claude-code-plugins) · [pgvector + search_path](https://github.com/supabase/supabase/issues/28507) · [Muse Code](https://techcrunch.com/2026/08/05/meta-launches-muse-code-an-ai-agent-for-large-code-bases/)
