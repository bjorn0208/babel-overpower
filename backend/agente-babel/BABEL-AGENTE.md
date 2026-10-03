# Agente Babel — ativação única (TO-DE-LIST-4)

Um comando sobe a Babel inteira, do Docker ao front:

```bash
bash backend/agente-babel/babel.sh up --abrir
```

## Serviços (ordem de subida)

| Serviço | O que é | Porta | Teste |
|---|---|---|---|
| db | Supabase local (Docker, projeto `sistemababel-local`) | 54321 | `GET /rest/v1/` → 200 |
| cerebro | `nova-frontend-babel/cerebro/server.js` (node) | 3078 | `GET /api/info` → 200 |
| voz | `edge-tts/server.py` (vozes BR Jarvis/Francisca) | 3100 | `GET /` → 200 |
| ouvido | Whisper local `backend/stt` (só CPU neste Mac) | 3079 | `GET /` → 200 |
| front | `nova-frontend-babel/servir.py` (app + proxy `/sb /cerebro /voz`) | 8080 | `GET /` → 302 → `app.html` |

App: http://localhost:8080/ — login `babel123` / `babel123`
(`= babel123@babel.local`; também `usuario@babel.local` / `admin@babel.local`,
senha `Teste@123456`).

## Comandos

- `up [--abrir] [serviços...]` — sobe tudo (ou só os listados). **Idempotente:**
  o que já está no ar é adotado (vira pidfile), nunca duplicado.
- `down [--db] [serviços...]` — para a frente; com `--db` para o banco junto.
  Para reiniciar só o cérebro: `babel.sh down cerebro && babel.sh up cerebro`.
- `status` — tabela PID + saúde de cada um. `testar` — o mesmo, com exit code.
- `logs <cerebro|voz|ouvido|front|tunel>` — segue o log.
- `tunel` / `tunel-stop` — túnel Cloudflare p/ testar no celular (a URL muda a
  cada queda; depois republicar a Vercel — TO-DE-LIST-7 T3).

Pidfiles `/tmp/babel-*.pid`, logs `/tmp/babel-*.log` (somem no reboot, como os
processos — `up` recria tudo).

## Quando algo cai

1. `babel.sh status` diz quem está fora do ar.
2. `babel.sh logs <serviço>` mostra o erro (últimas 50 linhas + segue).
3. `babel.sh up <serviço>` religa só ele.
4. Se o Mac reiniciou sozinho (8 GB + Docker + Chrome + VS Code estoura a
   memória): feche o VS Code, rode `babel.sh up` e confira com `testar`.

## Proibido (linhas vermelhas)

- `supabase db push`, `db reset`, `functions deploy` — a CLI está linkada no
  projeto **remoto** `llsdqtbtuyuqxvepmniy`. Banco local se recarrega SÓ com
  `backend/local/restaurar-local.sh`, e só com o Dominic junto.
- `pkill node/python` cego — mata coisa alheia. Use `babel.sh down`.
- Chave (`GROQ_API_KEY`, tokens) em arquivo do projeto — só no ambiente
  (`~/.bashrc`, linha de comando).
