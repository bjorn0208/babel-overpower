# Inventário Funcional — Plano Carlos (INV + PONTE + ENV)
Gerado em: 2026-10-04 (atualizado: PABX removido)

## Matriz Status 8 Apps

| App | Stack | Build | Dev | Supabase | .env.example | Obs |
|-----|-------|-------|-----|----------|--------------|-----|
| comercial-babel | Vite/Rolldown | ✅ OK | ✅ | ✅ Sim | ✅ | Comercial standalone |
| formulario-babel | Vite | ✅ OK | ✅ | ❌ Não | ✅ | Google Sheets backend |
| marcelo-meinster | Vite | ✅ OK | ✅ | ❌ Não | ✅ | OpenRouter AI |
| plataforma-limpa-vite-react | Vite | ✅ OK | ✅ | ✅ Sim | ✅ | Front principal |
| apresentacao-babel-os | HTML estático | N/A | N/A | ❌ Não | N/A | Deploy Vercel dpl_6SiT3VHm |
| babel-identidade | HTML estático | N/A | N/A | ❌ Não | N/A | Deploy Vercel dpl_CV2boBfq |
| custos-babel | HTML estático | N/A | N/A | ❌ Não | N/A | Deploy Vercel dpl_6ZqsM83E |
| site-plano-rifas | HTML estático | N/A | N/A | ❌ Não | N/A | Deploy Vercel dpl_ARFvApCW |

**Nota:** `babel-instalador` é app WASM (babel-ar.wasm + babel-chat.html), sem index.html root.
**Nota:** `babel-pabx` foi descartado do escopo Babel e removido da pasta.

## Endpoints Compartilhados (Comercial → Supabase)

### RPCs

| RPC | Descrição inferida |
|-----|--------------------|
| agendar_apresentacao | Agendamento de apresentação |
| agendar_retorno | Agendamento de retorno |
| analise_vendedores | Análise de performance vendedores |
| consolidar_dossie | Consolidação de dossiê lead |
| funil_dia | Métricas diárias funil |
| horarios_disponiveis | Slots disponíveis |
| lista_adicionar_leads | Adicionar leads a lista |
| lista_adicionar_por_nicho | Leads por nicho |
| lista_convidar | Convite para lista |
| lista_criar | Criar nova lista |
| lista_puxar_proximo | Puxar próximo lead da lista |
| lista_resetar_cadencia | Reset cadência |
| lista_responder | Responder lead da lista |
| listas_minhas | Minhas listas |
| lote_remover | Remover lote |
| lotes_disponiveis | Lotes disponíveis |
| mudar_status_lead | Alterar status lead |
| nichos_disponiveis | Nichos disponíveis |
| nivel_mentor | Nível mentor vendedor |
| placar | Placar gamificação |
| placar_inicio | Placar início período |
| registrar_contato_posvenda | Contato pós-venda |
| registrar_desfecho | Registrar desfecho conversa |
| saldo_carteira | Saldo carteira vendedor |
| solicitar_saque | Solicitar saque |

### Edge Functions

| Edge Function | Descrição inferida |
|---------------|--------------------|
| analisar-motivadores | Análise motivadores compra |
| comercial-foto | Upload/processamento foto |
| comercial-qualificar | Qualificação lead |
| conhecimento | RAG base conhecimento |
| criar-vendedor | Provisionar vendedor |
| enriquecer | Enriquecimento dados lead |
| enviar-email | Envio email transacional |
| extrair-contato | Extração contato de texto |
| prospectar | Prospecção automática |
| simular | Simulação cenário vendas |
| whatsapp-enviar | Enviar mensagem WhatsApp |
| whatsapp-status | Status entrega WhatsApp |

### Tabelas Supabase Acessadas Diretamente (.from)

agenda_eventos, apresentadores_config, calls, campanhas_ia, carteira_lancamentos, chaves_api, comercial_agendamentos, comercial_campanhas, comercial_inscricoes, comercial_perguntas, comercial_pessoas, comissoes_config, config, funil_fases, funis, ia_chamadas, lead_eventos, leads, lista_contatos, lista_membros, listas, notas_chamada, notificacoes, profiles, rede_chamadas, relatos, roteiros_call, saques, scripts, wa_conversas

## Ações Realizadas
- [x] INV: Inventário funcional build + dev dos apps
- [x] FORM: formulario-babel usa Google Sheets (PLANILHA_WEBAPP_URL), não Supabase
- [x] ENV: .env.example padronizado em todos os apps Node
- [x] x64: node_modules rebuild limpo em todos os apps (fix native binding)
- [x] PONTE: Lista endpoints compartilhados extraída acima
- [x] PABX: Descartado do escopo (removido da pasta)