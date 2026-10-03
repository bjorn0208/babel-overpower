 Responda em tres linhas. Primeiro passo é entender a
  minha necessidade, eu estou com back e front novo,
  motor do agente todos com concertos para ser feito e
  preciso fazer deploy daqui a dez hrs. o plano consiste
  em montarmos em docker e testarmos para entao subirmos
  para a nuvem. O seu trabalho é ir na internet buscar
  maneiras de como fazer ativacao de sistemas, vai
  entender o novo front perguntando para mim, pois ha
  coisas nele que nao tinha no antigo, vai me provar que
  vai saber fazer funcionar o servico, ira usar o sonnet
  para pesquisa  e o opus 5.5 para execucao e vai me
  entregar o sistema pronto.
---

## Status (Claude Code)

| # | Tarefa | Status |
|---|---|---|
| 1 | Entender a necessidade (deploy ≈ 12:00 de 02/10; Docker → testes → nuvem) | ✅ |
| 2 | Pesquisa de ativação de sistemas — **Sonnet** | ✅ `dominic/ATIVACAO-GO-LIVE.md` |
| 3 | Entender o front novo perguntando ao Dominic | 🔄 aguardando respostas |
| 4 | Provar que o serviço funciona (agente respondendo no front novo, no Docker) — **Opus 5.5** | ⬜ |
| 5 | Entregar o sistema pronto (nuvem) | ⬜ |

## Log

| Data/hora (BRT) | Tarefa | Ação | Resultado |
|---|---|---|---|
| 02/10 ~01:55 | 1 | Pedido entendido e confirmado em 3 linhas | concluída |
| 02/10 ~01:56 | 2 | 1 subagente Sonnet (só leitura, sem subagentes próprios) pesquisou go-live Supabase/Vercel/webhooks; relatório revisado e salvo com notas aplicadas ao Babel | concluída — risco principal: deploy de functions com entrypoint em subpasta (CLI #3676/#3426) |
| 02/10 02:12 | 3 | Front novo × antigo: novidades = Início (painéis), Contatos (separado de Clientes), **Meu dia**, **"Como a Aurora atendeu"** (qualidade), "Leitura e uso" (ajustes), 8 áreas (Rede, Vender, Atender, Entregar, Cobrar, Fiscal, Pessoas, Mídias), esfera por voz com memória ("lembre que…"). Ausentes no novo: rifas, campanha, reunião, consulta, jurídico, RH, marketing, mentor, curadoria/gestão (admin) | perguntas enviadas ao Dominic |
| 02/10 02:16 | 3 | Comparativo front novo × antigo × `frontend/aplicativos` (pedido do Dominic) → `dominic/COMPARATIVO-FRONT.md`. Novo: 14 telas (novas: Meu dia = fila de trabalho do funcionário; "Como a Aurora atendeu" = qualidade do agente; poderes/regras/dúvidas do agente; esfera de voz). Não vieram: 22 apps de tenant (rifas, campanha, reunião, consulta, jurídico, RH, marketing, mentor…), 15 de admin, 13 rotas públicas e login; `aplicativos/` são 9 sites independentes | concluída — falta decidir o que é obrigatório hoje |
| 02/10 02:39 | 3 | Lidos os briefings `NOVO-FRONTEND-BABEL-OS.md` e `FRONTEND-BABEL-OS (1).md`: protótipo = Onda 1 do empresário; ausentes são fundidos/arquivados/Ondas 2–4; Onda 0 exige schema novo (só `cargos` e `gestao_chamados` existem). Seção 5 adicionada ao comparativo | concluída |
