# TO-DE-LIST-3 — Muse: telas faltantes do front novo

Pedido original: "voce vai pegar as telas que nao tem ainda criadas no front
novo e cria-las agora uma por uma comecando pelo usuario e depois adm e por
fim a tela de login."

Contexto: dos 47 apps da Babel antiga, o front novo cobre 12, cobre 2 só em
parte e deixa 33 de fora.

Padrão de cada tela (idioma do `babel-os.html`): entrada em `ICON` + `NAV` +
`TITLE`, função `V.<tela>` com estado em `S` (localStorage), ações via
`data-act`. Verificação: `node --check` no JS extraído + abertura da tela.

## Usuário (18)

- [x] **U1 — Empresa.** Portar `frontend/src/apps/user/empresa/Empresa.tsx`
  (Dados · Identidade Visual · Endereço · Presença Digital · Missão & Valores).
- [x] **U2 — Maquete-RPG.**
- [x] **U3 — Consulta (usuário).**
- [x] **U4 — Jurídico (usuário).**
- [x] **U5 — Mentor.**
- [x] **U6 — Sócio Comercial (usuário).**
- [x] **U7 — Campanha.**
- [x] **U8 — Textos.**
- [x] **U9 — Marketing.**
- [x] **U10 — Reunião.**
- [x] **U11 — Contabilidade.**
- [x] **U12 — RH.**
- [x] **U13 — E-mail.**
- [x] **U14 — Crédito Bancário.**
- [x] **U15 — Rifas.**
- [x] **U16 — Reino.**
- [x] **U17 — Estoque.**
- [x] **U18 — Calculadora.**

## Admin (14)

- [x] **A1 — Dashboard.**
- [x] **A2 — Controle.**
- [x] **A3 — Tenants.**
- [x] **A4 — Loja (admin).**
- [x] **A5 — Aplicativos.**
- [x] **A6 — Consulta (admin).**
- [x] **A7 — Jurídico (admin).**
- [x] **A8 — Aparência.**
- [x] **A9 — Financeiro (admin).**
- [x] **A10 — Sócio Comercial (admin).**
- [x] **A11 — Curadoria.**
- [x] **A12 — Cargos.**
- [x] **A13 — Nichos.**
- [x] **A14 — Reuniões.**

## Ambos os lados (1)

- [x] **G1 — Gestão (E1 PRONTO 02/10; E2+E3 ADOTADOS do gx* em 02/10, suítes 11/11 + 6/6).**

## Por fim

- [x] **L1 — Tela de login.**

## Log

- **2026-10-02 — Lote C2 reconciliado: ficou a versão paralela "ligada ao banco" (A10/A9/A6
  validadas por smoke).** O lote C2 do Muse foi integrado às 10:57 (`node --check` OK); entre
  ~11:03 e 11:15 um editor externo reescreveu o `babel-os.html` e **removeu o bloco `Lote C2`**
  (módulo + cases + listeners + NAV), com o comentário `/* lote C2 do Muse removido em 02/10
  11:15 (ficou a versão do Claude, ligada ao banco) — backup: scratchpad/… */` (esse backup não
  existe em disco; as peças Muse ficam em `/tmp/lot-c2-pieces-clean/` + `/tmp/integrate_lot.py`,
  recuperáveis). Ficou a versão paralela — blocos `A9/A10/A6 + ações C2`, estado com nomes de
  coluna do banco — coerente com a decisão das 09:15 (banco local). **Não readicionei.**
  Verificação da versão entregue: **`/tmp/c2-smoke.py` PASS ×2** — abre as 3 telas com título
  correto e clica todo `data-act` distinto (`salink/satab/sanovo/satog/sadel` ·
  `fatab/fapcomp/fapst` · `catab/catnovo/cattog/cated/catdel`), **0 pageerrors/console**, KPIs
  `.pz.k .v` presentes (valores do banco: 3/11/0), link `cadastro?ref=BABEL-ADM`;
  screenshots `/tmp/c2smoke-*.png` conferidos. A suíte Muse (211 checagens) não se aplica à
  versão entregue (acts `socadmtab`≠`satab`, seed local ≠ banco). Minhas entradas ICON/TITLE
  permanecem (chaves duplicadas vencem as últimas = sem efeito visual); NAV sem duplicatas.
- **2026-10-02 — Lote C4 concluída e fundida (A3 Tenants, XG).** Lista
  com busca + 6 filtros (todos exclui apresentação/excluídos, igual à
  antiga), modal detalhe 4 tabs (Perfil com apelido validado, Plano com
  select da loja + Ativar/Renovar/Zerar/Inativar, Equipe com impersonar
  por membro, Acesso com Z-API/Instagram/senha/excluir), wizard criar
  em carrossel (senha padrão babel123, PDF mockado com match de nicho,
  NÃO fecha ao criar), Z-API própria (tnZapi — a do C3a ainda não tinha
  fundido; dedupe futuro), Instagram com Salvar-e-testar, excluir com
  confirmação digitada, impersonar/restaurar com TODO-EDGE/ROTA.
  Planos lidos de `S.lojaadm`, nichos de `S.nich`. Feito em cópia
  isolada (`/tmp/muse-c4-work/`, peças em `pieces/` + `apply.py`) por
  causa do worker paralelo fundindo C2/C3a no mesmo arquivo; rebase 3×
  (âncoras NAV/TITLE seguiram o fim da lista: apar→controle→consadm).
  Provas: `node --check` OK; `/tmp/muse-c4-test.py` 86 checks PASS 2×
  + 1× rebase + 1× no arquivo real, 0 erros; regressão C1 PASS 2×;
  capturas `/tmp/muse-c4-*.png`; backup pré-merge
  `/tmp/muse-c4-bak-pre-c4.html`. Bug corrigido: gate do botão Criar
  não rodava ao digitar apelido (branch de hint retornava antes).
- **2026-10-02 — Lote C3a concluída e integrada (A12 cargos → A2 controle).**
  Construída pelo subagente dedicado (cópia própria, projeto intacto) e
  integrada por mim via `/tmp/integrate_lot.py` (peças em
  `/tmp/lot-c3a-pieces/`, âncoras ICON/NAV/TITLE/módulo+listeners/cases).
  Cargos: catálogo global/nicho com abas, KPIs 5/3/2, filtro de nicho
  lateral, painel de edição completo (nome, ativo, tipologia, canal,
  ordem, objetivo, regras, modelo LLM), NovoCargoModal + PainelFerramentas
  do app user plugar como `cgNovoModal()`/`cgFerrHtml()`, guard literal
  `nichoId obrigatório pra cargo de nicho` e replicação do bug U4
  (0 linhas afetadas → recusa a salvação). Controle: KPIs Críticos/
  Em atenção/Tenants = 4/2/10 (seeds relativos a `Date.now()`), saldo
  OpenRouter (stub + auto 60 s), planilha de gastos estilo planilha
  (Gerar/Sincronizar/Baixar Excel, 21 linhas, subtotal por dia +
  TOTAL GERAL) e planos por urgência com **ModalZapi** por linha.
  Contrato `modalZapi(tenant, aoFechar) → {id,nome}|null` (reconciliado
  com o §6 da auditoria do C4: `aoFechar` roda UMA vez em Cancelar/✕/
  backdrop/ESC/sucesso do salvar; erro como banner; `TODO-BANCO:
  canais (upsert user_id + type=whatsapp)`). Bugs do caminho: script de
  integração com âncora `\n];` quebrava a NAV de linha única (caiu dentro
  do par do `apar` — arquivo e script reparados, `]]` → `index(']];')+1`).
  Provas: `node --check` OK; `/tmp/c3a-int-test.py` PASS 2× no arquivo
  real (95 checagens, 0 pageerrors/console, 24 `data-act` novos clicados);
  regressões `/tmp/c1-test.py` PASS, `/tmp/c3b-int-test.py` PASS,
  `backend/local/teste-curadoria.py` 40/40 0 erros; capturas
  `/tmp/c3a-cargos.png`, `/tmp/c3a-controle.png`, `/tmp/c3a-zapi.png`.
- **2026-10-02 — Lote C3b concluída e integrada (A1 dashboard → A14
  reuniões admin → A8 aparência).** Construída pelo subagente dedicado e
  integrada por mim (backup `/tmp/babel-os.bak-pre-c3b.html`). Dashboard:
  4 KPIs com mock fiel de `KPIS_ADMIN` (7d/30d/90d/total), 2 gráficos
  `svgLine` seno+ruído com badges (+18 este mês/−3% economia), Top
  tenants por uso (5 ativos ordenados por tokens, mock prova o filtro de
  `status:'excluido'`), Saúde do motor com 5 linhas (warn = Embedding
  fila 124) e período via act `dbper` em `S.dash`. Reuniões Admin:
  ocupação ao vivo (14 pessoas/3 salas, `os-*`→"Sala da plataforma",
  demais "PABX · nº") com auto-refresh de 10 s que só re-patcha `#rmUlt`
  (não descarta o digitado), capacidade com teto 2–100, switch de aviso e
  limiar 1–500; guards corrigem o bug `Number('')=0` da fonte. Aparência:
  preview ao vivo (`#aprPrevDesk`/`#aprPrevLogin`), 3 abas (Geral 5
  campos / Cores 3 + 6 paletas oklch / Login 6 + contador de 140 + cards
  add-del), draft≠brand com `aprSync()` sem re-render (cursor nunca
  salta), Salvar/Descartar desabilitados "Sem mudanças", upload via
  FileReader com guard 1,5 MB, setas ←→ nas abas. Contrato da Fase F:
  `APR_DEF` com as 14 chaves do `Branding` + `aprApply()` já seta
  `--os-fundo`, `--os-acento-1/2` e `link[rel=icon].href` no boot e no
  save; falta upsert `branding_sistema`, bucket `logos` e realtime
  (`TODO-BANCO`/`TODO-REALTIME` marcados). Incidente corrigido na
  integração: a NAV é linha única e a âncora `\n];` do script inseriu as
  3 entradas dentro do array `LIGHTS` (linhas removidas e entradas
  realocadas para a NAV correta, após `curadoria`). Provas: `node --check`
  OK; `/tmp/c3b-int-test.py` PASS 2× no arquivo real (75 checagens,
  0 erros); regressões `/tmp/c1-test.py` PASS 0 erros e Curadoria 40/40;
  capturas `/tmp/c3b-dash.png`, `/tmp/c3b-reunadm.png`, `/tmp/c3b-apar.png`.
- **2026-10-02 — A11 Curadoria: entregue por agente paralelo (Claude) e
  validada aqui.** Durante a integração do C3b apareceram no arquivo real
  bloco `Fase D · A11 Curadoria` (~280 linhas) + entradas em ICON/NAV/
  TITLE que não eram de nenhum lote meu — forense no opencode.db e em
  `dominic/claude/TO-DE-LIST-6.md` mostrou o agente Claude (fluxo
  paralelo, kickoff 09:15, tarefa das 09:51) construindo a tela com shell
  de impersonação + ⌘K + chat lateral + 17 abas, próprio teste
  `backend/local/teste-curadoria.py` e backup
  `backend/local/babel-os.antes-curadoria.html`. Validei no arquivo
  integrado: 40/40 PASS, 0 erros (junto com C1 e C3b verdes) — A11
  marcada. As entradas `gestao` (ICON/NAV/TITLE) vieram da mesma janela
  de edições paralelas, **sem `V.gestao`**: `paint()` usa
  `(V[S.view]||V.inicio)` então clicar em Gestão não quebra (renderiza
  Início com título "Gestão") — deixado para G1. Atenção registrada:
  agora há **3 agentes no mesmo arquivo** (Muse, Claude, extensão Kilo);
  backups antes de cada integração em `/tmp/babel-os.bak-pre-*.html`.
- **2026-10-02 — Lote C1 concluída (A13 nichos → A4 loja → A5 aplicativos →
  A7 jurídico; 4 apps P).** Nichos: CRUD com slug automático do nome
  (NFD/acentos→hífen), slug único obrigatório na criação e fixo na edição,
  toggle `ativo` sem delete físico (contagem mockada de tenants/blocos;
  `TODO-BANCO profiles.nicho_id` + `blocos_conhecimento.escopo`). Loja:
  4 abas (planos/pacotes/implantação/sócio-comercial) com CRUD genérico
  por tabela+tipo (`loja_*`), campos extras do plano (conversas, ciclos,
  dias, storage, `modelos_llm` mock, ordem), badge de inativo/conv·dias,
  confirmação destrutiva. Aplicativos: grid de 32 ícones clicáveis,
  slug com filtro de chars + regex, Grátis = `preco_mensal` NULL
  (desabilita o input), rádio global/específico → `aplicativos_nicho`
  (global = nenhuma linha), remoção com aviso de perda de acesso.
  Jurídico-admin: 2 abas — serviços com soft delete `deleted_at` +
  preço vazio = "Sob consulta" + ativar/desativar mantendo a linha
  visível no admin, e interessados com join mock (serviço/perfil),
  5 filtros de status e select que atualiza na hora
  (`TODO-REALTIME juridico_interesses`). Integrações: a vitrine do
  usuário (V.juridico) passou a filtrar `ativo && !deleted_at`, e o
  "Tenho interesse" da vitrine nasce como lead "Visitante da vitrine"
  no admin (`TODO-BANCO`). Bugs corrigidos no caminho: `juaVisiveis`
  filtrava `ativo` (serviço inativado sumia do admin e ficava
  irreversível — admin lista inativos opacos e reativáveis); ordem
  default 1 na edição reordenava as linhas (teste passou a mirar a
  linha por texto, `click_row`); seed do localStorage com guarda no
  `add_init_script` (o reload do teste apagava o estado). Provas:
  `node --check` no JS extraído OK; `/tmp/c1-test.py` PASS (100
  checagens, pageerrors/console 0) 2× seguidas; regressão
  `/tmp/b4-test.py` PASS 0 erros; capturas `/tmp/c1-nichos.png`,
  `/tmp/c1-loja.png`, `/tmp/c1-apps.png`, `/tmp/c1-jur.png`
  conferidas (o "retângulo" da Loja foi investigado pixel a pixel:
  só as bordas do painel — artefato de escala da imagem).
- **2026-10-02 — Lote C1 iniciada (admin base: nichos → loja → aplicativos →
  jurídico; 4 apps P).** Fecha a Fase B (B1–B4) e abre a Fase C
  (`PLANO-TELAS-EM-MASSA.md` §2). Alvo: `babel-os.html`; auditoria em
  `/tmp/audit-admin-resto.md` §§4,5,7,12. Tarefas do lote: A13 nichos,
  A4 loja, A5 aplicativos, A7 jurídico.
- **2026-10-02 — B4 concluída (U2 Maquete-RPG).** Tela 1 = palco 2D
  isométrico em canvas puro (grade 40×25, porta (0,22), 12 postos, fila de
  8 tiles, A* com obstáculos, máquina de estados do lead off→indo→espera→
  vai→sendo→embora, câmera com zoom-na-rotação do cursor/arraste/pinça,
  HUD com fila/atuendidos/fora/zoom, `TODO-REALTIME`); Tela 2 = overlay
  "Configuração da maquete" (espera/embora/ocioso, som, espelhos, equipe
  por cargo P/M/G, velocidade 0.5–2×, nomes, Ver em 3D/VR, salvar em
  `maquete-rpg:config:v1:anon` com `TODO-BANCO`); Tela 3 = placeholder
  3D/VR (badge "3D · EM BREVE", Voltar pro 2D, Entrar em VR). Clique no
  lead abre a conversa em `Conversas` (`TODO-ROTA:
  ...conversa-isolada__<slug>` no subtítulo do toast); espelhos/equipe
  dão toast. Estado da tela em `S.mq.modo` ('2d'|'cfg'|'3d', volta a
  '2d' ao sair). Tela 4 (widget) não portada — o front novo não tem
  sistema de widgets. Bugs corrigidos no caminho: `const Map` do app
  sombreia o global (`MQ.pt = new globalThis.Map()`), blur no input antes
  do `render()` (NotFoundError em handler de blur), labels numa 2ª passada
  com anti-sobreposição, bloco de título em `.prow` (evita flex vazio de
  300px). Provas: `node --check` no JS extraído OK; `/tmp/b4-test.py`
  PASS (70+ checagens, pageerrors/console 0) 2× seguidas; regressão
  `/tmp/b3-test.py` PASS 0 erros; capturas `/tmp/b4-maquete.png` e
  `/tmp/b4-config.png` conferidas.
- **2026-10-02 ~06:15 — B4 iniciada (U2 Maquete-RPG, XG).** Fases A e B
  fechadas até aqui (A1–A3, B1–B3). Próximo do `PLANO-TELAS-EM-MASSA.md`:
  Lote B4 = Tela 1 (2D) → Tela 2 (PainelConfig) → Tela 3 (3D/VR
  simplificada, sem three.js) → Tela 4 (widget: só se houver sistema de
  widgets no front novo — não há, não portar). Alvo: `babel-os.html`.
- **2026-10-02 — Lista estruturada.** 34 tarefas (U1–U18, A1–A14, G1, L1).
  Mapeado o idioma do front novo: `ICON` (l.1220), `NAV` (l.1244),
  `TITLE` (l.1245), views `V.*`, estado `S` + `save()`, ações `data-act`.
  Nota: o dock renderiza todo o `NAV` — com 47 telas ele vai ficar
  cheio; a paleta (busca) escala. Revisar navegação ao final se preciso.
- **2026-10-02 — U1 concluída (Empresa).** `V.empresa` + `ICON.empresa` +
  `NAV`/`TITLE`, estado `S.empresa` (localStorage, seed "Excellence
  Consultoria"), 5 cartões do app antigo, logo/banner por upload local,
  Salvar + pílulas de presença (preservam o digitado no re-render).
  Correção junto: dock com `overflow-x:auto` (a 15ª tela já estourava a
  largura). Provas: `node --check` ok + `/tmp/u1-empresa-test.py` PASS
  (abre pelo dock, salva CNPJ, troca presença sem perder dados, paleta
  acha, zero erros) + captura `/tmp/u1-empresa-tela.png`.
- **2026-10-02 — Auditoria em massa concluída.** 8 agentes auditaram os 30
  apps/áreas restantes: ~123 telas, ~730 botões. Relatórios em
  `/tmp/audit-*.md` (8 arquivos). Plano em 6 fases (A–F, 17 lotes)
  escrito em `dominic/PLANO-TELAS-EM-MASSA.md`, aguardando aprovação
  para iniciar pela Fase A (Lote A1).
- **2026-10-02 — Lote A1 concluído (U4, U11, U12, U14, U16, U18).**
  Jurídico (vitrine + interesse, TODO-BANCO juridico_*), Contabilidade
  (6 módulos + visão rápida), Crédito (abas + form + timeline +
  propostas, rascunho preservado), RH (funcionários + currículos com
  filtro), Reino (link /reino, TODO-ROTA), Calculadora (19 botões,
  ÷0=0). Provas: `node --check` ok + `/tmp/a1-test.py` 27/27 PASS 2×
  seguidas, zero erros; capturas `/tmp/a1-calc.png`, `/tmp/a1-cred.png`.
  Ajustes no caminho: KPZ sem glifo ÷, navegação do teste por título
  (estabilizou flakes headless).
- **2026-10-02 — Lote A2 concluído (U6, U8, U13, U17).** E-mail (3 colunas
  + composer fake, badge de não-lidas), Estoque (busca, CRUD, +/−,
  ajuste inline Enter/Escape/blur com guard, saída-nunca-negativa,
  TODO-BANCO estoque_*), Textos (sidebar + contentEditable serif,
  toolbar execCommand + link, autosave 1,5s + flush, TODO-BANCO
  arquivos_textos), Sócio Comercial (4 abas + modal saque com
  validações + regras de janela no rótulo + cadastro PF/PJ,
  TODO-BANCO multinivel_*). Provas: `node --check` ok +
  `/tmp/a2-test.py` 46 checks PASS 2×, zero erros; capturas
  `/tmp/a2-*.png`. Bugs reais corrigidos: `+` faltando no txtDel,
  render aninhado via focusout (guard isConnected+ajuste), rascunho
  PF/PJ que apagava campos (collect por merge).
- **2026-10-02 — Lote A3 concluído (U3, U5, U9). Fase A completa.**
  Marketing (criar com mock do motor + shimmer + galeria + lightbox +
  download, TODO-BANCO edge/bucket), Mentor (3 abas: pares com
  excluir-confirmado, memórias com filtro, ferramentas; GenUi fora —
  é renderer do commandbar antigo, sem superfície equivalente no
  front novo), Consulta XG (consultar com vitrine+params dinâmicos+
  laudo completo portado, link de venda, carteira com PIX+comprovante,
  histórico com filtros+detalhe, config do agente com RAG+validação;
  TODO-BANCO/RPC/edge/LOJA/ROTA marcados; aba-vender morta não
  portada). Provas: `node --check` ok + `/tmp/a3-test.py` 55 checks
  PASS 3×, zero erros; A1+A2 re-verdes (sem regressão); capturas
  `/tmp/a3-*.png`. Bugs corrigidos: botão Consultar/Enviar travado
  após digitar (toggle direto no input), fetch em file:// (abre aba),
  base de link em file://, ids duplicados nos selects, teste por
  clique-DOM (aba grudada cobria alvos no headless).
- **2026-10-02 — Lote B1 concluído (U7 Campanha, XG, 10 telas).** Lista
  com filtros+KPIs+pausa geral, wizard 4 passos (identidade+indicação,
  público todos/segmento/planilha/lead_ids, entrega, mensagem),
  planilha CSV com prévia (xlsx avisa), kanban arrastável com
  previsões, painel de diagnóstico, fechados/desistentes, config
  completa, mentor de disparo (manual+fixo, listas, mandar pro
  agente). Lógica portada: janela BRT, throttles, previsão, matching
  de critérios sobre mini-Base demo. TODO-BANCO/EDGE/STORAGE/
  REALTIME marcados. Provas: `node --check` ok + `/tmp/b1-test.py`
  47 checks PASS 2×, zero erros; capturas `/tmp/b1-*.png`. Bugs
  corrigidos: botões Ativar-disparo travados após digitar (toggle
  direto), cfgPrev não iniciado, CON_BASE em file://.
- **2026-10-02 — Lote B2 concluído (U15 Rifas, XG, 14 telas/áreas).** Minhas
  com filtros+criar+concluídas/histórico, compartilhar (5 redes+Copia),
  detalhe (KPIs, cotas/ranking/últimas, sorteio auto+manual validado,
  ganhador, venda manual nº/qtd com promo), grade paginada 200/pág com
  busca+filtro+multisseleção, wizard 4 passos (IA demo, capa+galeria 8,
  extras, cotas, promos, fixos completos: pendentes/aprovar/recusar,
  cartões+dívida acumulada, +números, cadastro em sequência),
  pedidos (8 filtros+histórico dias, massa aprovar/rejeitar, reembolso
  total/parcial rateado, reserva vencida→dívida/dispensar, link+WhatsApp),
  dívidas (total, editar, quitar/reabrir/excluir, valor dos fixos,
  quitar tudo, quitadas), números (métricas, SVG 7 dias, recentes),
  disparo (lista CSV/manual/busca/rifa-do-dia/teste real, composer
  bom-dia+followup com mídia, check-in, templates CRUD+variáveis,
  agendamentos CRUD+anti-ban+template-atalho, quem-recebe,
  estágios testar→disparar, pausa geral, envios ao vivo+fila+reenvio,
  galeria, preview), atendimento (kanban DnD+chips, chat+templates+IA
  toggle, dossiê timeline+rifas+fixos+comprovantes), Bricio e Testar
  (cenários, anexo, nova sessão, respostas demo), config (3 switches+
  PIX+salvar). TODO-BANCO (22 tabelas)/RPC (7)/EDGE (7)/STORAGE (2)/
  REALTIME marcados. Provas: `node --check` ok + `/tmp/b2-test.py`
  109 checks PASS 2×, zero erros; B1 re-verde (sem regressão);
  captura `/tmp/b2-rifas.png`. Bugs corrigidos: backtick/ternário e
  parêntese no splice, colisão rfPedidos→rfPeds, `A` sem declarar em
  strict mode, `new Map` sombreado pelo Reino (dedupe manual).
- **2026-10-02 — Lote B3 concluído (U10 Reunião, 4 telas).** Lobby
  estilo Meet (Nova reunião, Agendar, entrar com link/código+Enter),
  lista ao vivo (copiar+check 2s, Desligar 2 toques, Entrar) e
  agendadas (copiar), equipe em chips, modal agendar (validação,
  clamp no teto, sala de espera, fecha fora), histórico (expande,
  análise IA auto na 1ª abertura + Reanalisar, transcrição),
  admin limite 2–50 (avisa se igual, propaga no agendar), chamada
  mock (tiles+pin/destaque, silenciar remoto host, barra completa:
  mic/câmera/tela/recursos/mesmo-ambiente/mão/copiar/sair com menu
  host, card pronta + switch aprovação, espera permitir/negar,
  recursos-contratos + painel seguro, badge assinatura,
  transcrição + dossiê com toggles). TODO-BANCO/RPC/EDGE/REALTIME/
  LIVEKIT/ROTA marcados; mídia real pendente de LiveKit/VPS.
  Provas: `node --check` ok + `/tmp/b3-test.py` 52 checks PASS 2×,
  zero erros; B2 re-verde (sem regressão); captura
  `/tmp/b3-reuniao.png`.
- **2026-10-02 — Lote E1 concluído (G1 parcial: base da Gestão).**
  `V.gestao` com 5 abas (ordem ABAS: Indicações → Vendas → Clientes →
  Parcelas do setup → Mensalidades) + navegador de mês. Indicações:
  KPIs, ranking por cliente, filtros (status/indicador/busca), CRUD,
  iniciar atendimento, enviar p/ Vendas (cria venda negociação),
  reabrir, importar TSV/CSV/JSON sem duplicar, link Indicar +
  detalhe completo (dados, atendimento editável, tentativas,
  reuniões com o indicado, diário 15 dias). Vendas: KPIs, CRUD
  vendedores (código V-*, parceiro com link Venda Realizada), CRUD
  vendas (negociação sem data/plano, status direto), criar cliente
  da venda. Clientes: recebido/a receber, indicações, CRUD, enviar
  p/ implementação (grava `implementacoes`, aba chega no E2).
  Parcelas: selos pago/atrasado/carência/breve/em dia,
  marcar/desmarcar, histórico `gestao_pagamentos_log`. Mensalidades:
  grade 12 meses (competências: horizonte +12, teto 9999, inativo
  pula futuro não-pago), toggle marca na data de vencimento.
  Estado `S.ges` snake_case + `TODO-BANCO` (10 tabelas gestao_*).
  Construído em 5 lanes paralelas (contrato `/tmp/gs-e1/CONTRATO.md`,
  núcleo+harness do coordenador), integrado por âncora. Provas:
  `node --check` ok + `/tmp/gs-e1/gs-e1-test.py` **115/115 PASS,
  0 erros JS**; regressão vizinhas verde (`Transition was skipped`
  é pré-existente no host). Capturas `/tmp/gs-e1/e1-*.png`.
  NOTA 02/10: `dominic/muse/` foi removido (~12:53, provável
  reorganização do Dominic); este arquivo vive agora em
  `backend/muse/TO-DE-LIST-3.md` — acordo-memória atualizado.
- **2026-10-02 — Ajustes: login em vídeo + galeria de fundos.**
  Login (`app.html`, arquivo do Claude, edição mínima por âncora a
  pedido do Dominic): `<video>` fundo `assets/login-fundo.mp4`
  (galaxia-girando-loop, 46 MB, autoplay muted loop playsinline) +
  poster `assets/login-poster.jpg` + véu p/ leitura do card; sem
  movimento => não baixa nem toca. Prova:
  `/tmp/gs-e1/login-video-test.py` (toca 1920x1080, sem novos erros;
  erro supabase é ambiental/pré-existente), captura
  `/tmp/gs-e1/login-video.png`. Aparência (`babel-os.html`): nova
  aba Fundos (`aprFundos`) — grade nativos (g1-g4) + enviados,
  slot "+ Enviar da galeria" SEMPRE visível (múltiplos arquivos,
  só imagem, 1,5 MB cada, trava quota ~4,5 MB), clique aplica
  (`Wall.set`), ✕ exclui (confirma), persiste reload
  (`S.wallUser` + `wallUserInit` no boot). Prova:
  `/tmp/wall/wall-test.py` 10/10, 0 erros. Ref. ícones estilo iOS
  (`Box Box Club iOS 22.png`) e mock `login babel.jpg` recebidos;
  escopo dos ícones a definir com o Dominic.
- **2026-10-02 — Ajuste: vídeo do login removido, roxo fosco no lugar.**
  `app.html`: tag `<video>` + véu + guarda JS removidos; fundo
  `#2e1f4e` fosco, nebulosa oculta, estrelas mantidas. Assets
  `assets/login-fundo.mp4` + `assets/login-poster.jpg` seguem no
  disco (reversível). Prova: `/tmp/wall/login-flat-test.py`
  (sem vídeo, bg rgb(46,31,78), 0 erros), captura
  `/tmp/wall/login-flat.png`.
- **2026-10-02 — Ajuste: dock estilo iOS tab bar (ref. Box Box Club).**
  `babel-os.html` (só CSS, sem mexer no markup): pill escura
  translúcida com blur, ícones brancos chapados (`brightness(0)
  invert(1)`, inativos a 55%), ativo em pill clara (ponto
  indicador removido). Prova: `/tmp/wall/dock-test.py` (50 itens,
  0 erros), captura `/tmp/wall/dock.png`.
- **2026-10-02 — L1 dado baixa (reconciliação Muse-6 T3).** O login novo
  vivia no `app.html` (lista 7 do Claude); prova de ponta a ponta agora:
  `teste-login-dados.py` contra o front :8080 → 5/5 nas asserções de
  login (senha errada mostra erro, app carrega, sessão após reload, sair
  volta ao login), 0 pageerrors/console. Capturas em `/tmp/l1shots/`.
  As 2 falhas do mesmo teste (clientes/agenda "com dados do banco") são
  deriva de seed (`Prova Do Banco` não existe no banco nem no
  `seed-demo.sql`), não do login — follow-up na TO-DE-LIST-6 T4.
- **2026-10-02 — G1 fechado (E2+E3 adotados, Muse-6 T2).** Workflow E2
  (coordenador + 4 lanes) provou por inspeção que o E2+E3 já existia
  completo como `gx*` (~70 cases); peças paralelas não fundidas
  (precedente C2). Provas no front real: `teste-gestao-e2.py` 11/11 +
  `teste-gestao-e3.py` 6/6, 12 capturas, 0 erros da Gestão. Fix: `new
  globalThis.Map` (:8415). Gestão completa: 12 abas + Backup.
