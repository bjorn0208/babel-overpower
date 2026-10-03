Pedido (02/10, Dominic): fazer o modo voz da esfera funcionar em celular (iPhone e Android). Etapa 1 = HTTPS (túnel Cloudflare); Etapa 2 = STT universal por MediaRecorder + POST /api/ouvir quando não houver SpeechRecognition (iPhone, push-to-talk); Etapa 3 = cérebro e voz alcançáveis pelo front. Regras: sem subagentes, não editar `babel-os.html` (injetar por `app.html`/`babel-banco.js`), não editar `.env*`, nada de chave em arquivo novo, log obrigatório.

Decisões do Dominic (02/10):
- Etapa 3 trocada pela proposta do Claude: em vez de abrir cérebro/voz para a rede (0.0.0.0), o `servir.py` repassa `/sb`, `/cerebro` e `/voz` para 54321/3078/3100 → um único endereço HTTPS, servidores continuam presos ao Mac.
- "Crie um Vercel só para testes": front publicado na Vercel com rewrites para o túnel (banco, cérebro e voz seguem no Mac).

---

## Tarefas

| # | Tarefa | Status |
|---|---|---|
| 1 | Transporte HTTPS: `cloudflared` + túnel para o `servir.py` | ✅ |
| 2 | STT universal (MediaRecorder → /api/ouvir) no iPhone; Chrome segue com SpeechRecognition | ✅ (falta o aparelho real + GROQ_API_KEY) |
| 3 | `servir.py` com repasse `/sb`, `/cerebro`, `/voz`; front usa o próprio endereço fora do localhost | ✅ |
| 4 | Vercel de teste (rewrites para o túnel) | ✅ https://babel-os-teste.vercel.app |

## Log

| Data/hora (BRT) | Tarefa | Ação | Evidência | Resultado |
|---|---|---|---|---|
| 02/10 15:40 | 3 | `servir.py`: repasse `/sb`→54321, `/cerebro`→3078, `/voz`→3100 (sem cabeçalhos de navegador, Host reescrito), servidor com threads, bind só em 127.0.0.1 (antes `*:8080`, aberto na rede local). Cérebro e voz seguem presos ao Mac; não foram abertos em 0.0.0.0 | curl: front 200, `/cerebro/api/info` ok, `/voz/health` ok, `/sb/auth` 200 | ✅ |
| 02/10 15:40 | 3 | `config.js` dinâmico: no Mac fala direto com 127.0.0.1; fora dele usa o próprio endereço + `/sb`, `/cerebro`, `/voz`. `babel-banco.js` ajusta `S.cerebroUrl`/`S.edgeUrl` fora do localhost e desliga o tempo real nesse caso (o repasse HTTP não leva websocket) | `node --check` | ✅ |
| 02/10 15:45 | 1 | `cloudflared` 2026.9.3 oficial (assinado, Team 68WVV388M8) baixado para `~/.local/bin` (sem Homebrew). Túnel rápido: `cloudflared tunnel --url http://127.0.0.1:8080` (log em `/private/tmp/babel-tunel.log`). O `servir.py` antigo que estava em `*:8080` foi reiniciado com a versão nova | https://purple-exp-sheffield-super.trycloudflare.com: app 200, cérebro ok, login do banco 200 por HTTPS | ✅ |
| 02/10 15:50 | 2 | `babel-banco.js` › `instalarVozCelular()` (só quando NÃO há SpeechRecognition): `Voice.listen` vira gravação MediaRecorder (`audio/mp4` no iOS, conferido por `isTypeSupported`), envio por POST ao `/api/ouvir` do cérebro; para sozinho após 1,6 s de silêncio ou 20 s; toque de novo envia. "olá Babel" desligado nesse aparelho com aviso curto. Mensagens: 503 sem GROQ_API_KEY → "Transcrição desligada — falta a chave…"; sem rede → "Sem conexão com o cérebro"; vazio → "Não entendi". Saída de áudio do iOS: AudioContext único destravado no 1º toque + áudio mudo; `Edge.say/stop` usam esse contexto (não fecham). Depois do texto segue o fluxo atual (`/api/perguntar`) | emulação iPhone (Chromium, sem SR): HTTPS ok, modo voz instalado, wake desligado, mensagens corretas, cérebro/voz pelo próprio site, "Sair" e "salvo no banco ✓" visíveis, **0 erros** (`backend/local/teste-celular-iphone.py`) | ✅ |
| 02/10 15:55 | 2 | `app.html`: leituras GET/HEAD que voltam 502/503/504 tentam de novo (3×) — o login dispara ~60 consultas e o túnel devolvia 502 em 2 delas | 2 erros → 0 | ✅ |
| 02/10 15:58 | aceite | Android (emulação Pixel 7): SpeechRecognition nativo, `Voice.listen` original intacto; desktop: `teste-banco.py` 14/14 | `backend/local/teste-celular-android.py`, `teste-banco.py` | ✅ |
| 02/10 16:00 | 4 | `backend/deploy/vercel-teste.sh`: monta pasta só com o app (sem cérebro/voz/JARVIS/.venv), `vercel.json` com rewrites `/sb`, `/cerebro`, `/voz` → túnel atual, `npx vercel deploy --prod` com `VERCEL_TOKEN` do ambiente (não salvo em arquivo). Não há login da Vercel nesta máquina | `bash -n` OK | aguardando token |
| 02/10 16:00 | pendente | Não verificável daqui: microfone e transcrição real num iPhone (o WebKit do Playwright não roda no macOS 12) e o `/api/ouvir` real (cérebro sem `GROQ_API_KEY`: hoje devolve 503, tratado). O túnel expõe o app e os dados de teste a quem tiver o link — desligar ao terminar (`pkill cloudflared`) | — | — |
| 02/10 16:05 | 1 | O túnel rápido anterior foi derrubado pela Cloudflare ("Tunnel not found" — túnel sem conta não tem garantia). Novo túnel: https://jurisdiction-hence-faqs-movies.trycloudflare.com (o DNS levou ~40 s para propagar) | app 200 | ✅ |
| 02/10 16:06 | 4 | Vercel de teste publicada com o token do Dominic (usado só na linha de comando, não salvo): projeto `babel-os-teste`, produção **https://babel-os-teste.vercel.app**, rewrites `/sb`, `/cerebro`, `/voz` → túnel | Vercel: app 200, `/cerebro/api/info` ok, login do banco 200, `/voz/health` 200 | ✅ |
| 02/10 16:10 | 4 | Pela Vercel apareciam 7 avisos 502 no console (consultas que passavam na nova tentativa). `app.html`: com o banco atrás do túnel, no máximo 6 requisições simultâneas. Republicado | emulação iPhone contra a Vercel: login, modo voz, "Sair", "salvo no banco ✓", **0 erros** | ✅ |
| 02/10 16:10 | aviso | Quando o túnel reinicia, o endereço muda → rodar `VERCEL_TOKEN=… bash backend/deploy/vercel-teste.sh` de novo. O servidor de teste da porta 8090 foi encerrado pelo limite de tempo da sessão; o front local é o `servir.py` na 8080. O token da Vercel foi colado no chat: revogar ao fim dos testes | — | — |
| 02/10 16:32 | 1 | HTTP 530 no celular: o túnel caiu (QUIC/UDP com timeout "no recent network activity") e religou sozinho. Para estabilizar, túnel reiniciado com `--protocol http2` (TCP): https://gloves-actions-hiring-fog.trycloudflare.com; Vercel republicada para ele | túnel 200; Vercel → cérebro 200, → voz 200 | ✅ |
| 02/10 16:40 | 3 | Servidor de voz (3100) foi encerrado pelo limite de tempo da sessão; religado fora da sessão (`nohup`, log `/private/tmp/babel-voz.log`), como cérebro (3078) e front (8080) | `/health` ok; Vercel → voz 200 | ✅ |
| 02/10 16:55 | login | Tela de login refeita (pedido do Dominic, referência enviada): cartão fosco nas cores da Babel, logo com halo acima, campos com ícone e rótulo, mostrar senha, "Esqueci minha senha" (reset por e-mail), botão Entrar em gradiente ciano→violeta, "Criar conta" (cadastro com nome), Google só aparece se estiver ativado no Auth; fundo de universo em canvas (estrelas em camadas + nebulosas, sem planetas; parado com "reduzir movimento"). Usuário de teste **babel123 / babel123** (= `babel123@babel.local`; o campo aceita usuário sem @), também em `usuarios-teste.sh`. Backup: `backend/local/app.antes-login-novo.html` | prints celular/desktop revisados; login babel123 OK; 0 erros; Vercel republicada | ✅ |
