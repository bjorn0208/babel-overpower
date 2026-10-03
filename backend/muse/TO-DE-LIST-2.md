# TO-DE-LIST-2 — Muse: estruturação e auxílio das pastas

Pedido original: "Pode iniciar na estruturação e auxílio das pastas."

## Tarefas

- [x] **T1 — Mapear a estrutura atual.** Levantar pastas e arquivos de
  `backend/`, `frontend/`, `nova-frontend-babel/` e `dominic/`, identificando
  o papel de cada parte e dependências de caminho relativo.
- [x] **T2 — Reescrever `dominic/README.md` de forma profissional.**
  (Pedido do próprio README na primeira leitura.)
- [x] **T3 — Gerar `dominic/MAPA-DAS-PASTAS.md`.** Documento de localização
  com a árvore, o papel de cada pasta e regras do que não mover.
- [ ] **T4 — Organização física (pendente de aprovação).** Propostas no mapa;
  nenhuma pasta de código foi movida nesta lista por segurança
  (caminhos relativos + sistema em recuperação).

## Log

- **2026-10-02 — T1 concluída.** Mapeamento feito por inspeção direta:
  raiz com `backend/`, `frontend/` (Vite React `plataforma-limpa-vite-react`),
  `nova-frontend-babel/` (protótipo `babel-os.html`), `dominic/` (tarefas),
  `AGENTS.md`, `CLAUDE.md`, `.claude/` (MCP supabase). Sem repositório git.
- **2026-10-02 — T2 concluída.** `dominic/README.md` reescrito: regras da
  central (tarefas nas listas, log obrigatório, docs de apoio, sem mover
  código sem autorização) + árvore da pasta.
- **2026-10-02 — T3 concluída.** `dominic/MAPA-DAS-PASTAS.md` criado com
  árvore completa, papel de cada pasta e regras de segurança.
- **2026-10-02 — T4 aberta.** Achado principal: `nova-frontend-babel/LEIA-ME.txt`
  exige que as imagens fiquem na mesma pasta do `babel-os.html`; mover
  quebraria o protótipo. `frontend/dist/` é saída de build e os `.env*` são
  sensíveis — nada tocado. Propostas de organização registradas no mapa
  aguardando decisão do Dominic.
