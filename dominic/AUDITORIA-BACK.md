# Auditoria do Back — mapa + achados

Gerado em 2026-10-02. Escopo: `backend/` (Postgres 17 + 96 Edge Functions Deno), auditado contra o **Supabase local** (Docker) restaurado do `schema.sql`.
Método: `supabase db lint` (plpgsql_check nas 452 funções), execução real das funções suspeitas (transação + rollback), consultas ao catálogo (RLS, grants, SECURITY DEFINER), testes de escalada com usuários fictícios, varredura das edges. Sem subagentes.

---

## 1. Mapa (para se localizar)

| Onde | O quê |
|---|---|
| `backend/schema.sql` | Schema completo da produção (pg_dump, **sem dados**): 295 tabelas, 23 views, 452 funções, 760 policies, 13 extensões |
| `backend/supabase/config.toml` | Projeto local `sistemababel-local`; 96 funções com `entrypoint` customizado e `verify_jwt` preservado (55 com `verify_jwt=false`) |
| `backend/supabase/functions/<slug>/pacote/<slug>/index.ts` | Código de cada edge. Cada pacote tem **sua própria cópia** de `_shared/` (68 pastas `_shared`) |
| `backend/supabase/migrations/` | Vazia (só README) — reservada a mudanças futuras |
| `backend/historico-migrations/` | 1.099 migrations históricas reconstruídas — **referência, não reaplicar** |
| `backend/banco/rotinas/` | As 452 funções SQL, uma por arquivo (`nome--hash.sql`) |
| `backend/referencia-testes/`, `backend/pabx/` | Testes preservados; PABX (schema e funções próprias) |
| `backend/MAPA-DO-MOTOR.md`, `INSTALAR-BANCO-NOVO.md` | Mapa do motor e guia de instalação do banco novo |

**Local (Docker):** API `http://127.0.0.1:54321` · Studio `http://127.0.0.1:54323` · DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
Procedimento de restauração e armadilhas: ver memória `supabase-local-restauracao` (default privileges zerados antes da carga, role `consultor_dados_ro`, URLs de produção trocadas).

**Edge — secrets lidos (43):** `SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY`, LLM (`OPENROUTER_*`, `NVIDIA_API_KEY`, `VOYAGE_API_KEY`, `EMBED_*`), `LIVEKIT_*`, `GOOGLE_CLIENT_*`, `INSTAGRAM_*`, `WHATSAPP_OFICIAL_*`, `CLOUDFLARE_TURNSTILE_SECRET`, `LANGFUSE_*`, `RAPIDAPI_KEY`, `BABEL_*`, `CRON_*_TOKEN`, feature flags `USAR_*`, `CAMPANHA_DISABLED`.

---

## 2. Achados (ordem de severidade)

### B-01 · ALTA · LGPD quebrada: exportar dados e excluir conta falham sempre
`exportar_meus_dados()` e `solicitar_exclusao_conta()` → `relation "public.activity_logs" does not exist` (**confirmado executando**). A tabela não existe na produção (o dump é da produção).
Chamadas por `frontend/src/apps/user/configuracoes/Configuracoes.jsx`. Titular não consegue exercer direitos de portabilidade/eliminação.

### B-02 · ALTA · Busca vetorial do RAG quebrada (`search_path=""`)
`busca_hibrida_emocao` e `busca_vetorial` → `operator does not exist: extensions.halfvec <=> ...` (**confirmado executando**). As funções têm `search_path=""` e usam `<=>` sem qualificar — padrão de "endurecimento" do security advisor aplicado sem ajustar o corpo.
`busca_hibrida_emocao` é chamada pela edge `ragentic-processar-inline`. Mesmo padrão provável em `detectar_intent_categoria` (operador) e `criar_cliente_manual` (`gen_random_bytes` do pgcrypto).
**Correção:** `OPERATOR(extensions.<=>)` / `extensions.gen_random_bytes(...)` — como já faz `buscar_pergunta_similar`.

### B-03 · ALTA · Vazamento entre tenants para anônimo: `buscar_pergunta_similar`
`SECURITY DEFINER` (ignora RLS), **executável por `anon`**, sem nenhuma checagem de quem chama. Recebe `p_tenant_id` + embedding e devolve `pergunta` e **`resposta_do_dono`** de `perguntas_sem_resposta` daquele tenant. Com `p_limiar` baixo, qualquer vetor retorna a mais próxima.
**Correção:** `revoke execute ... from anon, authenticated` (deixar só `service_role`) ou validar `p_tenant_id` contra `auth.uid()`.

### B-04 · ALTA · Edges públicas sem autenticação com `service_role`
Com `verify_jwt=false` e **nenhuma** checagem no código:
- `processar-campanhas` — qualquer um dispara rodadas de envio de campanha (WhatsApp). Chamadas repetidas/concorrentes → risco de estourar o teto/hora e de banimento do número.
- `cron-retomar-agente` — força rodadas de retomada do agente (risco de mensagem duplicada se concorrer com o pg_cron).
- `processar-conversas-zip` — aceita ZIP de anônimo (abuso de memória/CPU).
As demais crons usam `_shared/auth-cron.ts` (`autorizarCron`) — aplicar o mesmo nessas três.

### B-05 · MÉDIA · 30+ funções SQL com erro estático (quebram quando o caminho executa)
Do `supabase db lint` (erros, fora B-01/B-02):
| Função | Erro | Chamador |
|---|---|---|
| `metricas_base` | coluna `product` não existe | front `apps/user/base/useBase.ts` |
| `obter_documentos_publicos_cliente` | coluna `d.file_name` não existe | front público `pages/public/use-acompanhamento.ts` |
| `rifa_painel_agente` | subquery usa coluna não agrupada `p.nome` | edges `ragentic-processar-inline`, `ragentic-tick` |
| `enviar_reproposta` | referência ambígua a `status` | edge `processar-acompanhamentos` |
| `integracao_provisionar_conta` | tabela `produto_template_conhecimento` não existe | edge `integracao-comercial` |
| `gestao_eliminar_expirados` | tabela `{gestao_vendas,gestao_indicacoes}` (SQL dinâmico malformado?) | front `apps/admin/gestao/dados.ts` |
| `aprovar_trecho_conversa_para_rag`, `aprovar_depoimento_para_rag` | coluna `tenant_id` não existe em `blocos_conhecimento` | — |
| `analisar_causa_efeito_tenant` | `leads.cargo_ativo_id` não existe | — |
| `obter_metricas_campanha` | tabela `repropostas_lead_campanha` não existe | — |
| `agregar_comparativo_nicho` | `round(double precision, integer)` não existe | — |
| `fn_saude_motor` | cast integer → timestamptz | — |
| `get_indicador_publico` | coluna `token` não existe | — |
| `obter_prompts_conversa` | `mp.chunks_usados` não existe | — |
| `monitor_saude_motor` | tabela `mensagens` não existe | — |
Avisos: `calcular_plano_pagamento` e `limpar_antes_embedar` marcadas `IMMUTABLE` chamando expressões `STABLE` (cache/índice pode servir valor errado); `consultar_meus_numeros_rifa` `STABLE` com expressão `VOLATILE`.
`gerar_sugestoes_fusao_tag` (`_pares`) é provável falso positivo (tabela temporária).

### B-06 · MÉDIA · Guarda de `profiles.system_role` depende de variável de sessão
Testado com usuários fictícios: auto-promoção a `platform_admin` e promoção do filho pelo pai são **bloqueadas** pelo trigger `prevenir_mudanca_campo_critico`. Porém o bypass é a GUC `app.bypass_profile_guard`, que qualquer SQL arbitrário pode setar (`set_config(...)` dentro da própria expressão do UPDATE). Hoje não é explorável porque `profiles` não está na allowlist da commandbar (`tabelas_consulta_permitidas`) e nenhuma função pública seta o bypass. Defesa em profundidade: checar `current_user`/papel em vez de GUC, e barrar `set_config` no filtro de `atualizar_dados_escrita_nucleo`.

### B-07 · MÉDIA · 94 funções `SECURITY DEFINER` com EXECUTE explícito para `anon`
Vêm do default privilege da produção (funções novas em `public` nascem executáveis por `anon`). A maioria valida `auth.uid()`/admin/token internamente (ex.: `cronjob_*` usam `_eh_platform_admin()`), mas o padrão é inseguro por omissão — B-03 é exatamente o caso que escapou. Recomendado: `alter default privileges ... revoke execute on functions from anon` e conceder caso a caso.

### B-08 · BAIXA · View `config_plataforma_publico` sem `security_invoker`
Lida por `anon`/`authenticated` com os privilégios do dono (fura RLS). Conferir se expõe só colunas públicas.

### B-09 · BAIXA · `_shared` duplicado e divergente entre funções
`cors.ts`: 36 cópias em 4 versões; `supabase.ts`: 54 cópias em 2 versões; `auth-cron.ts`: 17 cópias idênticas. Correção em código compartilhado precisa ser replicada à mão. CORS `Access-Control-Allow-Origin: *` em 85 pontos.

---

## 3. Respostas às pendências do front
- **`system_role`**: protegido (B-06 — bloqueado nos testes).
- **`impersonate-user`**: exige `auth.getUser` (checagem presente no código).
- **`gestao-indicacao` / `gestao-venda`** (POST das páginas `public/*.html`): leem `Authorization`/`apikey` e usam `service_role` — revisar validação de payload/rate-limit numa segunda passada.

## 4. Ambiente local — limitações
- Banco **sem dados** (o dump é só estrutura): buckets de storage (12 usados pelo front) e allowlists não existem localmente.
- Nenhum secret de edge configurado localmente (43 lidos; o README cita 12 faltando já na captura original) — edges que chamam LLM/WhatsApp falham localmente até preencher `backend/supabase/functions/.env`.
- **Edges no Docker: as 96 sobem** (teste de boot uma a uma: todas responderam). Mas o edge runtime mantém os workers vivos: depois de ~90 funções carregadas ocupou 2,75 GB dos 3,8 GB da VM e o Auth passou a dar timeout no login. Remédio: `docker restart supabase_edge_runtime_sistemababel-local`. Boot a frio de 4 funções em paralelo derrubou o container (exit 135/SIGBUS) — nesta máquina, aquecer em série.
- Usuários de teste locais: `admin@babel.local` (platform_admin) e `usuario@babel.local` (user), senha `Teste@123456`.
