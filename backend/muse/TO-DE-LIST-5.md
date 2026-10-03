# TO-DE-LIST-5 — Muse: organização física das pastas

Pedido original: "restruturação nas pastas, organize" (fecha o T4 da TO-DE-LIST-2).

Achados que motivaram: `backend/local/` com 13 snapshots `*.antes-*` (~9 MB)
misturados a scripts e testes; `frontend/` com `.bak` na raiz; projeto
canônico SEM git; Babel espalhada em 5 lugares sem índice; `MAPA-DAS-PASTAS.md`
desatualizado (listas do Muse mudaram de `dominic/muse/` para `backend/muse/`).

## Tarefas

- [x] **T1 — `backend/local/`: `*.antes-*` → `_backups/`.** 13 arquivos,
  nenhum importado por código algum (conferido por grep). Seguem no disco
  e fora do git (ver `.gitignore`).
- [x] **T2 — `backend/local/testes/`.** 13 `teste-*.py` + `usuarios-teste.sh`
  movidos para a subpasta; docstrings atualizadas (`backend/local/testes/…`).
  Uso agora: `python3 backend/local/testes/teste-banco.py`.
- [x] **T3 — `frontend/_arquivo-2026-09-29/`.** Os 2 `.bak` da raiz movidos
  (dotenv nunca lia esses arquivos; comportamento idêntico).
- [x] **T4 — `MAPA-GERAL-BABEL.md` na raiz.** Índice dos 5 lugares da Babel:
  o que é vivo, legado, arquivo ou outro projeto + regras.
- [x] **T5 — `dominic/TODO-INDICE.md`.** Índice de todas as listas (Muse 1–7,
  Claude 1–9), estado de cada uma e fila sugerida.
- [x] **T6 — `git init` + `.gitignore` na raiz.** Sem commit (commit só com
  o Dominic). Ignorados: `node_modules/`, `dist/`, `.env*`, `_backups/`,
  venvs, caches, builds do whisper, modelos `.bin`, estado da CLI.
- [x] **T7 — Atualizar `dominic/MAPA-DAS-PASTAS.md`.** Nota de atualização
  com os novos caminhos (listas, testes, backups, agente).
- [x] **T8 — Commit inicial (com o Dominic).** `fa26123` — 3353 arquivos,
  sem segredos (scan no staged: só a palavra `service_role` em SQL),
  sem gitlinks (whisper.cpp ignorado + pin em `stt/whisper.cpp-VERSION`;
  JARVIS fora por ter repo próprio). `_backups/` mantido no disco por
  enquanto (fora do git); apagar quando o git der confiança.

## Log

- **2026-10-02 — T1–T7 concluídas.** Movidos 13 backups, 14 arquivos de
  teste, 2 `.bak`; nenhum código referencia os caminhos antigos (grep em
  `deploy/`, `local/*.sh`, `iniciar-babel.*` e go-live: só a docstring do
  próprio `usuarios-teste.sh`, atualizada). `git init` ok, nada commitado.
