Pedido (02/10, Dominic) — ALTA PRIORIDADE: "como fazer o mentor nos ouvir (problema desde ontem); o mentor precisa responder tudo e saber de todos os dados" + "ícones dos apps do modo celular mais tecnológicos e sem fundo".

## Diagnóstico
- O cérebro (porta 3078) não tinha NENHUMA chave de IA (`/api/info` → `groq:false`). Sem chave:
  - transcrição (`/api/ouvir`) devolvia 503 → no iPhone (sem reconhecimento no navegador) o Mentor não ouvia nada;
  - as respostas vinham de `responderLocal` sobre `cerebro/dados.js` = dados de EXEMPLO do protótipo, não do banco.
- No Chrome o ouvido é o reconhecimento do Google; se ele falha (rede, serviço bloqueado), não havia plano B.
- Avisos de erro do microfone só apareciam como toast (some se as notificações estiverem desligadas).

## Feito
| Onde | O que |
|---|---|
| `cerebro/supa.js` (novo) | leitura do Supabase com o token de quem pergunta (RLS), fila de 6 leituras, sessão validada no Auth e guardada 5 min |
| `cerebro/retrato.js` (novo) | retrato real do negócio: dinheiro (hoje/ontem/7/30 dias/mês, a receber, atrasadas, vencem hoje), agenda 15 dias, conversas + últimas mensagens, leads, clientes, contratos, produtos, estoque, notas, campanhas, rifas, consultas, dúvidas do agente, memórias; admin: plataforma, chamados, tarefas, implementações. Cache 30 s (5 s se alguma leitura falhou) |
| `cerebro/mentor.js` (novo) | com chave da Groq: IA com ferramentas (abrir_tela, consultar o banco por texto em 16 tabelas, buscar_web, lembrar) + histórico da conversa; sem chave: respostas prontas sobre os dados reais (dinheiro, a receber, agenda hoje/amanhã/semana, conversas, leads, clientes, contratos, produtos e preço por nome, estoque, notas, campanhas, rifas, consultas, dúvidas, agente, empresa, admin) e "e ontem?" reaproveita a pergunta anterior |
| `cerebro/telas.js` (novo) | as 51 telas atuais do NAV para "abre o financeiro" |
| `cerebro/server.js`, `assistente.js` | `/api/perguntar` GET/POST com Authorization+apikey (CORS liberado p/ esses cabeçalhos); `/api/info` diz IA, ouvido e quantos registros reais vê; `/api/ouvir`: Groq com chave, senão Whisper local (porta 3079), converte m4a/mp3 com `afconvert` |
| `babel-banco.js` | cérebro com login (fetch para o cérebro leva o token da sessão); **Ouvido do Mentor**: gravador universal em WAV 16 kHz (sem MediaRecorder) com corte por silêncio; sem reconhecimento no navegador → gravador; reconhecimento falhou (rede/serviço/erro) → troca sozinho para o gravador e escuta de novo; "Testar ouvido" |
| `babel-os.html` | Ajustes › Voz › "Ouvido do Mentor" (Automático / Navegador / Mac) + Testar ouvido; ícones do celular: traço em degradê ciano→violeta com brilho neon, sem caixa de fundo (barra de baixo e folha "Mais"); folha "Mais" de vidro, com rolagem |
| `app.html` | no celular "Sair" e "salvo no banco" foram para o canto de cima (cobriam a barra de baixo e o botão Mais) |
| `backend/stt/` (novo) | whisper.cpp compilado só CPU (Metal travava neste Mac) + modelos `ggml-base-q5_1` e `ggml-small-q5_1`; `iniciar-ouvido.sh` (porta 3079, padrão base); `iniciar-babel.command` sobe o ouvido |

## Testado
- Cérebro com o token de `usuario@babel.local`: "o que pede você", "quanto entrou este mês / e ontem", "quem está me devendo", "agenda de hoje", "quantos clientes", "como está o estoque", "contratos", "abre o financeiro" → respostas corretas com os dados do banco.
- Celular (emulação iPhone 13): ícones novos e folha "Mais" conferidos em foto.

## Pendências / avisos
- Para "responder TUDO" (perguntas abertas) e transcrição rápida e precisa: falta a chave da Groq (grátis em console.groq.com) no `~/.bashrc` como `export GROQ_API_KEY=...` e reiniciar o cérebro. Sem ela, o Mentor só responde sobre os dados e o ouvido usa o Whisper local (mais lento neste Mac).
- O Mac (8 GB, Docker + Chrome + VS Code) reiniciou sozinho por falta de memória durante a compilação; serviços religados depois.

## Teste de ponta a ponta (19:20)
- Whisper local: arquivo falado "Quanto entrou este mês?" → transcrição exata em ~4 s (pelo cérebro).
- App com microfone simulado (Chrome sem reconhecimento, como iPhone): ouviu, transcreveu, perguntou e o Mentor respondeu. A transcrição pelo microfone simulado saiu imprecisa (o dispositivo falso do Chrome distorce a voz sintética); corrigido o que dependia de nós: ganho automático desligado e volume normalizado antes de enviar. Falta conferir com microfone de verdade.
- Corrigido: sob carga o Auth demorava e o Mentor respondia "preciso do login" → o cérebro agora lê quem é direto do token (o banco confere a assinatura em cada leitura).
- O Mac reiniciou 2× por falta de memória durante os testes (Docker + Chrome + VS Code + compilação + navegador de teste). Serviços religados com nohup; ouvido com 2 threads. Novo túnel: ver /private/tmp/babel-tunel.log (a Vercel de teste aponta para o túnel antigo).
