# Inventário Funcional — Plano Carlos (INV + PONTE + ENV)
Gerado em: 2026-10-04

## Matriz Status 9 Apps

| App | Stack | Build | Dev | Supabase | .env.example | Obs |
|-----|-------|-------|-----|----------|--------------|-----|
| babel-pabx | Vite/Rolldown | ✅ OK | ✅ | ✅ Sim | ✅ | PABX + Comercial |
| comercial-babel | Vite/Rolldown | ✅ OK | ✅ | ✅ Sim | ✅ | Comercial standalone |
| formulario-babel | Vite | ✅ OK | ✅ | ❌ Não | ✅ | Google Sheets backend |
| marcelo-meinster | Vite | ✅ OK | ✅ | ❌ Não | ✅ | OpenRouter AI |
| plataforma-limpa-vite-react | Vite | ✅ OK | ✅ | ✅ Sim | ✅ | Front principal |
| apresentacao-babel-os | HTML estático | N/A | N/A | ❌ Não | N/A | Deploy Vercel dpl_6SiT3VHm |
| babel-identidade | HTML estático | N/A | N/A | ❌ Não | N/A | Deploy Vercel dpl_CV2boBfq |
| custos-babel | HTML estático | N/A | N/A | ❌ Não | N/A | Deploy Vercel dpl_6ZqsM83E |
| site-plano-rifas | HTML estático | N/A | N/A | ❌ Não | N/A | Deploy Vercel dpl_ARFvApCW |

**Nota:** `babel-instalador` é app WASM (babel-ar.wasm + babel-chat.html), sem index.html root.

## Tabela RPC Compartilhados (PABX + Comercial → Supabase)

| RPC | App(s) | Descrição inferida |
|-----|--------|--------------------|
| agendar_apresentacao | PABX, Comercial | Agendamento de apresentação |
| agendar_retorno | PABX, Comercial | Agendamento de retorno |
| analise_vendedores | Comercial | Análise de performance vendedores |
| atualizar_avatar | PABX | Avatar do usuário |
| consolidar_dossie | Comercial | Consolidação de dossiê lead |
| funil_dia | Comercial | Métricas diárias funil |
| horarios_disponiveis | PABX, Comercial | Slots disponíveis |
| linhas_status | PABX | Status linhas telefônicas |
| lista_adicionar_leads | Comercial | Adicionar leads a lista |
| lista_adicionar_por_nicho | Comercial | Leads por nicho |
| lista_convidar | Comercial | Convite para lista |
| lista_criar | Comercial | Criar nova lista |
| lista_puxar_proximo | Comercial | Puxar próximo lead da lista |
| lista_resetar_cadencia | Comercial | Reset cadência |
| lista_responder | Comercial | Responder lead da lista |
| listas_minhas | Comercial | Minhas listas |
| lote_remover | Comercial | Remover lote |
| lotes_disponiveis | Comercial | Lotes disponíveis |
| mudar_status_lead | PABX, Comercial | Alterar status lead |
| nichos_disponiveis | Comercial | Nichos disponíveis |
| nivel_mentor | Comercial | Nível mentor vendedor |
| placar | Comercial | Placar gamificação |
| placar_inicio | Comercial | Placar início período |
| puxar_proximo_lead | PABX | Puxar próximo lead |
| registrar_contato_posvenda | Comercial | Contato pós-venda |
| registrar_desfecho | PABX, Comercial | Registrar desfecho conversa |
| resumo_sessao | PABX | Resumo sessão call |
| saldo_carteira | Comercial | Saldo carteira vendedor |
| solicitar_saque | Comercial | Solicitar saque |
| soltar_lead | PABX | Soltar lead devolve pool |
| wa_ligar_lead | PABX | Ligar via WhatsApp |
| wa_marcar_lida | PABX | Marcar mensagem lida WA |

## Edge Functions Compartilhadas

| Edge Function | App(s) | Descrição inferida |
|---------------|--------|--------------------|
| analisar-motivadores | Comercial | Análise motivadores compra |
| babelos | PABX | Sistema operacional Babel |
| comercial-foto | Comercial | Upload/processamento foto |
| comercial-qualificar | Comercial | Qualificação lead |
| conhecimento | PABX, Comercial | RAG base conhecimento |
| criar-vendedor | Comercial | Provisionar vendedor |
| enriquecer | Comercial | Enriquecimento dados lead |
| enviar-email | Comercial | Envio email transacional |
| extrair-contato | Comercial | Extração contato de texto |
| prospectar | Comercial | Prospecção automática |
| simular | Comercial | Simulação cenário vendas |
| whatsapp-enviar | PABX | Enviar mensagem WhatsApp |
| whatsapp-status | PABX | Status entrega WhatsApp |

## Tabelas Supabase Acessadas Diretamente (.from)

agenda_eventos, apresentadores_config, calls, campanhas_ia, carteira_lancamentos, chaves_api, comercial_agendamentos, comercial_campanhas, comercial_inscricoes, comercial_perguntas, comercial_pessoas, comissoes_config, config, funil_fases, funis, ia_chamadas, lead_eventos, leads, lista_contatos, lista_membros, listas, notas_chamada, notificacoes, profiles, rede_chamadas, relatos, roteiros_call, saques, scripts, wa_conversas

## Ações Realizadas
- [x] INV: Inventário funcional build + dev dos 9 apps
- [x] PABX: babel-pabx + comercial-babel conectados Supabase local (URL http://127.0.0.1:54321)
- [x] FORM: formulario-babel usa Google Sheets (PLANILHA_WEBAPP_URL), não Supabase
- [x] ENV: .env.example padronizado em todos os apps Node
- [x] x64: node_modules rebuild limpo em todos os apps (fix native binding)
- [x] PONTE: Lista endpoints compartilhados extraída acima