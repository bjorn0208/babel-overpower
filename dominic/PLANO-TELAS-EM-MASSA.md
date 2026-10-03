# PLANO — Produção em massa das telas da Babel antiga (front novo, estado local)

Síntese das 8 auditorias em `/tmp/audit-*.md`. Alvo: `babel-os.html` (estado local, sem banco);
cada tela carrega dados mockados com os NOMES das futuras tabelas/RPCs/edges para reconexão.

**Totais: ~123 telas · ~730 botões/ações · 30 apps/áreas.**

## 1. Auditoria unificada por app

### USER — negócios grandes

| App | Telas | Botões | Porte | Dados futuros (tabelas/RPC/edge/storage) |
|---|---|---|---|---|
| rifas | 13 | ~110 | XG | rifas, pedidos_rifa, numeros_rifa, rifas_config_tenant, profiles, rifa_numeros_fixos, rifa_dividas, rifa_lista_disparo, rifa_agendamentos_disparo, rifa_imagens, rifa_disparo_envios, rifa_templates_mensagem, rifa_bom_dia_envios, leads, conversas, mensagens, canais, agentes, mentor_conversas, caixa_saida_mensagens; 7 RPCs; edges gerar-rifa-ia, cron-bom-dia-rifa, enviar-mensagem, ragentic-processar-inline; buckets rifas-anexos, disparo-lead-midias |
| maquete-rpg | 4 (2D, PainelConfig, 3D/VR, widget) | 10 fixos + ~70 seletores-sprite + ações canvas | XG | LEITURA: conversas, mensagens, leads, cargos + realtime; auth.getSession; localStorage `maquete-rpg:config:v1`; window.EQUIPE; escrita só local |
| campanha | 10 | ~55 | XG | campanhas, leads_campanha, fases_campanha, leads, listas_disparo_lead, disparos_lead, meta_indicacao_campanha, acoes_agendadas, profiles, produtos; storage disparo-lead-midias; rpc excluir_campanha; edge resolver-lista-disparo |
| reuniao | 11 | ~30 | XG-ressalva | salas_reuniao, participantes, turnos, dossie, contratos, profiles, config_plataforma; rpc criar_sala_agora, agendar_reuniao, responder_entrada_sala; edges sala-reuniao, analisar-reuniao; realtime broadcast; LiveKit-VPS (chamada ao vivo = mock/placeholder) |

### USER — médios

| App | Telas | Botões | Porte | Dados futuros |
|---|---|---|---|---|
| consulta | 5 (1 morta: aba-vender) | ~25 | XG | consultas, consultas_tipos, consultas_saldo, consultas_carteira_mov, consultas_pacotes, consultas_recargas, consultas_config_tenant, blocos_conhecimento, produtos, agentes_usuario, leads, config_plataforma_publico; edge consultar-documento; rpc gerar_link_consulta; storage consultas-anexos |
| mentor | 3 + GenUi | ~14 | G | mentor_conversas, mentor_mensagens, memoria_dono, cargos, ferramentas_dinamicas, cargo_ferramentas, conversas; GenUi é do commandbar |
| socio-comercial | 4 + modal | ~10 | M | profiles, config_plataforma, multinivel_comissoes, multinivel_saques; rpc get_minha_rede, solicitar_saque |
| textos | 1 | ~16 | M | arquivos_textos (autosave debounce 1,5s + flush; execCommand) |
| marketing | 2 | ~10 | M | mentor_conversas, profiles.system_role, empresas.logo_url; edges ragentic-processar-inline / agente-mestre-chat; bucket marketing-posts |

### USER — pequenos (8 apps · 9 telas · 48 botões)

| App | Telas | Botões | Porte | Dados futuros |
|---|---|---|---|---|
| juridico | 1 | 1 | P | juridico_servicos (R), juridico_interesses (RW) |
| contabilidade | 1 | 6 | P | nenhum (MODULOS hardcoded — fase visual) |
| rh | 2 | 6 | P | nenhum (dados-demo) |
| email | 1 (3 col) | 6 tipos | M | nenhum (dados-demo; fake send) |
| credito | 2 | 3 | P | nenhum (estado local + demo) |
| reino | 0 (redirect) | 0 | P | nenhum (navegar p/ /reino) |
| estoque | 1 | 7 | M | estoque_itens (RW), rpc movimentar_estoque; regra: saída nunca negativa |
| calculadora | 1 | 19 | P | nenhum (÷0 = 0) |

### GESTÃO (admin/gestao — 20.612 linhas, maior app)

13 abas + Chamados transversal · ~135 botões · porte total XG.

| Tela | Porte | Depende de |
|---|---|---|
| Shell+Backup | M | todas |
| Painel (read-only) | P | leitura geral |
| Indicações | G | Vendas, Clientes |
| Vendas | M | Indicações, Clientes |
| Clientes | G | Implementação, Chamados, Indicações |
| Implementação | XG | Clientes, P&D, Suporte, Chamados |
| P&D | G | Implementação (mesmo registro) |
| Suporte | G | Implementação, Chamados |
| Tarefas do time | XG | todas (pendências) |
| Parcelas | P | Clientes |
| Mensalidades | P | Clientes |
| Atividade (read-only) | P | — |
| Acessos | M | — |
| Chamados | G | Clientes, Impl/P&D/Sup |

Dados: 20 tabelas `gestao_*` + ~19 RPCs `gestao_*`; sem storage/edge; soft-delete via deleted_at.

### CURADORIA (admin/curadoria — 60 arqs, 17 abas)

Shell G + 17 abas · ~85 botões · porte total XG.

| Tela | Porte | Obs |
|---|---|---|
| Shell (topbar+palette+chat) | G | chat com mídia + impersonação global; ~12 ações |
| Avisos | P | 2 placeholders sem onClick |
| Cérebro | M | KPIs + SVG + modal |
| Dashboard | P | só leitura |
| Conversa | M | exige tenant impersonado |
| Blocos | G | 14 gavetas + CRUD |
| Pacotes | G | depende de componentes do app user (ver gap) |
| Simulador | M | motor real modo_teste |
| Empatia | M | 19 emoções × 3 valores |
| Produtos | M | 1 placeholder; tenant obrigatório |
| Tools | M | salvar = no-op (reproduzir igual) |
| Gatilhos | M | 2 mortos/placeholder |
| Acompanhamentos | M | mesma tabela de Gatilhos |
| Cargos | P | só leitura |
| Chamadas LLM | G | 2 placeholders |
| Crons | M | rpc listar_jobs_com_historico, togglar_job |
| Cross-Nicho | G | rpc destilar_perfil_empresa |
| Recursos | P | rpcs ativar/pausar_recurso |

### ADMIN — resto (13 apps · ~31 telas · ~115 botões)

| App | Telas | Botões | Porte | Depende de |
|---|---|---|---|---|
| dashboard | 1 | 1 | P | — |
| controle | 2 | 6 | M | tenants (ModalZapi) |
| tenants | 6 | ~30 | XG | loja (planos) |
| loja | 4 tabs | 6 | P | — |
| aplicativos | 1+modal | 7 | P | nichos |
| consulta | 5 seções | ~22 | G | nichos |
| juridico | 2 abas | 9 | P | — |
| aparencia | 3 abas | 9 | M | branding pai |
| financeiro | 2+modal | 7 | P | socio-comercial |
| socio-comercial | 2 abas | 5 | M | financeiro |
| cargos | 1+modal ext | 5 | M | user/cargos |
| nichos | 1+modal | 5 | P | — |
| reunioes | 1 | 3 | P | — |

## 2. Plano de produção em massa (ordem: usuário → admin → gestão → login)

Regras: lotes equilibrados (~1 XG ou ~2 G ou ~4–5 P/M por lote); dependência sempre produzida
antes do dependente; cada lote termina com verificação do checklist (§3).

### FASE A — Usuário pequeno/médio (aquecimento, sem dependências)

- **Lote A1 — P puros:** calculadora + contabilidade + rh + juridico + credito + reino.
  6 apps · 7 telas · ~35 botões. Nenhuma dependência.
- **Lote A2 — M pequenos:** email (M) + estoque (M) + textos (M) + socio-comercial (M).
  4 apps · 8 telas · ~39 botões. Regras: estoque saída-não-negativa + guard duplo-ajuste;
  textos autosave debounce+flush; socio regras de saque no rótulo.
- **Lote A3 — médios encadeados:** marketing (M) → mentor (G) → consulta (XG, sem aba-vender morta).
  3 apps · 10 telas · ~49 botões. Marketing/mentor compartilham o cano do motor
  (ragentic-processar-inline); consulta depende de Loja/empresa/página pública (mockar).

### FASE B — Usuário grande

- **Lote B1 — campanha (XG):** 10 telas · ~55 botões. Ordem: lista → wizard 1–3 → visão/esteira
  → operação/fechados/desistentes/config → mentor → composers. Realtime → polling local.
- **Lote B2 — rifas (XG):** 13 telas · ~110 botões. Ordem: shell+minhas+resultados → detalhe
  → grade → criar (XG) → pedidos (XG) → dívidas → config → disparo (XG) → atendimento
  → testar/bricio → compartilhar.
- **Lote B3 — reuniao (XG-ressalva):** 11 telas · ~30 botões. Lobby/agendar/histórico/admin/modais
  funcionais em estado local; chamada ao vivo (T6/T7/T8/T11) = placeholder mockado
  (exige LiveKit/VPS+Deepgram/LLM).
- **Lote B4 — maquete-rpg (XG):** 2D (XG) → PainelConfig (M) → 3D/VR (XG, por último ou
  versão P simplificada se sem three.js) → widget só se houver sistema de widgets.
  Mantém mesma chave localStorage `maquete-rpg:config:v1`; Equipe = lista mockada.

### FASE C — Admin resto (antes da gestão; tenants é XG isolado)

- **Lote C1 — base:** nichos (P) → loja (P) → aplicativos (P) → juridico (P).
- **Lote C2 — dinheiro:** financeiro (P) ↔ socio-comercial (M) → consulta-admin (G).
  (Financeiro consome saques/comissões do sócio; produzir sócio primeiro.)
- **Lote C3 — plataforma:** cargos (M, plugar NovoCargoModal/PainelFerramentas do user)
  → controle (M, ModalZapi compartilhado) → dashboard (P) + reunioes (P) + aparencia (M).
- **Lote C4 — tenants (XG):** 6 telas · ~30 botões. Por último do admin-resto (lê loja/planos,
  compartilha ModalZapi com controle). Carrossel de criação em massa é requisito.

### FASE D — Curadoria (XG)

- **Lote D1 — shell + P:** shell (G: topbar+palette+chat+impersonação) + Avisos + Dashboard
  + Cargos + Recursos. Placeholders reproduzidos como desabilitados/sem-ação.
- **Lote D2 — M:** Cérebro → Conversa → Simulador → Empatia → Produtos → Tools (salvar no-op)
  → Gatilhos → Acompanhamentos → Crons. Tenant impersonado obrigatório onde indicado.
- **Lote D3 — G:** Blocos (14 gavetas) → Chamadas LLM → Cross-Nicho → Pacotes **por último**
  (depende de componentes do app user: ListaBlocosPacote/ModalPacote/ui-hub — ver gap §4).

### FASE E — Gestão (XG, maior app — por último, consome padrões de todos)

- **Lote E1 — base ✅ PRONTO 02/10 (suíte `/tmp/gs-e1/gs-e1-test.py` 115/115, 0 erros JS):** Clientes (G) → Vendas (M) → Indicações (G, com detalhe+tentativas+reuniões+diário) → Parcelas (P) + Mensalidades (P).
- **Lote E2 — atendimento:** Implementação (XG, detalhe compartilhado) → P&D (G) → Suporte (G)
  → Chamados (G, máquina de estados transversal).
- **Lote E3 — fechamento:** Tarefas do time (XG: kanban+calendário+atas) → Painel/Atividade (P,
  leitura) → Acessos (M) → Shell/Backup (M).

### FASE F — Login/shell final

Login + branding real (aparencia/C4 define o contrato do provider) + navegação entre apps
+ smoke test geral de todos os lotes.

## 3. Checklist padrão por tela

1. **Paridade de botões** — cada botão/ação da auditoria existe e executa o handler descrito
   (inclui placeholders da antiga: reproduzir como desabilitado/sem-ação e marcar `TODO-BANCO`).
2. **Estado local com nomes futuros** — stores/objetos mockados usam os nomes reais das
   tabelas/RPCs/edges/buckets (§1); writes viram funções stub (`fetchX`/`salvarX`) com
   `TODO-BANCO:<tabela|rpc|edge>`.
3. **Regras de negócio** — reproduzir guards/validações (ex.: saída ≤ estoque, ÷0=0, merges
   de filters, soft-delete via deleted_at, confirmações destrutivas).
4. **Realtime → local** — subscriptions viram atualização local/polling; anotar `TODO-REALTIME`.
5. **Navegação** — tabs/modais/retornos conforme auditoria; deep-links externos (conversa-isolada,
   /consulta/\<chave\>, /reino, /cadastro?ref) mockados com `TODO-ROTA`.
6. **Verificação** — clicar cada botão do lote e conferir: (a) ação ocorre, (b) estado persiste
   na sessão, (c) nenhum erro no console; telas read-only conferem KPIs/gráficos com mock.

## 4. Riscos + unresolved herdados

**Riscos:**
- reuniao: chamada ao vivo NÃO é portável sem LiveKit/VPS+Deepgram/LLM → placeholder assumido.
- maquete 3D/VR: exige three.js + física + WebXR; sem isso, entregar versão P simplificada.
- Curadoria Pacotes e admin cargos/controle: dependem de componentes de outros apps
  (ListaBlocosPacote/ModalPacote/ui-hub, NovoCargoModal/PainelFerramentas, ModalZapi) —
  portar o componente junto ou reimplementar o par mínimo.
- Placeholders da antiga (8 na curadoria + salvar-no-op de Tools + novo-gatilho morto +
  aba-vender de consulta): reproduzir como inativos, NÃO inventar comportamento.

**Unresolved herdados das auditorias:**
- U1 (curadoria): corpos internos de ListaBlocosPacote/ModalPacote/ui-hub (app user
  agente/pacotes, usados pela tela Pacotes) — botões criar/editar/toggle/excluir bloco e
  salvar modal listados por props mas NÃO inspecionados linha a linha.
- U2 (consulta-user): aba-vender.tsx é código morto (não renderizada) — portar só se confirmado.
- U3 (aparencia): persistência real do brand vive no componente pai (setBrand) — verificar onde
  salva antes de ligar o salvamento.
- U4 (cargos-admin): bug `eh_super_admin` nas policies de escrita (UI trata 0-linhas como
  "sem permissão") — replicar tratamento até o back corrigir.
- U5 (recusar recarga): update direto pode falhar por RLS (0 linhas, tratado) — manter tratamento.
- U6 (consulta-admin API): token vai ao vault via RPC `definir_segredo_consulta` — sem banco,
  campo vira mock com `TODO-BANCO`.
