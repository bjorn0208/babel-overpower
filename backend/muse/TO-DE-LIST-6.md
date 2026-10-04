# TO-DE-LIST-6 — Muse: Gestão E2+E3 + baixa do L1

Continuação da TO-DE-LIST-3 (G1 parcial, L1 a reconciliar).

## Tarefas

- [x] **T1 — Escopo E2+E3 travado (02/10, "pode ir").** Fonte 1:1 em
  `frontend/src/apps/admin/gestao/`; padrão local-first + TODO-BANCO (§3
  do plano); suítes no repo (`backend/local/testes/`), nunca em /tmp.
  E2: Implementação (`aba-implementacao` + `detalhe-atendimento`
  compartilhado + `logica/acoes/diario-atendimento` + modais
  iniciar/finalizar + ponte Clientes→Impl) → P&D (`aba-programador`) →
  Suporte (`aba-suporte` + `suporte-atendimento`) → Chamados
  (`chamados-lista/detalhe` + `logica-chamados` + modais novo/ação).
  Banco: `gestao_implementacoes(+_impl_reunioes)`,
  `gestao_suporte_atend(+_funcionarios)`, `gestao_chamados(+_eventos)`;
  P&D sem tabela (local-only). E3: Tarefas (`aba-tarefas` +
  `logica/modais-tarefas` + `modais-reuniao`; kanban+calendário+atas) →
  Painel/Atividade (`aba-painel` + `aba-atividade`, leitura) → Acessos
  (`aba-acessos`) → Backup (`modal-backup`: export JSON + import 2
  cliques). Banco: `gestao_tarefas(+_reunioes_equipe/_reunioes)`,
  `gestao_atividade(+_uso_mes)+gestao_indicadores`,
  `gestao_acessos(+_pedidos)`; Backup sem tabela (local-only).
  Âncoras: ICON:1296, NAV:1359, TITLE:1360 (linhas únicas),
  V.gestao:6628; diff alheio do tabbar (CSS ~124/599) não conflita.
- [x] **T2 — E2+E3 entregues por ADOÇÃO (não por merge).** O workflow E2
  (coordenador + 4 lanes) entregou peças paralelas `gim*/gpe*/gsu*/gch*`
  em /tmp/gs-e2 — mas a inspeção achou o E2+E3 JÁ implementado no arquivo
  como `gx*` (~70 cases: 12 abas, detalhe compartilhado, chamados, kanban,
  atas, acessos, backup). Precedente C2: não duplicar. Verificação no front
  real: suíte `teste-gestao-e2.py` 11/11 (44 acts) + `teste-gestao-e3.py`
  6/6 (12 acts), 0 erros da Gestão (único pageerror é o pré-existente
  global `on is not defined`, provado fora da Gestão). Bug real corrigido
  no caminho: `new Map` → `new globalThis.Map` (:8415), pois `const Map`
  de :2370 sombreia o construtor (quebrava `gxvoltar`/chamados). Lanes E3
  canceladas por redundância. Peças /tmp/gs-e2 preservadas no disco
  (volátil) só como registro; nada fundido.
- [x] **T3 — Baixa do L1 (tela de login).** Provado de ponta a ponta
  (`teste-login-dados.py` → 5/5 login, 0 erros) e `[x]` na TO-DE-LIST-3.
- [x] **T4 — Suíte e2e reconciliada.** `teste-banco.py` quebrava no
  `ir(pg,'estoque')` porque estoque é app do CATÁLOGO (`loja_aplicativos`)
  e some do dock sem instalação (`ajustarAppsNoDock`; usuário de teste
  tinha 0 instalados) — fix no setup do teste (insert idempotente em
  `aplicativos_instalados` p/ usuario+teste@babel.com; o propósito do
  teste é escrita/leitura no banco, não o fluxo da Loja). Resultado:
  14/14, zero erros. `teste-login-dados.py`: trocadas as strings
  fantasmas (`Prova Do Banco`, `Evento Prova Banco`, `Outro Tenant` —
  nunca existiram no banco nem no seed) por linhas reais do seed
  (`Lojinha Sol`, `Medidas · Paula Reis`) + sessão B (teste@babel.com)
  provando isolamento de verdade. Resultado: 9/9, zero erros.
  Nota: `on is not defined` é pageerror global pré-existente e flaky no
  load (caça estática não achou `on` sem escopo); mantido como controle
  nas suítes, fora do escopo Gestão.

## Log

- **2026-10-02 — Lista criada.** E1 confirmado no log da TO-DE-LIST-3;
  login conferido por grep no `app.html` (6 ocorrências), prova visual
  pendente no T3.
- **2026-10-02 — T3 feita ("pode resolver").** L1 provado e baixado; T4
  aberta com a deriva e2e/seed encontrada no caminho. T1 (escopo E2+E3)
  segue precisando do Dominic.
- **2026-10-02 — T1+T2 feitas ("pode ir").** Escopo travado a partir do
  plano + fontes 1:1 no front antigo; execução desviou do merge para a
  ADOÇÃO do `gx*` existente (ver T2). Lanes E3 canceladas. G1 baixado
  na TO-DE-LIST-3. Resta T4.
- **2026-10-02 — T4 feita ("pode ir").** Causas raiz acima; suites
  provadas contra o front real :8080 (cópias sed em /tmp; arquivos
  seguem na convenção :8090). Lista 6 fechada.
