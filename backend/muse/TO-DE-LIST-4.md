# TO-DE-LIST-4 — Muse: agente de ativação única da Babel (Docker + tudo)

Pedido original: "um agente pra ativar a babel com o docker de uma vez."

Problema: hoje são N passos manuais em janelas separadas — `supabase start`
no backend, `iniciar-babel.command` no front (que NÃO sobe o banco, NÃO tem
stop, NÃO tem healthcheck e abre o navegador antes do servidor estar pronto),
`cloudflared` à parte, Vercel à parte. Processos morrem sem aviso (sessão,
reboot, falta de memória) e cada um religa de um jeito.

## Tarefas

- [x] **T1 — `backend/agente-babel/babel.sh`.** Um comando só:
  `up` (Docker/Supabase → espera Kong saudável → cérebro → voz → ouvido →
  front → healthcheck + URLs), `down` (para os 4 da frente; o banco para
  com `down --db`), `status` (tabela + saúde de cada um), `logs`,
  `tunel` (cloudflared http2 + URL atual), `testar` (smoke das 5 portas).
  Idempotente: `up` com tudo rodando só confere, nunca duplica.
- [x] **T2 — `backend/agente-babel/BABEL-AGENTE.md`.** Manual: o que cada
  serviço faz, portas, logs, pidfiles, o que fazer quando algo cai,
  e o aviso de nunca rodar `db push`/deploy sem o Dominic (a CLI está
  linkada no projeto remoto `llsdqtbtuyuqxvepmniy`).
- [x] **T3 — Definição de agente `.claude/agents/babel.md`.** Para o
  Claude Code / Muse operarem a Babel pelo `babel.sh` em vez de comandos
  soltos (sem `pkill` cego, sem `supabase db reset`, sem push).
- [x] **T4 — Prova do zero.** `down` parou os 4 da frente (banco ficou
  de pé); `up` subiu tudo do zero (PIDs novos 6019/6033/6047/6063) e
  `testar` verde nas 5 portas. No caminho, 2 bugs reais achados e
  corrigidos (ver log).

## Log

- **2026-10-02 — T1/T2/T3 concluídas.** `babel.sh` criado com pidfiles em
  `/tmp/babel-*.pid` e logs em `/tmp/babel-*.log` (padrão já usado pelos
  serviços); detecção de "já rodando" por pidfile + porta (adota processos
  órfãos religados à mão). `status`/`testar` provados com os serviços atuais
  (Kong 200, cérebro `fonte:banco ia:openrouter`, voz 200, ouvido 200,
  front 302→app.html). T4 fica para janela sem uso.
- **2026-10-02 — T4 executada ("pode resolver").** `down` + `up` + `testar`
  verdes. Bugs do caminho: (1) `sobe_fundo` travava o `up` para sempre
  (`A && B &` põe a lista inteira no fundo e o `$(...)` espera o pipe;
  pidfile gravava o PID errado) — corrigido (`;` + leitura do pidfile,
  sem `$(...)`); o `up` agora sobe os 4 do zero em ~1 min.
  (2) `groqKey is not defined` (ReferenceError) em `cerebro/assistente.js`
  — sobra da migração Groq→OpenRouter que quebrava TODA pergunta com
  login (HTTP 500 fora do try); corrigido p/ `openrouterKey()` (2 linhas)
  + teste de regressão `backend/local/testes/teste-cerebro-temchave.js`
  (falhou antes, PASS depois). Débito cosmético conhecido: rótulos
  'groq'/`fonte:'groq'` seguem no código (o front depende do valor —
  renomear exige mudança coordenada + teste).
