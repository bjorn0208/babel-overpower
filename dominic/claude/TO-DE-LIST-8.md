Pedido (02/10, Dominic): "bora finalizar por aqui as telas, leia o código do muse e continue o trabalho dele. crie as telas e nao teste, os testes ficam para o final".

Escopo: Gestão E2/E3 (continuação do E1 do Muse) + sobras da Fase F (marca no login, navegação por papel, Ajustes LGPD, Produtos).
Sem teste de navegador, como pedido. Feito só `node --check` nos scripts e uma checagem estática de funções/ações sem dono.

---

## Tarefas

| # | Tarefa | Status |
|---|---|---|
| 1 | Gestão · Painel (faturamento e previsão em 12 meses, setup por mês e por cliente, atividade, reuniões do suporte, próximos vencimentos) | feito |
| 2 | Gestão · Implementação (lista, KPIs, filtros, iniciar, enviar ao P&D, retornar, teste realizado → suporte com rodízio, reabrir, histórico, funcionários) | feito |
| 3 | Gestão · P&D (lista, chamados escalados, iniciar, concluir, devolver, notas do programador, diário próprio em `extras.diasProg`) | feito |
| 4 | Gestão · Suporte (acompanhamento de 15 dias, rodízio e equipe, reuniões com clientes) + Chamados (lista, detalhe, linha do tempo, registrar, editar, escalar, devolver, resolver, não resolvido, reabrir) | feito |
| 5 | Gestão · Tarefas do time (quadro, semana, reuniões da equipe com ata e encaminhamentos virando tarefas, por pessoa, pendências da operação) | feito |
| 6 | Gestão · Atividade babel (só leitura; tokens e leads por cliente/mês) | feito |
| 7 | Gestão · Acessos (pedidos, papéis, "No time como", adicionar pessoa por busca, remover) | feito |
| 8 | Gestão · Backup (baixar JSON, restaurar; chamados não são restaurados porque o histórico é imutável) | feito |
| 9 | Gestão ligada ao banco (E1 + E2/E3) no `babel-banco.js` | feito |
| 10 | Login com a marca da Aparência (`branding_sistema`) | feito |
| 11 | Navegação por papel: quem não é admin não vê nem abre telas de admin | feito |
| 12 | Ajustes · exportar meus dados e pedir exclusão da conta (LGPD) | feito |
| 13 | Produtos (tela nova: catálogo, dados, pagamento, mídias, conhecimento) ligada ao banco | feito |

---

## Registro

| Quando | Onde | O que | Verificação |
|---|---|---|---|
| 02/10 17:40 | `babel-os.html` | `GS_ABAS` com 12 abas (Painel, Indicações, Vendas, Clientes, Implementação, P&D, Suporte, Tarefas do time, Parcelas, Mensalidades, Atividade babel, Acessos); `V.gestao` com os ramos novos e botão **Backup** no topo; aba padrão nova = Painel. Código E2/E3 (prefixo `gx`, ~150 KB) entre o fim do bloco do Muse e `function go(view)`. Backup do arquivo anterior: `backend/local/babel-os.antes-gestao-e2.html` | `node --check` OK |
| 02/10 17:40 | `babel-os.html` | `gsCliVerImpl` (era toast "TODO-E2") agora abre a Implementação do cliente; o botão da coluna Implementação em Clientes ganhou `data-id`. `gsClChamadosTxt` usava `fechado_em` (não existe) → usa o status real; `gsClImplDoCli` ignora excluídas. 59 toasts com subtítulo "TODO-BANCO/RPC/E2" da Gestão ficaram com subtítulo vazio | `node --check` OK |
| 02/10 17:40 | `babel-os.html` | Exemplos (seeds) da Gestão só aparecem sem banco; com o `babel-banco` ligado a Gestão começa vazia e recebe as linhas reais (evita gravar exemplo com id falso no banco) | — |
| 02/10 17:40 | `babel-os.html` | Rodízio do suporte no formato real do banco: `gestao_config.rodizioSuporte = {nome, indice}` de quem recebeu por último (igual `calculos.proximoSuporte`) | — |
| 02/10 17:55 | `babel-banco.js` | Gestão no banco: 16 tabelas `gestao_*` pelo motor genérico (ids uuid nascem na tela e vão no insert; apagar = `deleted_at`; id que não for uuid vira uuid e o antigo vai para `id_origem`, com as referências trocadas). `gsUid` da tela passa a gerar uuid. Chamados só por RPC (`gestao_chamado_abrir/mudar/registrar`) e recarga da linha do tempo depois de cada mudança; config por chave (upsert); atividade pela RPC `gestao_atividade_uso`; nomes de acessos/pedidos por `gestao_perfis`; busca de pessoas por `gestao_buscar_perfis`. Só carrega para quem tem papel na Gestão (`gestao_tem_algum_papel`). Backup: `backend/local/babel-banco.antes-gestao.js` | `node --check` OK |
| 02/10 18:05 | `babel-os.html` + `babel-banco.js` | **Produtos** (não existia no front novo): `V.produtos` + NAV/TITLE/ícone. Lista com filtro e busca; detalhe com dados, pagamento (preço, entrada, parcelas oferecidas, parcela travada, link de pagamento que vira item de conhecimento como no app antigo), mídias (upload no bucket `produto-midias`) e conhecimento por tipo. Banco: `produtos`, `produto_conhecimento`, `produto_midias`; depois de gravar chama `sincronizar-blocos` para reindexar o agente | `node --check` OK |
| 02/10 18:05 | `babel-banco.js` | Navegação por papel: quem não é admin da plataforma perde as 15 telas de admin no dock e, se abrir por atalho, vê "Área do administrador". Gestão continua para quem tem papel nela | `node --check` OK |
| 02/10 18:05 | `babel-os.html` + `babel-banco.js` | Ajustes › Seus dados: com banco, "Exportar (JSON)" baixa os dados da conta (RPC `exportar_meus_dados`) e há "Pedir exclusão da conta" (RPC `solicitar_exclusao_conta`, marca o pedido para a equipe concluir no prazo da LGPD) | `node --check` OK |
| 02/10 18:10 | `app.html` | Login lê a marca da Aparência (`branding_sistema`, leitura pública): nome, título/subtítulo do formulário, rodapé de copyright, logo e favicon; guarda no navegador para não piscar. As cores só mudam se o admin trocou as de fábrica (#6366f1/#a855f7/#0b0f1a), para manter o visual Babel aprovado. Backup: `backend/local/app.antes-marca.html` | `node --check` OK |

---

## Para o teste geral (final)

- Gestão como `admin@babel.local`: criar cliente → enviar p/ implementação → iniciar → diário → enviar ao P&D → iniciar/concluir no P&D → teste realizado → suporte (rodízio) → abrir chamado → escalar/devolver/resolver/reabrir; tarefas, reunião da equipe com ata, acessos, backup.
- Conferir no banco: `gestao_implementacoes`, `gestao_suporte_atend`, `gestao_chamados` + `gestao_chamado_eventos`, `gestao_config` (equipe/rodizioSuporte), `gestao_tarefas`.
- Produtos como `usuario@babel.local`: criar, pagamento com link, mídia, conhecimento; ver se `sincronizar-blocos` roda (precisa de agente do usuário).
- Usuário comum: dock sem telas de admin; Ajustes exporta JSON e registra pedido de exclusão.
- Login: trocar marca na Aparência e recarregar o login.

## Inventário de telas (02/10 18:20)

Comparação `frontend/src/apps/{user,admin}` (app antigo) × NAV do front novo (48 telas).

Faltam criar (existiam no app antigo, sem equivalente no front novo):
- Loja de assinatura do tenant (`user/loja`: planos, pacotes extras, implantação, Plus e aba Aplicativos). A "Loja" do front novo é outra coisa: a vitrine de peças ("O que a Aurora sabe vender").
- Chat Treino (`user/chat-teste`): testar o agente com o motor em modo teste, corrigir respostas e gerar a nota de humanização (edge `chat-treino-analisar`).
- Cargos do agente (`user/cargos`): cargos do tenant com bússola, prancheta, regras, canal e ferramentas.

Existem, mas ainda com dados de exemplo:
- Loja (vitrine): usa a constante `PRODS` e repete a tela Produtos, que já está ligada ao banco. Sugestão: a vitrine passar a ler `produtos`.
- Início (luzes `LIGHTS`), Meu dia (`FILA`), Qualidade (`QD`/`RESP`; só "dúvidas" vem do banco).
- RH, Contabilidade, Crédito, E-mail e Reino: não têm banco nem no app antigo.
- Marketing: depende do motor (chave LLM).

Regressão encontrada: duas entregas registradas no TO-DE-LIST-6 não estão no `babel-os.html` atual (o arquivo deve ter sido sobrescrito por uma cópia anterior):
- 15:20 · voz: o Groq continua em Ajustes (chave, modelo e Testar) e a opção "Daniel" (voz em inglês) voltou;
- chat e simulador da Curadoria ligados ao motor (`window.BabelMotor`): `babel-os.html` não chama mais o motor.

## Rodada 2 (02/10 18:40) · "pode fazer"

| Quando | Onde | O que | Verificação |
|---|---|---|---|
| 02/10 18:20 | `babel-os.html` | **Refeito** (tinha sido sobrescrito por uma cópia antiga): chat e simulador da Curadoria pelo motor (`window.BabelMotor`); voz — Groq desligada e fora de Ajustes (chave, modelo, Testar), chave salva apagada do navegador, Jarvis como padrão, opção "Daniel" (inglês) removida, reserva só em português e a voz escolhida não é mais trocada. Backup: `backend/local/babel-os.antes-refazer-voz-motor.html` | `node --check` OK |
| 02/10 18:35 | `babel-os.html` | **Loja Babel** (`V.lojababel`): Aplicativos (disponíveis/instalados, instalar/desinstalar), Meu plano (sem preço, só o plano e o uso do ciclo), Pacotes extras, Plus e Implantação com pedido por PIX + comprovante | `node --check` OK |
| 02/10 18:35 | `babel-os.html` | **Chat Treino** (`V.chattreino`; a chave `treino` já era aba do Agente): produto em foco, conversa com o agente, ✎ corrigir resposta (texto melhor + dica), Analisar com o Mentor (nota antes/depois, pontos fortes, ajustes, diretrizes), sessões anteriores, nova sessão e apagar sessão | `node --check` OK |
| 02/10 18:35 | `babel-os.html` | **Cargos do agente** (`V.cargosag`, prefixo `agc` porque `cg*`/`CG_*` já são do Cargos do admin): lista com os da plataforma (só leitura) e os do tenant (editáveis): nome, com quem conversa, bússola, prancheta (campos com chave/descrição/obrigatório), regras livres, ligar/desligar e ferramentas | `node --check` OK; sem nomes repetidos |
| 02/10 18:35 | `babel-os.html` | Vitrine "Loja": com banco mostra os produtos reais (ficha incompleta = sem preço, sem descrição ou sem conhecimento), tocar numa peça abre o Produtos e "Nova peça" cria o produto; KPI "Mais perguntada" (fixo) vira "Ficha completa" | `node --check` OK |
| 02/10 18:40 | `babel-banco.js` | Loja Babel: plano do dono (`assinaturas_usuario`), `loja_pacotes_extra`/`loja_plus`/`loja_implantacao`, PIX de `config_plataforma`, catálogo pela RPC `apps_visiveis_para_tenant`, instalações em `aplicativos_instalados`, pedido = comprovante no bucket `comprovantes` + RPC `criar_pedido_loja`. Como no app antigo, aplicativo do catálogo (Textos, Consulta, Rifas, Estoque, Reunião) só aparece no dock depois de instalado; admin da plataforma continua vendo tudo. Chat Treino: `window.BabelTreino` (lead + conversa `channel='teste'`, motor `ragentic-processar-inline` em `modo_teste`, `chat_treino_correcoes`, edge `chat-treino-analisar`). Cargos: RPC `cargos_visiveis_tenant`, insert/update só em escopo tenant, `ferramentas_dinamicas` e `cargo_ferramentas` (chave dupla, sincronizado à parte). Backup: `backend/local/babel-banco.antes-3-telas.js` | `node --check` OK |

Causa provável das entregas perdidas: o `babel-os.html` foi salvo inteiro a partir de uma cópia antiga (provavelmente na sessão do Muse) depois das minhas edições das 14:32 e 14:37. Antes de editar, recarregar o arquivo atual do disco.

Para o teste geral: Loja Babel (instalar Rifas e ver o dock; pedido com comprovante aparecendo em Financeiro · Admin), Chat Treino com `usuario@babel.local` (tem agente "Aurora"; precisa de chave LLM para o motor responder), Cargos (criar, editar prancheta, ligar ferramenta; hoje o banco local tem 0 ferramentas ativas).

## Pendências que não são de tela

- "Saúde do motor" do Dashboard segue de exemplo.
- Marketing e testes reais do agente precisam da chave OpenRouter.
- Deploy na nuvem não feito (local primeiro).
