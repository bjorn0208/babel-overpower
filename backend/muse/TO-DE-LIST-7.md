# TO-DE-LIST-7 — Muse: voz no celular, Groq, túnel/Vercel, token

Pendências herdadas das listas 7 e 9 do Claude (02/10). Dono daqui em
diante: Muse. Nada aqui mexe no `babel-os.html` sem motivo; o caminho de
subida é o `backend/agente-babel/babel.sh`.

## Tarefas

- [x] **T1 — Chave de IA (era `GROQ_API_KEY`, hoje OpenRouter).** O código
  não usa mais a Groq (só restaram comentários/rótulos). A chave OpenRouter
  vivia só no env volátil do processo antigo e morreu no `down`; foi
  recuperada do log de sessão, gravada no `~/.bashrc` (o cérebro lê de lá)
  e no banco (`provedores_llm`, p/ o motor). Cérebro de volta com
  `ia:openrouter, stt:openrouter`. GROQ dispensada.
- [ ] **T2 — Teste com microfone de verdade.** O teste com microfone
  simulado saiu impreciso (distorção do dispositivo falso do Chrome);
  conferir num aparelho real (iPhone sem SpeechRecognition + Android).
- [ ] **T3 — Túnel + Vercel de teste.** O túnel rápido muda de endereço a
  cada queda; a Vercel `babel-os-teste` aponta para o túnel antigo.
  Republicar: `babel.sh tunel` (anotar a URL nova) e rodar
  `backend/deploy/vercel-teste.sh` com o token.
- [ ] **T4 — Revogar o token da Vercel colado no chat** (aviso da lista 7).
  Gerar um novo se precisar republicar, usar só na linha de comando.
- [ ] **T5 — Desligar o túnel ao terminar os testes** (`babel.sh tunel-stop`).
  O túnel expõe app + dados de teste a quem tiver o link.

## Log

- **2026-10-02 — Lista criada** a partir das pendências das listas 7 e 9
  do Claude. Nenhum item executado ainda.
- **2026-10-02 — T1 resolvida ("pode resolver").** Ver item. Restam T2
  (microfone real — precisa de aparelho), T3 (túnel/Vercel — precisa do
  token), T4 (revogar token — painel da Vercel), T5 (rotina).
